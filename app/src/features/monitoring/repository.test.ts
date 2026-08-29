import { beforeEach, describe, expect, it } from 'vitest'
import {
  AI_STATUS,
  ALERT_STATUSES,
  ALERT_TYPES,
  AUDIO_SOURCES,
  CLASSIFICATION_CODES,
  LOCATION_CODES,
  REVIEW_STATUSES,
  ROLES,
  SEX_CODES,
} from '../../db/codes'
import { AuscultaDB } from '../../db/db'
import type { Assessment, Patient, Recording } from '../../db/types'
import { setDemoMode } from '../demo/demoMode'
import {
  MONITORING_AUDIT_ACTIONS,
  MONITORING_ERRORS,
  MonitoringError,
  PLAN_STATUSES,
  createMonitoringRepository,
  readAlertPayload,
  readPlanDetails,
  type Actor,
} from './repository'

let db: AuscultaDB
let repo: ReturnType<typeof createMonitoringRepository>

const doctor: Actor = { id: 'doc-1', role: ROLES.PRACTITIONER }
const otherDoctor: Actor = { id: 'doc-2', role: ROLES.PRACTITIONER }
const admin: Actor = { id: 'admin-1', role: ROLES.ADMIN }
const worker: Actor = { id: 'worker-a', role: ROLES.HEALTH_WORKER }

const NOW = new Date('2026-08-29T00:00:00.000Z')

beforeEach(() => {
  db = new AuscultaDB(`ausculta-monitoring-${crypto.randomUUID()}`)
  repo = createMonitoringRepository(db)
})

async function seedPatient(overrides: Partial<Patient> = {}): Promise<Patient> {
  const patient: Patient = {
    id: `PT-0001-000${(await db.patients.count()) + 1}`,
    studyId: 'ST-ABCDEFGH12345678',
    name: 'Maria Dela Cruz',
    birthDate: '1978-03-14',
    sex: SEX_CODES.FEMALE,
    assignedPractitionerIds: [doctor.id],
    assignedHealthWorkerIds: [worker.id],
    consent: null,
    respiratoryHistory: [],
    familyHistory: [],
    preferredLanguage: 'en',
    isDemo: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
  await db.patients.add(patient)
  return patient
}

async function seedAssessment(patientId: string, daysAgo: number, isDemo: 0 | 1 = 0) {
  const date = new Date(NOW.getTime() - daysAgo * 86400000).toISOString()
  const assessment: Assessment = {
    id: `asm-${daysAgo}-${crypto.randomUUID()}`,
    patientId,
    assessorId: worker.id,
    date,
    symptoms: [],
    vitals: [],
    reviewStatus: REVIEW_STATUSES.PENDING_REVIEW,
    interfaceLanguage: 'en',
    questionnaireLanguage: 'en',
    questionnaireVersion: '1',
    aiSeverity: {
      score: null,
      category: null,
      modelVersion: null,
      calculatedAt: null,
      thresholdConfigVersion: 1,
      status: 'MODEL_NOT_CONNECTED',
    },
    isDemo,
    createdAt: date,
  }
  await db.assessments.add(assessment)
  return assessment
}

async function seedRecording(
  assessment: Assessment,
  overrides: Partial<Recording> = {},
): Promise<Recording> {
  const recording: Recording = {
    id: `rec-${crypto.randomUUID()}`,
    assessmentId: assessment.id,
    patientId: assessment.patientId,
    locationCode: LOCATION_CODES.R_UPPER,
    audioBlobId: 'blob-1',
    audioSource: AUDIO_SOURCES.DEVICE_WAV_IMPORT,
    importedSampleRate: 16000,
    bitDepth: 16,
    channels: 1,
    durationSec: 20,
    quality: null,
    aiStatus: AI_STATUS.ANALYZED,
    aiClassification: CLASSIFICATION_CODES.ASTHMA,
    aiConfidence: 0.8,
    isDemo: assessment.isDemo,
    createdAt: assessment.date,
    ...overrides,
  }
  await db.recordings.add(recording)
  return recording
}

const draft = (patientId: string) => ({
  patientId,
  intervalDays: 7,
  locationCodes: [LOCATION_CODES.R_UPPER, LOCATION_CODES.L_LOWER],
  startDate: '2026-08-01',
})

// ---------------------------------------------------------------------------

describe('a plan is inert until approved', () => {
  it('is created as a draft', async () => {
    const patient = await seedPatient()
    const plan = await repo.draftPlan(draft(patient.id), doctor)
    expect(plan.status).toBe(PLAN_STATUSES.DRAFT)
  })

  it('is not returned as the active plan while it is a draft', async () => {
    const patient = await seedPatient()
    await repo.draftPlan(draft(patient.id), doctor)
    expect(await repo.activePlanFor(patient.id, doctor)).toBeUndefined()
  })

  it('raises no MISSED_MONITORING alert while it is a draft', async () => {
    // The whole point of the gate: an unapproved plan must not start
    // generating obligations the practitioner never agreed to.
    const patient = await seedPatient()
    await repo.draftPlan(draft(patient.id), doctor)
    await seedAssessment(patient.id, 60)

    const raised = await repo.refreshAlerts(patient.id, NOW)
    expect(raised.map((a) => a.typeCode)).not.toContain(ALERT_TYPES.MISSED_MONITORING)
  })

  it('becomes active on approval, and then does raise it', async () => {
    const patient = await seedPatient()
    const plan = await repo.draftPlan(draft(patient.id), doctor)
    await seedAssessment(patient.id, 60)

    await repo.approvePlan(plan.id, doctor)
    expect((await repo.activePlanFor(patient.id, doctor))?.id).toBe(plan.id)

    const raised = await repo.refreshAlerts(patient.id, NOW)
    expect(raised.map((a) => a.typeCode)).toContain(ALERT_TYPES.MISSED_MONITORING)
  })

  it('archives a previous active plan on approval', async () => {
    // Two active plans asking for different intervals is an instruction a
    // health worker cannot follow.
    const patient = await seedPatient()
    const first = await repo.draftPlan(draft(patient.id), doctor)
    await repo.approvePlan(first.id, doctor)

    const second = await repo.draftPlan({ ...draft(patient.id), intervalDays: 14 }, doctor)
    await repo.approvePlan(second.id, doctor)

    expect((await db.monitoringPlans.get(first.id))?.status).toBe(PLAN_STATUSES.ARCHIVED)
    expect((await repo.activePlanFor(patient.id, doctor))?.id).toBe(second.id)
  })

  it('refuses to approve twice', async () => {
    const patient = await seedPatient()
    const plan = await repo.draftPlan(draft(patient.id), doctor)
    await repo.approvePlan(plan.id, doctor)
    await expect(repo.approvePlan(plan.id, doctor)).rejects.toMatchObject({
      code: MONITORING_ERRORS.ALREADY_APPROVED,
    })
  })

  it('audits drafting and approval separately', async () => {
    const patient = await seedPatient()
    const plan = await repo.draftPlan(draft(patient.id), doctor)
    await repo.approvePlan(plan.id, doctor)

    const codes = (await db.auditLogs.toArray()).map((l) => l.actionCode)
    expect(codes).toContain(MONITORING_AUDIT_ACTIONS.PLAN_DRAFTED)
    expect(codes).toContain(MONITORING_AUDIT_ACTIONS.PLAN_APPROVED)
  })
})

describe('plan validation and permissions', () => {
  it('refuses a health worker writing a plan', async () => {
    const patient = await seedPatient()
    await expect(repo.draftPlan(draft(patient.id), worker)).rejects.toBeInstanceOf(MonitoringError)
  })

  it('refuses a health worker approving one', async () => {
    const patient = await seedPatient()
    const plan = await repo.draftPlan(draft(patient.id), doctor)
    await expect(repo.approvePlan(plan.id, worker)).rejects.toMatchObject({
      code: MONITORING_ERRORS.NOT_PERMITTED,
    })
  })

  it('refuses a plan for a patient the practitioner does not have', async () => {
    const patient = await seedPatient({ assignedPractitionerIds: [otherDoctor.id] })
    await expect(repo.draftPlan(draft(patient.id), doctor)).rejects.toMatchObject({
      code: MONITORING_ERRORS.NOT_FOUND,
    })
  })

  it('refuses a nonsensical interval', async () => {
    const patient = await seedPatient()
    for (const intervalDays of [0, -1, 400]) {
      await expect(
        repo.draftPlan({ ...draft(patient.id), intervalDays }, doctor),
      ).rejects.toMatchObject({ code: MONITORING_ERRORS.INVALID_INTERVAL })
    }
  })

  it('refuses a plan with no locations', async () => {
    const patient = await seedPatient()
    await expect(
      repo.draftPlan({ ...draft(patient.id), locationCodes: [] }, doctor),
    ).rejects.toMatchObject({ code: MONITORING_ERRORS.NO_LOCATIONS })
  })

  it('refuses an end date before the start', async () => {
    const patient = await seedPatient()
    await expect(
      repo.draftPlan({ ...draft(patient.id), endDate: '2026-07-01' }, doctor),
    ).rejects.toMatchObject({ code: MONITORING_ERRORS.INVALID_DATE_RANGE })
  })

  it('lets a health worker read the active plan they must follow', async () => {
    const patient = await seedPatient()
    const plan = await repo.draftPlan(draft(patient.id), doctor)
    await repo.approvePlan(plan.id, doctor)
    expect((await repo.activePlanFor(patient.id, worker))?.id).toBe(plan.id)
  })

  it('does not show a health worker another worker’s patient', async () => {
    const patient = await seedPatient({ assignedHealthWorkerIds: ['worker-b'] })
    const plan = await repo.draftPlan(draft(patient.id), doctor)
    await repo.approvePlan(plan.id, doctor)
    expect(await repo.activePlanFor(patient.id, worker)).toBeUndefined()
  })
})

describe('readPlanDetails', () => {
  it('reads what draftPlan wrote', async () => {
    const patient = await seedPatient()
    const plan = await repo.draftPlan(draft(patient.id), doctor)
    const details = readPlanDetails(plan)
    expect(details?.intervalDays).toBe(7)
    expect(details?.locationCodes).toEqual([LOCATION_CODES.R_UPPER, LOCATION_CODES.L_LOWER])
  })

  it('returns null for a malformed row rather than throwing', async () => {
    // A plan written by an older build should read as "no plan", which is
    // inert, not take down the screen showing it.
    for (const details of [null, 'nonsense', {}, { intervalDays: 'weekly' }, { intervalDays: 7 }]) {
      const plan = {
        id: 'x',
        patientId: 'y',
        practitionerId: 'z',
        status: PLAN_STATUSES.ACTIVE,
        createdAt: '2026-01-01',
        details,
      }
      expect(readPlanDetails(plan)).toBeNull()
    }
  })
})

describe('alerts', () => {
  async function historyWithNewFinding(patient: Patient) {
    const first = await seedAssessment(patient.id, 30)
    await seedRecording(first, { aiClassification: CLASSIFICATION_CODES.HEALTHY })
    const second = await seedAssessment(patient.id, 1)
    await seedRecording(second, { aiClassification: CLASSIFICATION_CODES.ASTHMA })
  }

  it('raises an alert from the engine and stores it', async () => {
    const patient = await seedPatient()
    await historyWithNewFinding(patient)

    const raised = await repo.refreshAlerts(patient.id, NOW)
    expect(raised.map((a) => a.typeCode)).toContain(ALERT_TYPES.NEW_ABNORMAL)
    expect(await db.alerts.count()).toBe(raised.length)
  })

  it('stores evidence as data, never as a sentence', async () => {
    const patient = await seedPatient()
    await historyWithNewFinding(patient)

    const [alert] = await repo.refreshAlerts(patient.id, NOW)
    expect(alert).toBeDefined()
    if (alert === undefined) return

    const payload = readAlertPayload(alert)
    expect(payload.locationCode).toBe(LOCATION_CODES.R_UPPER)
    // No prose anywhere in the row: the screen supplies the words.
    expect(alert.message).not.toMatch(/[a-z] [a-z]+ [a-z]+ [a-z]/)
  })

  it('does not raise the same standing alert twice', async () => {
    const patient = await seedPatient()
    await historyWithNewFinding(patient)

    await repo.refreshAlerts(patient.id, NOW)
    const second = await repo.refreshAlerts(patient.id, NOW)
    expect(second).toEqual([])
  })

  it('can raise it again once it has been closed', async () => {
    const patient = await seedPatient()
    await historyWithNewFinding(patient)

    const [alert] = await repo.refreshAlerts(patient.id, NOW)
    if (alert === undefined) return
    await repo.closeAlert(alert.id, 'Reviewed, no action needed.', doctor)

    const again = await repo.refreshAlerts(patient.id, NOW)
    expect(again.map((a) => a.typeCode)).toContain(ALERT_TYPES.NEW_ABNORMAL)
  })

  it('reads a legacy row that stored prose without crashing', () => {
    const payload = readAlertPayload({
      id: 'a',
      patientId: 'p',
      typeCode: ALERT_TYPES.NEW_ABNORMAL,
      status: ALERT_STATUSES.NEW,
      message: 'Patient is deteriorating',
      createdAt: '2026-01-01',
    })
    expect(payload.params).toEqual({})
    expect(payload.locationCode).toBeUndefined()
  })
})

describe('alert scoping', () => {
  async function alertFor(patient: Patient) {
    const first = await seedAssessment(patient.id, 30)
    await seedRecording(first, { aiClassification: CLASSIFICATION_CODES.HEALTHY })
    const second = await seedAssessment(patient.id, 1)
    await seedRecording(second, { aiClassification: CLASSIFICATION_CODES.ASTHMA })
    await repo.refreshAlerts(patient.id, NOW)
  }

  it('shows a practitioner only their own patients’ alerts', async () => {
    const mine = await seedPatient()
    const theirs = await seedPatient({
      id: 'PT-9999-9999',
      assignedPractitionerIds: [otherDoctor.id],
    })
    await alertFor(mine)
    await alertFor(theirs)

    const rows = await repo.openAlerts(doctor)
    expect(rows.map((r) => r.patient.id)).toEqual([mine.id])
  })

  it('shows an admin everything', async () => {
    const mine = await seedPatient()
    const theirs = await seedPatient({
      id: 'PT-9999-9998',
      assignedPractitionerIds: [otherDoctor.id],
    })
    await alertFor(mine)
    await alertFor(theirs)
    expect((await repo.openAlerts(admin)).length).toBeGreaterThanOrEqual(2)
  })

  it('gives a health worker no alert queue', async () => {
    const patient = await seedPatient()
    await alertFor(patient)
    expect(await repo.openAlerts(worker)).toEqual([])
  })

  it('refuses a health worker closing an alert', async () => {
    const patient = await seedPatient()
    await alertFor(patient)
    const [row] = await repo.openAlerts(doctor)
    if (row === undefined) return

    await expect(repo.closeAlert(row.alert.id, 'note', worker)).rejects.toMatchObject({
      code: MONITORING_ERRORS.NOT_PERMITTED,
    })
  })

  it('refuses a practitioner touching another practitioner’s alert', async () => {
    const theirs = await seedPatient({
      id: 'PT-9999-9997',
      assignedPractitionerIds: [otherDoctor.id],
    })
    await alertFor(theirs)
    const [row] = await repo.openAlerts(admin)
    if (row === undefined) return

    await expect(repo.closeAlert(row.alert.id, 'note', doctor)).rejects.toMatchObject({
      code: MONITORING_ERRORS.NOT_FOUND,
    })
  })

  it('hides seeded alerts while demo mode is off', async () => {
    await setDemoMode(false, db)
    const patient = await seedPatient({ id: 'PT-0009-0009', isDemo: 1 })
    const first = await seedAssessment(patient.id, 30, 1)
    await seedRecording(first, { aiClassification: CLASSIFICATION_CODES.HEALTHY, isDemo: 1 })
    const second = await seedAssessment(patient.id, 1, 1)
    await seedRecording(second, { aiClassification: CLASSIFICATION_CODES.ASTHMA, isDemo: 1 })
    await repo.refreshAlerts(patient.id, NOW)

    expect(await repo.openAlerts(doctor)).toEqual([])
  })
})

describe('acknowledging and closing', () => {
  async function oneAlert() {
    const patient = await seedPatient()
    const first = await seedAssessment(patient.id, 30)
    await seedRecording(first, { aiClassification: CLASSIFICATION_CODES.HEALTHY })
    const second = await seedAssessment(patient.id, 1)
    await seedRecording(second, { aiClassification: CLASSIFICATION_CODES.ASTHMA })
    const [alert] = await repo.refreshAlerts(patient.id, NOW)
    return alert
  }

  it('acknowledges without demanding a note', async () => {
    // Acknowledging is "seen". It does not claim a decision was made.
    const alert = await oneAlert()
    if (alert === undefined) return

    const updated = await repo.acknowledgeAlert(alert.id, doctor)
    expect(updated.status).toBe(ALERT_STATUSES.ACKNOWLEDGED)
    expect(updated.acknowledgedBy).toBe(doctor.id)
  })

  it('keeps an acknowledged alert in the queue', async () => {
    // Seen is not resolved; it should not disappear from view.
    const alert = await oneAlert()
    if (alert === undefined) return
    await repo.acknowledgeAlert(alert.id, doctor)
    expect((await repo.openAlerts(doctor)).length).toBeGreaterThan(0)
  })

  it('requires a note to close, because closing is a decision', async () => {
    const alert = await oneAlert()
    if (alert === undefined) return

    await expect(repo.closeAlert(alert.id, '   ', doctor)).rejects.toMatchObject({
      code: MONITORING_ERRORS.NOTE_REQUIRED,
    })
  })

  it('closes with a note and drops it from the queue', async () => {
    const alert = await oneAlert()
    if (alert === undefined) return

    await repo.closeAlert(alert.id, 'Discussed with the patient; no action needed.', doctor)
    expect(await repo.openAlerts(doctor)).toEqual([])
  })

  it('audits both, and keeps the note out of the log', async () => {
    const alert = await oneAlert()
    if (alert === undefined) return

    await repo.closeAlert(alert.id, 'SECRET_CLINICAL_NOTE', doctor)
    const logs = await db.auditLogs.toArray()
    expect(logs.map((l) => l.actionCode)).toContain(MONITORING_AUDIT_ACTIONS.ALERT_CLOSED)
    expect(JSON.stringify(logs)).not.toContain('SECRET_CLINICAL_NOTE')
  })
})
