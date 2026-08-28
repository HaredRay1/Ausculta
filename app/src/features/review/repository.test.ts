import { beforeEach, describe, expect, it } from 'vitest'
import {
  AI_STATUS,
  AUDIO_SOURCES,
  CLASSIFICATION_CODES,
  INTERPRETATION_CODES,
  LOCATION_CODES,
  REVIEW_STATUSES,
  ROLES,
  SEX_CODES,
} from '../../db/codes'
import { AuscultaDB } from '../../db/db'
import type { Assessment, Patient, Recording } from '../../db/types'
import { setDemoMode } from '../demo/demoMode'
import {
  REVIEW_AUDIT_ACTIONS,
  REVIEW_ERRORS,
  ReviewError,
  STATUS_FOR_INTERPRETATION,
  createReviewRepository,
  triageScore,
  type Actor,
} from './repository'

let db: AuscultaDB
let repo: ReturnType<typeof createReviewRepository>

const practitioner: Actor = { id: 'doc-1', role: ROLES.PRACTITIONER }
const otherPractitioner: Actor = { id: 'doc-2', role: ROLES.PRACTITIONER }
const admin: Actor = { id: 'admin-1', role: ROLES.ADMIN }
const healthWorker: Actor = { id: 'worker-a', role: ROLES.HEALTH_WORKER }

beforeEach(() => {
  db = new AuscultaDB(`ausculta-review-${crypto.randomUUID()}`)
  repo = createReviewRepository(db)
})

async function seedPatient(overrides: Partial<Patient> = {}): Promise<Patient> {
  const patient: Patient = {
    id: `PT-0001-000${(await db.patients.count()) + 1}`,
    studyId: `ST-${crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`,
    name: 'Maria Dela Cruz',
    birthDate: '1978-03-14',
    sex: SEX_CODES.FEMALE,
    assignedPractitionerIds: [practitioner.id],
    assignedHealthWorkerIds: [healthWorker.id],
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

async function seedAssessment(
  patientId: string,
  overrides: Partial<Assessment> = {},
): Promise<Assessment> {
  const assessment: Assessment = {
    id: `asm-${crypto.randomUUID()}`,
    patientId,
    assessorId: healthWorker.id,
    date: '2026-08-20T09:00:00.000Z',
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
    isDemo: 0,
    createdAt: '2026-08-20T09:00:00.000Z',
    ...overrides,
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
    audioBlobId: `blob-${crypto.randomUUID()}`,
    audioSource: AUDIO_SOURCES.DEVICE_WAV_IMPORT,
    importedSampleRate: 16000,
    bitDepth: 16,
    channels: 1,
    durationSec: 20,
    quality: null,
    aiStatus: AI_STATUS.ANALYZED,
    aiClassification: CLASSIFICATION_CODES.ASTHMA,
    aiConfidence: 0.82,
    uncertainFlag: false,
    modelVersion: 'impulse-1-v5',
    isDemo: assessment.isDemo,
    createdAt: assessment.date,
    ...overrides,
  }
  await db.recordings.add(recording)
  return recording
}

const confirmInput = {
  interpretationCode: INTERPRETATION_CODES.CONFIRMED,
  notes: '',
}

// ---------------------------------------------------------------------------
// The guarantee the whole feature rests on.
// ---------------------------------------------------------------------------

describe('AI output immutability', () => {
  it('leaves every recording byte-identical after a review is submitted', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment, { locationCode: LOCATION_CODES.R_UPPER })
    await seedRecording(assessment, { locationCode: LOCATION_CODES.L_LOWER })

    // Deep snapshot rather than a list of field names: a field added to
    // Recording later is then covered automatically instead of quietly
    // escaping this check.
    const before = structuredClone(await db.recordings.toArray())

    await repo.submitReview(assessment.id, confirmInput, practitioner)

    const after = await db.recordings.toArray()
    expect(after).toEqual(before)
  })

  it('leaves the AI fields alone even when the practitioner disagrees', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    const recording = await seedRecording(assessment)

    await repo.submitReview(
      assessment.id,
      {
        interpretationCode: INTERPRETATION_CODES.MODIFIED,
        notes: 'Crackles at the base, not wheeze.',
        locations: [
          {
            recordingId: recording.id,
            interpretationCode: INTERPRETATION_CODES.MODIFIED,
            modifiedClassificationCode: CLASSIFICATION_CODES.PNEUMONIA,
          },
        ],
      },
      practitioner,
    )

    const after = await db.recordings.get(recording.id)
    expect(after?.aiClassification).toBe(CLASSIFICATION_CODES.ASTHMA)
    expect(after?.aiConfidence).toBe(0.82)
    expect(after?.aiStatus).toBe(AI_STATUS.ANALYZED)
    expect(after?.modelVersion).toBe('impulse-1-v5')
  })

  it('leaves the assessment’s AI severity block untouched', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment)

    const before = structuredClone((await db.assessments.get(assessment.id))?.aiSeverity)
    await repo.submitReview(assessment.id, confirmInput, practitioner)

    expect((await db.assessments.get(assessment.id))?.aiSeverity).toEqual(before)
  })

  it('snapshots what the AI said into the review itself', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    const recording = await seedRecording(assessment)

    const { overall } = await repo.submitReview(assessment.id, confirmInput, practitioner)
    const snapshot = overall.aiResultSnapshot as Array<Record<string, unknown>>

    expect(Array.isArray(snapshot)).toBe(true)
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0]).toMatchObject({
      recordingId: recording.id,
      locationCode: LOCATION_CODES.R_UPPER,
      aiClassification: CLASSIFICATION_CODES.ASTHMA,
      aiConfidence: 0.82,
      modelVersion: 'impulse-1-v5',
    })
  })

  it('keeps the snapshot even if the recording is deleted afterwards', async () => {
    // The snapshot is the point: the review must stay interpretable on its own.
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    const recording = await seedRecording(assessment)

    const { overall } = await repo.submitReview(assessment.id, confirmInput, practitioner)
    await db.recordings.delete(recording.id)

    const stored = await db.clinicalReviews.get(overall.id)
    const snapshot = stored?.aiResultSnapshot as Array<Record<string, unknown>>
    expect(snapshot[0]?.aiClassification).toBe(CLASSIFICATION_CODES.ASTHMA)
  })
})

// ---------------------------------------------------------------------------

describe('the five interpretation outcomes', () => {
  it('maps each one to a review status, exhaustively', async () => {
    for (const code of Object.values(INTERPRETATION_CODES)) {
      expect(STATUS_FOR_INTERPRETATION[code]).toBeDefined()
    }
    expect(STATUS_FOR_INTERPRETATION[INTERPRETATION_CODES.CONFIRMED]).toBe(
      REVIEW_STATUSES.APPROVED,
    )
    expect(STATUS_FOR_INTERPRETATION[INTERPRETATION_CODES.DISAGREED]).toBe(
      REVIEW_STATUSES.DISAPPROVED,
    )
    expect(STATUS_FOR_INTERPRETATION[INTERPRETATION_CODES.MODIFIED]).toBe(
      REVIEW_STATUSES.APPROVED,
    )
    expect(STATUS_FOR_INTERPRETATION[INTERPRETATION_CODES.UNCERTAIN]).toBe(
      REVIEW_STATUSES.FURTHER_REVIEW_REQUESTED,
    )
    expect(STATUS_FOR_INTERPRETATION[INTERPRETATION_CODES.REPEAT_REQUESTED]).toBe(
      REVIEW_STATUSES.FURTHER_REVIEW_REQUESTED,
    )
  })

  it('confirms', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment)

    const { overall, locations } = await repo.submitReview(assessment.id, confirmInput, practitioner)

    expect(overall.interpretationCode).toBe(INTERPRETATION_CODES.CONFIRMED)
    expect(overall.practitionerId).toBe(practitioner.id)
    // The fast path is one action: an assessment-level row and nothing else.
    expect(overall.recordingId).toBeUndefined()
    expect(locations).toEqual([])

    const updated = await db.assessments.get(assessment.id)
    expect(updated?.reviewStatus).toBe(REVIEW_STATUSES.APPROVED)
    expect(updated?.practitionerReviewerId).toBe(practitioner.id)
    expect(updated?.practitionerSeverity?.interpretation).toBe(INTERPRETATION_CODES.CONFIRMED)
  })

  it('disagrees, and requires the practitioner to say why', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment)

    await expect(
      repo.submitReview(
        assessment.id,
        { interpretationCode: INTERPRETATION_CODES.DISAGREED, notes: '   ' },
        practitioner,
      ),
    ).rejects.toMatchObject({ code: REVIEW_ERRORS.NOTES_REQUIRED })

    const { overall } = await repo.submitReview(
      assessment.id,
      {
        interpretationCode: INTERPRETATION_CODES.DISAGREED,
        notes: 'Breath sounds were clear on my own examination.',
      },
      practitioner,
    )
    expect(overall.notes).toBe('Breath sounds were clear on my own examination.')
    expect((await db.assessments.get(assessment.id))?.reviewStatus).toBe(
      REVIEW_STATUSES.DISAPPROVED,
    )
  })

  it('modifies, and requires the replacement classification', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    const recording = await seedRecording(assessment)

    // Modify is inherently about a location, so one must be named.
    await expect(
      repo.submitReview(
        assessment.id,
        { interpretationCode: INTERPRETATION_CODES.MODIFIED, notes: 'x' },
        practitioner,
      ),
    ).rejects.toMatchObject({ code: REVIEW_ERRORS.LOCATION_REQUIRED })

    await expect(
      repo.submitReview(
        assessment.id,
        {
          interpretationCode: INTERPRETATION_CODES.MODIFIED,
          notes: 'x',
          locations: [
            { recordingId: recording.id, interpretationCode: INTERPRETATION_CODES.MODIFIED },
          ],
        },
        practitioner,
      ),
    ).rejects.toMatchObject({ code: REVIEW_ERRORS.MODIFIED_CLASSIFICATION_REQUIRED })

    const { overall, locations } = await repo.submitReview(
      assessment.id,
      {
        interpretationCode: INTERPRETATION_CODES.MODIFIED,
        notes: 'Crackles, not wheeze.',
        locations: [
          {
            recordingId: recording.id,
            interpretationCode: INTERPRETATION_CODES.MODIFIED,
            modifiedClassificationCode: CLASSIFICATION_CODES.PNEUMONIA,
          },
        ],
      },
      practitioner,
    )
    expect(overall.recordingId).toBeUndefined()
    expect(locations).toHaveLength(1)
    expect(locations[0]?.modifiedClassificationCode).toBe(CLASSIFICATION_CODES.PNEUMONIA)
    expect(locations[0]?.recordingId).toBe(recording.id)
  })

  it('records uncertainty, and requires a comment', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment)

    await expect(
      repo.submitReview(
        assessment.id,
        { interpretationCode: INTERPRETATION_CODES.UNCERTAIN, notes: '' },
        practitioner,
      ),
    ).rejects.toMatchObject({ code: REVIEW_ERRORS.NOTES_REQUIRED })

    await repo.submitReview(
      assessment.id,
      {
        interpretationCode: INTERPRETATION_CODES.UNCERTAIN,
        notes: 'Cannot tell from this recording alone.',
      },
      practitioner,
    )
    expect((await db.assessments.get(assessment.id))?.reviewStatus).toBe(
      REVIEW_STATUSES.FURTHER_REVIEW_REQUESTED,
    )
  })

  it('requests a repeat, naming the location and the reason', async () => {
    // The health worker has to know what to redo and why, or the repeat is
    // guesswork and produces the same unusable audio again.
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    const recording = await seedRecording(assessment, { locationCode: LOCATION_CODES.L_LOWER })

    await expect(
      repo.submitReview(
        assessment.id,
        { interpretationCode: INTERPRETATION_CODES.REPEAT_REQUESTED, notes: 'Too noisy' },
        practitioner,
      ),
    ).rejects.toMatchObject({ code: REVIEW_ERRORS.LOCATION_REQUIRED })

    const { locations } = await repo.submitReview(
      assessment.id,
      {
        interpretationCode: INTERPRETATION_CODES.REPEAT_REQUESTED,
        notes: 'Rubbing on the microphone throughout.',
        locations: [
          {
            recordingId: recording.id,
            interpretationCode: INTERPRETATION_CODES.REPEAT_REQUESTED,
          },
        ],
      },
      practitioner,
    )

    expect(locations[0]?.recordingId).toBe(recording.id)
    expect(locations[0]?.notes).toContain('Rubbing')

    const outstanding = await repo.repeatRequestsFor(assessment.id)
    expect(outstanding).toHaveLength(1)
    expect(outstanding[0]?.locationCode).toBe(LOCATION_CODES.L_LOWER)
    expect(outstanding[0]?.reason).toContain('Rubbing')
  })

  it('rejects an interpretation code outside the registry', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment)

    await expect(
      repo.submitReview(
        assessment.id,
        { interpretationCode: 'PROBABLY_FINE' as never, notes: 'x' },
        practitioner,
      ),
    ).rejects.toMatchObject({ code: REVIEW_ERRORS.INVALID_INTERPRETATION })
  })

  it('audits every submission with the actor, patient and outcome', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment)

    await repo.submitReview(assessment.id, confirmInput, practitioner)

    const entry = (await db.auditLogs.toArray()).find(
      (l) => l.actionCode === REVIEW_AUDIT_ACTIONS.REVIEW_SUBMITTED,
    )
    expect(entry?.userId).toBe(practitioner.id)
    expect(entry?.patientId).toBe(patient.id)
    expect(entry?.detail).toMatchObject({
      interpretationCode: INTERPRETATION_CODES.CONFIRMED,
    })
  })

  it('keeps the practitioner’s notes out of the audit log', async () => {
    // Clinical notes are patient data; the audit trail records that a review
    // happened, not what was said in it.
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment)

    await repo.submitReview(
      assessment.id,
      {
        interpretationCode: INTERPRETATION_CODES.DISAGREED,
        notes: 'SECRET_CLINICAL_DETAIL',
      },
      practitioner,
    )
    expect(JSON.stringify(await db.auditLogs.toArray())).not.toContain('SECRET_CLINICAL_DETAIL')
  })
})

// ---------------------------------------------------------------------------

describe('assignment scoping', () => {
  it('shows a practitioner only assessments for their own patients', async () => {
    const mine = await seedPatient()
    const theirs = await seedPatient({
      id: 'PT-9999-9999',
      assignedPractitionerIds: [otherPractitioner.id],
    })
    const a = await seedAssessment(mine.id)
    await seedAssessment(theirs.id)
    await seedRecording(a)

    const queue = await repo.queue(practitioner)
    expect(queue.map((q) => q.assessment.patientId)).toEqual([mine.id])
  })

  it('refuses to open another practitioner’s case', async () => {
    const theirs = await seedPatient({
      id: 'PT-9999-9998',
      assignedPractitionerIds: [otherPractitioner.id],
    })
    const assessment = await seedAssessment(theirs.id)

    expect(await repo.getCase(assessment.id, practitioner)).toBeUndefined()
  })

  it('refuses to submit a review on a case the practitioner cannot see', async () => {
    const theirs = await seedPatient({
      id: 'PT-9999-9997',
      assignedPractitionerIds: [otherPractitioner.id],
    })
    const assessment = await seedAssessment(theirs.id)
    await seedRecording(assessment)

    await expect(
      repo.submitReview(assessment.id, confirmInput, practitioner),
    ).rejects.toMatchObject({ code: REVIEW_ERRORS.NOT_FOUND })

    expect(await db.clinicalReviews.count()).toBe(0)
  })

  it('lets an admin see everything', async () => {
    const mine = await seedPatient()
    const theirs = await seedPatient({
      id: 'PT-9999-9996',
      assignedPractitionerIds: [otherPractitioner.id],
    })
    await seedAssessment(mine.id)
    await seedAssessment(theirs.id)

    expect(await repo.queue(admin)).toHaveLength(2)
  })

  it('gives a health worker no review queue at all', async () => {
    const patient = await seedPatient()
    await seedAssessment(patient.id)
    expect(await repo.queue(healthWorker)).toEqual([])
  })

  it('refuses a health worker submitting a review', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment)

    await expect(
      repo.submitReview(assessment.id, confirmInput, healthWorker),
    ).rejects.toMatchObject({ code: REVIEW_ERRORS.NOT_PERMITTED })
  })
})

// ---------------------------------------------------------------------------

describe('queue', () => {
  it('lists only assessments awaiting a decision by default', async () => {
    const patient = await seedPatient()
    await seedAssessment(patient.id, { reviewStatus: REVIEW_STATUSES.PENDING_REVIEW })
    await seedAssessment(patient.id, { reviewStatus: REVIEW_STATUSES.APPROVED })

    const queue = await repo.queue(practitioner)
    expect(queue).toHaveLength(1)
    expect(queue[0]?.assessment.reviewStatus).toBe(REVIEW_STATUSES.PENDING_REVIEW)
  })

  it('can be filtered to another status', async () => {
    const patient = await seedPatient()
    await seedAssessment(patient.id, { reviewStatus: REVIEW_STATUSES.APPROVED })

    const queue = await repo.queue(practitioner, { status: REVIEW_STATUSES.APPROVED })
    expect(queue).toHaveLength(1)
  })

  it('carries what the row has to show without a second query', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment, { locationCode: LOCATION_CODES.R_UPPER })
    await seedRecording(assessment, { locationCode: LOCATION_CODES.L_LOWER })

    const [row] = await repo.queue(practitioner)
    expect(row?.patient.name).toBe('Maria Dela Cruz')
    expect(row?.recordingCount).toBe(2)
    expect(row?.flaggedCount).toBe(2)
  })

  it('hides seeded cases while demo mode is off', async () => {
    await setDemoMode(false, db)
    const patient = await seedPatient({ id: 'PT-0002-0002', isDemo: 1 })
    await seedAssessment(patient.id, { isDemo: 1 })
    expect(await repo.queue(practitioner)).toEqual([])
  })

  it('shows seeded cases once demo mode is on', async () => {
    await setDemoMode(true, db)
    const patient = await seedPatient({ id: 'PT-0003-0003', isDemo: 1 })
    await seedAssessment(patient.id, { isDemo: 1 })
    expect(await repo.queue(practitioner)).toHaveLength(1)
  })
})

describe('triage ordering', () => {
  const base = {
    flaggedCount: 0,
    unusableCount: 0,
    recordingCount: 2,
    waitingDays: 0,
  }

  it('puts a flagged case above an unflagged one, however long the wait', async () => {
    // Waiting time must never outrank a flagged finding, or a queue full of
    // old routine cases buries the one that needed attention.
    const flagged = triageScore({ ...base, flaggedCount: 1, waitingDays: 0 })
    const staleClear = triageScore({ ...base, flaggedCount: 0, waitingDays: 365 })
    expect(flagged).toBeGreaterThan(staleClear)
  })

  it('ranks more flagged locations higher', () => {
    expect(triageScore({ ...base, flaggedCount: 3 })).toBeGreaterThan(
      triageScore({ ...base, flaggedCount: 1 }),
    )
  })

  it('ranks an unusable recording above a clear one', () => {
    // Nothing was decided about that patient at all, so a human still has to look.
    expect(triageScore({ ...base, unusableCount: 1 })).toBeGreaterThan(triageScore(base))
  })

  it('breaks ties by who has waited longest, so nothing is starved', () => {
    expect(triageScore({ ...base, flaggedCount: 1, waitingDays: 5 })).toBeGreaterThan(
      triageScore({ ...base, flaggedCount: 1, waitingDays: 1 }),
    )
  })

  it('orders the queue by that score', async () => {
    const patient = await seedPatient()
    const routine = await seedAssessment(patient.id, { date: '2026-08-01T09:00:00.000Z' })
    await seedRecording(routine, { aiClassification: CLASSIFICATION_CODES.HEALTHY })

    const urgent = await seedAssessment(patient.id, { date: '2026-08-25T09:00:00.000Z' })
    await seedRecording(urgent, {
      locationCode: LOCATION_CODES.R_UPPER,
      aiClassification: CLASSIFICATION_CODES.PNEUMONIA,
    })

    const queue = await repo.queue(practitioner)
    // The newer flagged case outranks the older clear one.
    expect(queue[0]?.assessment.id).toBe(urgent.id)
  })
})

// ---------------------------------------------------------------------------

describe('clinical case', () => {
  it('gathers patient, assessment and recordings in one read', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment, { locationCode: LOCATION_CODES.R_UPPER })
    await seedRecording(assessment, { locationCode: LOCATION_CODES.L_LOWER })

    const found = await repo.getCase(assessment.id, practitioner)
    expect(found?.patient.id).toBe(patient.id)
    expect(found?.locations).toHaveLength(2)
  })

  it('finds the previous result for the same location', async () => {
    const patient = await seedPatient()
    const earlier = await seedAssessment(patient.id, {
      date: '2026-07-01T09:00:00.000Z',
      reviewStatus: REVIEW_STATUSES.APPROVED,
    })
    await seedRecording(earlier, {
      locationCode: LOCATION_CODES.R_UPPER,
      aiClassification: CLASSIFICATION_CODES.HEALTHY,
      createdAt: '2026-07-01T09:00:00.000Z',
    })

    const current = await seedAssessment(patient.id, { date: '2026-08-20T09:00:00.000Z' })
    await seedRecording(current, {
      locationCode: LOCATION_CODES.R_UPPER,
      createdAt: '2026-08-20T09:00:00.000Z',
    })

    const found = await repo.getCase(current.id, practitioner)
    const location = found?.locations[0]
    expect(location?.previous?.aiClassification).toBe(CLASSIFICATION_CODES.HEALTHY)
    expect(location?.changed).toBe(true)
  })

  it('reports no comparison at all when there is no earlier recording', async () => {
    // Rendering a comparison against nothing is how "improving" or
    // "deteriorating" gets implied from a single data point.
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment)

    const found = await repo.getCase(assessment.id, practitioner)
    expect(found?.locations[0]?.previous).toBeUndefined()
    expect(found?.locations[0]?.changed).toBeUndefined()
  })

  it('does not treat a later recording as the previous one', async () => {
    const patient = await seedPatient()
    const current = await seedAssessment(patient.id, { date: '2026-08-01T09:00:00.000Z' })
    await seedRecording(current, { createdAt: '2026-08-01T09:00:00.000Z' })

    const later = await seedAssessment(patient.id, { date: '2026-09-01T09:00:00.000Z' })
    await seedRecording(later, { createdAt: '2026-09-01T09:00:00.000Z' })

    const found = await repo.getCase(current.id, practitioner)
    expect(found?.locations[0]?.previous).toBeUndefined()
  })

  it('reports changed=false when the pattern is the same as last time', async () => {
    const patient = await seedPatient()
    const earlier = await seedAssessment(patient.id, { date: '2026-07-01T09:00:00.000Z' })
    await seedRecording(earlier, { createdAt: '2026-07-01T09:00:00.000Z' })
    const current = await seedAssessment(patient.id, { date: '2026-08-20T09:00:00.000Z' })
    await seedRecording(current, { createdAt: '2026-08-20T09:00:00.000Z' })

    const found = await repo.getCase(current.id, practitioner)
    expect(found?.locations[0]?.changed).toBe(false)
  })

  it('carries any review already recorded', async () => {
    const patient = await seedPatient()
    const assessment = await seedAssessment(patient.id)
    await seedRecording(assessment)
    await repo.submitReview(assessment.id, confirmInput, practitioner)

    const found = await repo.getCase(assessment.id, practitioner)
    expect(found?.reviews).toHaveLength(1)
    expect(found?.reviews[0]?.interpretationCode).toBe(INTERPRETATION_CODES.CONFIRMED)
  })

  it('is undefined for an assessment that does not exist', async () => {
    expect(await repo.getCase('nope', practitioner)).toBeUndefined()
  })
})

describe('ReviewError', () => {
  it('carries a code the UI can translate', async () => {
    const error = new ReviewError(REVIEW_ERRORS.NOT_FOUND)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe(REVIEW_ERRORS.NOT_FOUND)
  })
})
