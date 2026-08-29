import { beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../../../db/db'
import {
  AI_STATUS,
  AUDIO_SOURCES,
  CONSENT_STATUSES,
  REHAB_ACTIVITY_CODES,
} from '../../../db/codes'
import type { Patient } from '../../../db/types'
import { DEMO_PATIENTS, walkthroughPatientSpec } from '../dataset'
import { readDemoMode, setDemoMode } from '../demoMode'
import { DEMO_FIRST_RUN_META_KEY, ensureFirstRunDemo } from '../firstRun'
import {
  DEMO_SEED_META_KEY,
  aiDisclosureViolation,
  buildDemoRows,
  demoPatientId,
  readDemoSeedMarker,
  resetDemoData,
  seedDemoData,
} from '../seed'
import { visibleRows } from '../visibility'

let db: AuscultaDB

const NOW = Date.parse('2026-08-29T06:00:00.000Z')

beforeEach(() => {
  db = new AuscultaDB(`ausculta-demo-test-${crypto.randomUUID()}`)
})

/** A real patient, to prove demo operations never touch one. */
function realPatient(id = 'PT-REAL-0001'): Patient {
  return {
    id,
    studyId: 'ST-REAL000000000001',
    name: 'Real Patient',
    birthDate: '1990-01-01',
    sex: 'FEMALE',
    assignedPractitionerIds: [],
    assignedHealthWorkerIds: [],
    consent: null,
    respiratoryHistory: [],
    familyHistory: [],
    preferredLanguage: 'en',
    isDemo: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

describe('seedDemoData', () => {
  it('writes the fictional clinic', async () => {
    const result = await seedDemoData(db, { now: NOW })

    expect(result.seeded).toBe(true)
    expect(result.counts.patients).toBe(DEMO_PATIENTS.length)
    expect(await db.patients.count()).toBe(DEMO_PATIENTS.length)
    expect(await db.assessments.count()).toBe(result.counts.assessments)
    expect(await db.recordings.count()).toBe(result.counts.recordings)
    expect(result.counts.recordings).toBeGreaterThan(0)
  })

  it('running twice produces exactly one dataset', async () => {
    const first = await seedDemoData(db, { now: NOW })
    const second = await seedDemoData(db, { now: NOW })

    expect(second.seeded).toBe(false)
    expect(await db.patients.count()).toBe(first.counts.patients)
    expect(await db.assessments.count()).toBe(first.counts.assessments)
    expect(await db.recordings.count()).toBe(first.counts.recordings)
    expect(await db.clinicalReviews.count()).toBe(first.counts.clinicalReviews)
  })

  it('forcing a re-seed still produces exactly one dataset', async () => {
    const first = await seedDemoData(db, { now: NOW })
    const again = await seedDemoData(db, { now: NOW + 86_400_000, force: true })

    expect(again.seeded).toBe(true)
    expect(await db.patients.count()).toBe(first.counts.patients)
    expect(await db.recordings.count()).toBe(first.counts.recordings)
  })

  it('flags every seeded row as demo data', async () => {
    await seedDemoData(db, { now: NOW })

    for (const patient of await db.patients.toArray()) expect(patient.isDemo).toBe(1)
    for (const assessment of await db.assessments.toArray()) expect(assessment.isDemo).toBe(1)
    for (const recording of await db.recordings.toArray()) expect(recording.isDemo).toBe(1)

    expect(await db.patients.where('isDemo').equals(1).count()).toBe(DEMO_PATIENTS.length)
  })

  it('does not switch demo mode on by itself', async () => {
    await seedDemoData(db, { now: NOW })
    await expect(readDemoMode(db)).resolves.toBe(false)
  })

  it('records a seed marker with the counts', async () => {
    const result = await seedDemoData(db, { now: NOW })
    const marker = await readDemoSeedMarker(db)

    expect(marker).not.toBeNull()
    expect(marker?.counts).toEqual(result.counts)
    expect(marker?.seededAt).toBe(new Date(NOW).toISOString())
  })
})

describe('seeded clinical content', () => {
  it('gives every patient recorded consent, with language and text version', async () => {
    await seedDemoData(db, { now: NOW })

    for (const patient of await db.patients.toArray()) {
      expect(patient.consent).not.toBeNull()
      expect(patient.consent?.status).toBe(CONSENT_STATUSES.GRANTED)
      expect(patient.consent?.language).toBeTruthy()
      expect(patient.consent?.textVersion).toBeTruthy()
      expect(patient.consent?.presentedAt).toBeTruthy()
    }
  })

  it('spans a child, adults and an older adult', async () => {
    const years = DEMO_PATIENTS.map(
      (patient) => (NOW - Date.parse(patient.birthDate)) / (365.25 * 24 * 3600 * 1000),
    )
    expect(Math.min(...years)).toBeLessThan(13)
    expect(Math.max(...years)).toBeGreaterThan(65)
    expect(years.filter((age) => age >= 18 && age <= 65).length).toBeGreaterThanOrEqual(3)
  })

  it('gives several patients more than one assessment, so a trend exists', async () => {
    await seedDemoData(db, { now: NOW })
    const multiVisit = DEMO_PATIENTS.filter((patient) => patient.visits.length > 1)
    expect(multiVisit.length).toBeGreaterThanOrEqual(5)

    const walkthrough = walkthroughPatientSpec()
    const theirs = await db.assessments.where('patientId').equals(demoPatientId(walkthrough.seq)).toArray()
    expect(theirs.length).toBeGreaterThanOrEqual(3)
  })

  it('includes an improving and a worsening patient', async () => {
    const scoresFor = (seq: number) =>
      DEMO_PATIENTS.find((patient) => patient.seq === seq)!
        .visits.map((visit) => visit.severity?.score)
        .filter((score): score is number => typeof score === 'number')

    const improving = scoresFor(1) // Marisol
    const worsening = scoresFor(2) // Danilo
    expect(improving.at(-1)!).toBeLessThan(improving[0])
    expect(worsening.at(-1)!).toBeGreaterThan(worsening[0])
  })

  it('has assessments on both sides of the review workflow', async () => {
    await seedDemoData(db, { now: NOW })
    const statuses = (await db.assessments.toArray()).map((a) => a.reviewStatus)

    expect(statuses).toContain('PENDING_REVIEW')
    expect(statuses).toContain('APPROVED')
    expect(await db.clinicalReviews.count()).toBeGreaterThan(0)
  })

  it('covers the varied AI statuses a validator needs to see', async () => {
    await seedDemoData(db, { now: NOW })
    const recordings = await db.recordings.toArray()
    const statuses = new Set(recordings.map((recording) => recording.aiStatus))

    expect(statuses).toContain(AI_STATUS.ANALYZED)
    expect(statuses).toContain(AI_STATUS.INSUFFICIENT_QUALITY)
    expect(statuses).toContain(AI_STATUS.PENDING)
    expect(statuses).toContain(AI_STATUS.MODEL_NOT_CONNECTED)
    // Analysed but inconclusive, and analysed with a finding.
    expect(recordings.some((recording) => recording.uncertainFlag === true)).toBe(true)
    expect(recordings.some((recording) => recording.aiClassification === 'ASTHMA')).toBe(true)
    expect(recordings.some((recording) => recording.aiClassification === 'HEALTHY')).toBe(true)
  })

  it('marks all seeded audio as fictional and never as a device import', async () => {
    await seedDemoData(db, { now: NOW })

    for (const recording of await db.recordings.toArray()) {
      expect(recording.audioSource).toBe(AUDIO_SOURCES.DEMO_FICTIONAL)
      expect(recording.originalFileName).toContain('demo')
      expect(recording.quality).toBeNull()
    }
  })
})

describe('the example breathing plan', () => {
  it('gives the walkthrough patient an approved plan, so the screen is not a dead end', async () => {
    await seedDemoData(db, { now: NOW })

    const plans = await db.rehabPlans.toArray()
    expect(plans).toHaveLength(1)
    expect(plans[0].patientId).toBe(demoPatientId(1))
    expect(plans[0].approvalStatus).toBe('APPROVED')
  })

  it('names activities but invents no clinical dosing', async () => {
    await seedDemoData(db, { now: NOW })
    const details = (await db.rehabPlans.toArray())[0].details as {
      activities: { code: string; frequency?: string; duration?: string; instructions?: string }[]
      actionPlan: unknown
      notes?: string
    }

    // A subset, so it reads as a plan a practitioner chose.
    expect(details.activities.length).toBeGreaterThanOrEqual(2)
    expect(details.activities.length).toBeLessThan(4)
    // Huff coughing is contraindicated in bronchospasm and is not in the code
    // list at all; nothing outside the vetted set may appear here.
    for (const activity of details.activities) {
      expect(Object.values(REHAB_ACTIVITY_CODES)).toContain(activity.code)
      // Frequencies and durations are free text a practitioner writes. Invented
      // ones would be made-up clinical dosing on a screen a patient reads.
      expect(activity.frequency).toBeUndefined()
      expect(activity.duration).toBeUndefined()
      expect(activity.instructions).toBeUndefined()
    }
    // An emergency action plan carries zones, contacts and thresholds. None of
    // those may be invented either.
    expect(details.actionPlan).toBeNull()
    expect(details.notes).toMatch(/not advice/i)
  })

  it('is removed by a reset, along with anything logged against it', async () => {
    await seedDemoData(db, { now: NOW })
    const plan = (await db.rehabPlans.toArray())[0]
    await db.rehabCompletions.put({
      id: 'RC-1',
      rehabPlanId: plan.id,
      patientId: plan.patientId,
      completedAt: '2026-08-20T00:00:00.000Z',
      details: null,
    })

    await resetDemoData(db)

    expect(await db.rehabPlans.count()).toBe(0)
    expect(await db.rehabCompletions.count()).toBe(0)
  })

  it('leaves a real patient’s plan alone', async () => {
    await db.patients.put(realPatient())
    await db.rehabPlans.put({
      id: 'RP-REAL-1',
      patientId: 'PT-REAL-0001',
      practitionerId: 'user-2',
      approvalStatus: 'APPROVED',
      createdAt: '2026-08-01T00:00:00.000Z',
      details: null,
    })
    await seedDemoData(db, { now: NOW })

    await resetDemoData(db)

    expect(await db.rehabPlans.count()).toBe(1)
    await expect(db.rehabPlans.get('RP-REAL-1')).resolves.toBeDefined()
  })
})

describe('AI disclosure rule', () => {
  it('no seeded recording carries a confidence its status forbids', async () => {
    await seedDemoData(db, { now: NOW })

    const violations = (await db.recordings.toArray())
      .map((recording) => ({ id: recording.id, why: aiDisclosureViolation(recording) }))
      .filter((entry) => entry.why !== null)

    expect(violations).toEqual([])
  })

  it('rejects the shapes the rule exists to prevent', () => {
    expect(
      aiDisclosureViolation({
        aiStatus: AI_STATUS.INSUFFICIENT_QUALITY,
        aiConfidence: 0.9,
      }),
    ).not.toBeNull()
    expect(
      aiDisclosureViolation({
        aiStatus: AI_STATUS.INSUFFICIENT_QUALITY,
        aiClassification: 'ASTHMA',
      }),
    ).not.toBeNull()
    expect(
      aiDisclosureViolation({
        aiStatus: AI_STATUS.ANALYZED,
        uncertainFlag: true,
        aiConfidence: 0.8,
      }),
    ).not.toBeNull()
    expect(
      aiDisclosureViolation({
        aiStatus: AI_STATUS.ANALYZED,
        uncertainFlag: true,
        aiClassification: 'ASTHMA',
      }),
    ).not.toBeNull()
    expect(aiDisclosureViolation({ aiStatus: AI_STATUS.PENDING, aiConfidence: 0.5 })).not.toBeNull()
    expect(aiDisclosureViolation({ aiStatus: AI_STATUS.ANALYZED, aiConfidence: 0.5 })).not.toBeNull()
  })

  it('accepts the shapes that are legitimate', () => {
    expect(aiDisclosureViolation({ aiStatus: AI_STATUS.PENDING })).toBeNull()
    expect(aiDisclosureViolation({ aiStatus: AI_STATUS.INSUFFICIENT_QUALITY })).toBeNull()
    expect(
      aiDisclosureViolation({ aiStatus: AI_STATUS.ANALYZED, uncertainFlag: true }),
    ).toBeNull()
    expect(
      aiDisclosureViolation({
        aiStatus: AI_STATUS.ANALYZED,
        aiClassification: 'HEALTHY',
        aiConfidence: 0.83,
      }),
    ).toBeNull()
  })

  it('builds rows that already satisfy the rule before they reach the database', () => {
    const rows = buildDemoRows(NOW)
    for (const recording of rows.recordings) {
      expect(aiDisclosureViolation(recording)).toBeNull()
    }
  })
})

describe('resetDemoData', () => {
  it('removes every demo row', async () => {
    await seedDemoData(db, { now: NOW })
    await resetDemoData(db)

    expect(await db.patients.count()).toBe(0)
    expect(await db.assessments.count()).toBe(0)
    expect(await db.recordings.count()).toBe(0)
    expect(await db.clinicalReviews.count()).toBe(0)
    expect(await db.audioBlobs.count()).toBe(0)
    expect(await db.appMeta.get(DEMO_SEED_META_KEY)).toBeUndefined()
  })

  it('leaves a real patient completely untouched', async () => {
    const real = realPatient()
    await db.patients.put(real)
    await seedDemoData(db, { now: NOW })

    await resetDemoData(db)

    expect(await db.patients.count()).toBe(1)
    await expect(db.patients.get(real.id)).resolves.toEqual(real)
  })

  it('leaves a real assessment, recording and review untouched', async () => {
    await db.patients.put(realPatient())
    await db.assessments.put({
      id: 'AS-REAL-1',
      patientId: 'PT-REAL-0001',
      assessorId: 'user-1',
      date: '2026-08-02T00:00:00.000Z',
      symptoms: [],
      vitals: [],
      reviewStatus: 'APPROVED',
      interfaceLanguage: 'en',
      questionnaireLanguage: 'en',
      questionnaireVersion: 'v1',
      aiSeverity: {
        score: null,
        category: null,
        modelVersion: null,
        calculatedAt: null,
        thresholdConfigVersion: 1,
        status: 'MODEL_NOT_CONNECTED',
      },
      isDemo: 0,
      createdAt: '2026-08-02T00:00:00.000Z',
    })
    await db.recordings.put({
      id: 'RC-REAL-1',
      assessmentId: 'AS-REAL-1',
      patientId: 'PT-REAL-0001',
      locationCode: 'R_UPPER',
      audioBlobId: 'AB-REAL-1',
      audioSource: 'DEVICE_WAV_IMPORT',
      importedSampleRate: 16000,
      bitDepth: 16,
      channels: 1,
      durationSec: 8,
      quality: null,
      aiStatus: 'PENDING',
      isDemo: 0,
      createdAt: '2026-08-02T00:00:00.000Z',
    })
    await db.audioBlobs.put({ id: 'AB-REAL-1', blob: new Blob(['real'], { type: 'audio/wav' }) })
    await db.clinicalReviews.put({
      id: 'CR-REAL-1',
      assessmentId: 'AS-REAL-1',
      practitionerId: 'user-2',
      aiResultSnapshot: null,
      interpretationCode: 'CONFIRMED',
      notes: 'Real review.',
      reviewedAt: '2026-08-03T00:00:00.000Z',
    })

    await seedDemoData(db, { now: NOW })
    await resetDemoData(db)

    expect(await db.assessments.count()).toBe(1)
    expect(await db.recordings.count()).toBe(1)
    expect(await db.clinicalReviews.count()).toBe(1)
    expect(await db.audioBlobs.count()).toBe(1)
    await expect(db.audioBlobs.get('AB-REAL-1')).resolves.toBeDefined()
  })

  it('never deletes an audio blob a real recording still points at', async () => {
    await seedDemoData(db, { now: NOW })
    const shared = (await db.recordings.toArray())[0].audioBlobId

    // A real recording adopting a demo blob id should keep that blob alive.
    await db.recordings.put({
      id: 'RC-REAL-SHARED',
      assessmentId: 'AS-REAL-1',
      patientId: 'PT-REAL-0001',
      locationCode: 'L_LOWER',
      audioBlobId: shared,
      audioSource: 'DEVICE_WAV_IMPORT',
      importedSampleRate: 16000,
      bitDepth: 16,
      channels: 1,
      durationSec: 8,
      quality: null,
      aiStatus: 'PENDING',
      isDemo: 0,
      createdAt: '2026-08-02T00:00:00.000Z',
    })

    await resetDemoData(db)

    await expect(db.audioBlobs.get(shared)).resolves.toBeDefined()
  })

  it('turns demo mode off, so nothing points at records that are gone', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)

    await resetDemoData(db)

    await expect(readDemoMode(db)).resolves.toBe(false)
  })

  it('is safe to run on a database that was never seeded', async () => {
    await db.patients.put(realPatient())
    await expect(resetDemoData(db)).resolves.toBeDefined()
    expect(await db.patients.count()).toBe(1)
  })
})

describe('ensureFirstRunDemo', () => {
  it('seeds and switches on for a device with no real patients', async () => {
    const result = await ensureFirstRunDemo(db, NOW)

    expect(result.outcome).toBe('seeded')
    expect(await db.patients.count()).toBe(DEMO_PATIENTS.length)
    await expect(readDemoMode(db)).resolves.toBe(true)
  })

  it('never seeds a device that already holds a real patient', async () => {
    await db.patients.put(realPatient())

    const result = await ensureFirstRunDemo(db, NOW)

    expect(result.outcome).toBe('declined-real-data-present')
    expect(await db.patients.count()).toBe(1)
    await expect(readDemoMode(db)).resolves.toBe(false)
  })

  it('does not switch demo mode back on after someone turned it off', async () => {
    await ensureFirstRunDemo(db, NOW)
    await setDemoMode(false, db)

    const second = await ensureFirstRunDemo(db, NOW)

    expect(second.outcome).toBe('already-decided')
    await expect(readDemoMode(db)).resolves.toBe(false)
  })

  it('records its decision even when it declines, so it cannot fire later', async () => {
    await db.patients.put(realPatient())
    await ensureFirstRunDemo(db, NOW)

    expect(await db.appMeta.get(DEMO_FIRST_RUN_META_KEY)).toBeDefined()

    await db.patients.clear()
    const again = await ensureFirstRunDemo(db, NOW)
    expect(again.outcome).toBe('already-decided')
    expect(await db.patients.count()).toBe(0)
  })
})

describe('demo rows stay hidden when demo mode is off', () => {
  it('hides seeded patients, assessments and recordings', async () => {
    await db.patients.put(realPatient())
    await seedDemoData(db, { now: NOW })

    expect(await visibleRows(db.patients, false).count()).toBe(1)
    expect(await visibleRows(db.assessments, false).count()).toBe(0)
    expect(await visibleRows(db.recordings, false).count()).toBe(0)

    expect(await visibleRows(db.patients, true).count()).toBe(DEMO_PATIENTS.length + 1)
  })
})
