import { logAction } from '../../audit/audit'
import { db as defaultDb, type AuscultaDB } from '../../db/db'
import {
  AI_STATUS,
  AUDIO_SOURCES,
  CONSENT_STATUSES,
  MEASUREMENT_SOURCES,
  REVIEW_STATUSES,
} from '../../db/codes'
import type {
  Assessment,
  AudioBlobRecord,
  ClinicalReview,
  Patient,
  Recording,
} from '../../db/types'
import {
  DEMO_AUDIO_DURATION_SEC,
  DEMO_AUDIO_FILE_NAME,
  DEMO_AUDIO_SAMPLE_RATE,
  DEMO_AUDIO_BIT_DEPTH,
  DEMO_AUDIO_CHANNELS,
  buildDemoAudioBlobs,
  demoAudioBlobIdFor,
} from './audio'
import {
  DEMO_CONSENT_TEXT_VERSION,
  DEMO_DATASET_VERSION,
  DEMO_LOCATION_ORDER,
  DEMO_MODEL_VERSION,
  DEMO_PATIENTS,
  DEMO_QUESTIONNAIRE_VERSION,
  DEMO_REVIEWER_ID,
  FINDING_CLASSIFICATION,
  type DemoFinding,
  type DemoPatientSpec,
  type DemoVisitSpec,
} from './dataset'
import { DEMO_AUDIT_ACTIONS, DEMO_SYSTEM_ACTOR } from './audit'
import { clearDemoMode } from './demoMode'
import { DEMO, demoRowsOnly } from './visibility'

/**
 * Seeding and clearing the fictional clinic.
 *
 * Two properties matter more than anything else here and both are tested:
 *
 * 1. **Every row written carries `isDemo = 1`.** It is the only thing standing
 *    between a validator's fictional patient and a clinician's real caseload.
 * 2. **`resetDemoData` can only ever delete demo rows.** A reset that removed
 *    a real patient would be unrecoverable on an offline device with no
 *    server-side copy.
 *
 * Idempotency is structural rather than a flag that has to be remembered:
 * every id is derived from the patient's sequence number and the visit index,
 * so re-seeding writes the same primary keys and `bulkPut` overwrites rather
 * than appending. The `demoSeed` marker below is an optimisation and a record
 * of provenance, not the thing that keeps the data unique.
 */

/** `appMeta` key recording that (and when) the dataset was seeded. */
export const DEMO_SEED_META_KEY = 'demoSeed'

export interface DemoSeedMarker {
  version: number
  seededAt: string
  counts: DemoCounts
}

export interface DemoCounts {
  patients: number
  assessments: number
  recordings: number
  audioBlobs: number
  clinicalReviews: number
}

const EMPTY_COUNTS: DemoCounts = {
  patients: 0,
  assessments: 0,
  recordings: 0,
  audioBlobs: 0,
  clinicalReviews: 0,
}

// --- deterministic identifiers ---------------------------------------------
//
// Patient and study ids have to satisfy the real formats from
// features/patients/ids.ts, so demo patients behave like any other in search
// and validation. Crockford base32 excludes I, L, O and U, which is why the
// recognisable prefix is `D3M0` rather than `DEMO`.

export const DEMO_ID_MARKER = 'D3M0'

export function demoPatientId(seq: number): string {
  return `PT-${DEMO_ID_MARKER}-${String(seq).padStart(4, '0')}`
}

export function demoStudyId(seq: number): string {
  return `ST-${DEMO_ID_MARKER}${'0'.repeat(8)}${String(seq).padStart(4, '0')}`
}

export function demoAssessmentId(seq: number, visitIndex: number): string {
  return `DEMO-AS-${seq}-${visitIndex + 1}`
}

export function demoRecordingId(seq: number, visitIndex: number, location: string): string {
  return `DEMO-RC-${seq}-${visitIndex + 1}-${location}`
}

export function demoReviewId(seq: number, visitIndex: number): string {
  return `DEMO-CR-${seq}-${visitIndex + 1}`
}

// --- AI columns -------------------------------------------------------------

/**
 * Stable pseudo-random value in `[min, max]`, derived from a string.
 *
 * Seeded confidences must not move between runs — a number that changes every
 * time the demo is reset would be visibly untrustworthy to the engineers
 * evaluating the app. FNV-1a over the recording id gives a spread that looks
 * unpatterned without being random.
 */
export function stableUnitValue(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 1000) / 1000
}

function stableConfidence(seed: string, min: number, max: number): number {
  return Math.round((min + stableUnitValue(seed) * (max - min)) * 100) / 100
}

/** The AI-related columns of a seeded recording. */
export type DemoAiFields = Pick<
  Recording,
  'aiStatus' | 'aiClassification' | 'aiConfidence' | 'uncertainFlag' | 'modelVersion'
>

/**
 * A finding -> the AI columns, mirroring `toAiOutcome` in
 * features/assessment/data/mapping.ts.
 *
 * The rule that module exists to enforce is that a result the model could not
 * support never acquires a classification or a confidence, because a number
 * beside an inconclusive result reads as certainty nobody has. Seeded data has
 * to obey it too — arguably more so, since this is the data a pulmonologist
 * will be looking at when they score whether the app is safe.
 *
 * Note which branches carry `modelVersion`: INSUFFICIENT_QUALITY does not,
 * because the quality gate rejects a recording before inference runs, so no
 * model ever saw it.
 */
export function aiFieldsFor(finding: DemoFinding, recordingId: string): DemoAiFields {
  switch (finding) {
    case 'insufficient':
      return { aiStatus: AI_STATUS.INSUFFICIENT_QUALITY }
    case 'pending':
      return { aiStatus: AI_STATUS.PENDING }
    case 'offline':
      return { aiStatus: AI_STATUS.MODEL_NOT_CONNECTED }
    case 'uncertain':
      // Analysed, but the windows did not agree well enough to name anything.
      return {
        aiStatus: AI_STATUS.ANALYZED,
        uncertainFlag: true,
        modelVersion: DEMO_MODEL_VERSION,
      }
    case 'clear':
      return {
        aiStatus: AI_STATUS.ANALYZED,
        aiClassification: FINDING_CLASSIFICATION.clear,
        aiConfidence: stableConfidence(recordingId, 0.72, 0.94),
        modelVersion: DEMO_MODEL_VERSION,
      }
    default: {
      const classification = FINDING_CLASSIFICATION[finding]
      if (classification === undefined) {
        throw new Error(`demo dataset: no classification for finding "${finding}"`)
      }
      return {
        aiStatus: AI_STATUS.ANALYZED,
        aiClassification: classification,
        aiConfidence: stableConfidence(recordingId, 0.68, 0.92),
        modelVersion: DEMO_MODEL_VERSION,
      }
    }
  }
}

/**
 * Why this row breaks the disclosure rule, or `null` if it does not.
 *
 * Exported so the test suite can assert it over the whole seeded dataset
 * rather than over a handful of examples.
 */
export function aiDisclosureViolation(fields: DemoAiFields): string | null {
  const hasClassification = fields.aiClassification !== undefined
  const hasConfidence = fields.aiConfidence !== undefined

  if (fields.aiStatus !== AI_STATUS.ANALYZED) {
    if (hasClassification) return `${fields.aiStatus} must not carry a classification`
    if (hasConfidence) return `${fields.aiStatus} must not carry a confidence`
    if (fields.uncertainFlag === true) return `${fields.aiStatus} must not be flagged uncertain`
    return null
  }
  if (fields.uncertainFlag === true) {
    if (hasClassification) return 'an uncertain result must not carry a classification'
    if (hasConfidence) return 'an uncertain result must not carry a confidence'
  }
  if (hasConfidence && !hasClassification) {
    return 'a confidence without a classification claims precision about nothing'
  }
  if (hasConfidence && (fields.aiConfidence! < 0 || fields.aiConfidence! > 1)) {
    return 'confidence must be a probability in [0, 1]'
  }
  return null
}

// --- row construction -------------------------------------------------------

/** Visit timestamp: `daysAgo` before `now`, pinned to ~09:30 Philippine time. */
function visitIso(now: number, daysAgo: number): string {
  const date = new Date(now - daysAgo * 24 * 60 * 60 * 1000)
  date.setUTCHours(1, 30, 0, 0)
  return date.toISOString()
}

export interface DemoRows {
  patients: Patient[]
  assessments: Assessment[]
  recordings: Recording[]
  audioBlobs: AudioBlobRecord[]
  clinicalReviews: ClinicalReview[]
}

function buildPatient(spec: DemoPatientSpec, now: number): Patient {
  const registeredAt = visitIso(now, spec.visits[0].daysAgo)
  return {
    id: demoPatientId(spec.seq),
    studyId: demoStudyId(spec.seq),
    name: spec.name,
    birthDate: spec.birthDate,
    sex: spec.sex,
    address: spec.address,
    ...(spec.contact !== undefined && { contact: spec.contact }),
    assignedPractitionerIds: [DEMO_REVIEWER_ID],
    assignedHealthWorkerIds: [...new Set(spec.visits.map((visit) => visit.assessorId))],
    consent: {
      status: CONSENT_STATUSES.GRANTED,
      language: spec.consentLanguage,
      textVersion: DEMO_CONSENT_TEXT_VERSION,
      presentedAt: registeredAt,
      recordedBy: spec.visits[0].assessorId,
    },
    respiratoryHistory: [...spec.respiratoryHistory],
    familyHistory: [...spec.familyHistory],
    preferredLanguage: spec.preferredLanguage,
    isDemo: DEMO,
    createdAt: registeredAt,
  }
}

function buildAssessment(spec: DemoPatientSpec, visit: DemoVisitSpec, index: number, now: number): Assessment {
  const at = visitIso(now, visit.daysAgo)
  const reviewedAt = visitIso(now, Math.max(0, visit.daysAgo - 1))
  return {
    id: demoAssessmentId(spec.seq, index),
    patientId: demoPatientId(spec.seq),
    assessorId: visit.assessorId,
    ...(visit.review !== undefined && { practitionerReviewerId: DEMO_REVIEWER_ID }),
    date: at,
    symptoms: [...visit.symptoms],
    vitals: visit.vitals.map((vital) => ({
      ...vital,
      source: MEASUREMENT_SOURCES.MANUAL_ENTRY,
      enteredBy: visit.assessorId,
      enteredAt: at,
    })),
    reviewStatus: visit.review?.status ?? REVIEW_STATUSES.PENDING_REVIEW,
    interfaceLanguage: visit.language,
    questionnaireLanguage: visit.language,
    questionnaireVersion: DEMO_QUESTIONNAIRE_VERSION,
    aiSeverity:
      visit.severity === null
        ? {
            score: null,
            category: null,
            modelVersion: null,
            calculatedAt: null,
            thresholdConfigVersion: 1,
            status: 'MODEL_NOT_CONNECTED',
          }
        : {
            score: visit.severity.score,
            category: visit.severity.category,
            modelVersion: DEMO_MODEL_VERSION,
            calculatedAt: at,
            thresholdConfigVersion: 1,
            status: 'CALCULATED',
          },
    ...(visit.review !== undefined && {
      practitionerSeverity: {
        interpretation: visit.review.interpretation,
        ...(visit.review.adjustedCategory !== undefined && {
          adjustedCategory: visit.review.adjustedCategory,
        }),
        notes: visit.review.notes,
        reviewedAt,
      },
    }),
    isDemo: DEMO,
    createdAt: at,
  }
}

/** Expands the whole fictional clinic into rows, without touching the database. */
export function buildDemoRows(now: number = Date.now()): DemoRows {
  const rows: DemoRows = {
    patients: [],
    assessments: [],
    recordings: [],
    audioBlobs: buildDemoAudioBlobs(),
    clinicalReviews: [],
  }
  let recordingCounter = 0

  for (const spec of DEMO_PATIENTS) {
    rows.patients.push(buildPatient(spec, now))

    spec.visits.forEach((visit, index) => {
      const at = visitIso(now, visit.daysAgo)
      rows.assessments.push(buildAssessment(spec, visit, index, now))

      DEMO_LOCATION_ORDER.forEach((location, zone) => {
        const id = demoRecordingId(spec.seq, index, location)
        const ai = aiFieldsFor(visit.findings[zone], id)
        rows.recordings.push({
          id,
          assessmentId: demoAssessmentId(spec.seq, index),
          patientId: demoPatientId(spec.seq),
          locationCode: location,
          audioBlobId: demoAudioBlobIdFor(recordingCounter),
          audioSource: AUDIO_SOURCES.DEMO_FICTIONAL,
          originalFileName: DEMO_AUDIO_FILE_NAME,
          importedSampleRate: DEMO_AUDIO_SAMPLE_RATE,
          bitDepth: DEMO_AUDIO_BIT_DEPTH,
          channels: DEMO_AUDIO_CHANNELS,
          durationSec: DEMO_AUDIO_DURATION_SEC,
          // No quality report: nothing measured this signal, and inventing
          // metrics would put fabricated numbers in a research export.
          quality: null,
          ...ai,
          isDemo: DEMO,
          createdAt: at,
        })
        recordingCounter += 1
      })

      if (visit.review !== undefined) {
        rows.clinicalReviews.push({
          id: demoReviewId(spec.seq, index),
          assessmentId: demoAssessmentId(spec.seq, index),
          practitionerId: DEMO_REVIEWER_ID,
          // Nothing to snapshot: no model ran, so there is no result to keep a
          // copy of. Null says that; an invented object would not.
          aiResultSnapshot: null,
          interpretationCode: visit.review.interpretation,
          notes: visit.review.notes,
          reviewedAt: visitIso(now, Math.max(0, visit.daysAgo - 1)),
        })
      }
    })
  }
  return rows
}

function countOf(rows: DemoRows): DemoCounts {
  return {
    patients: rows.patients.length,
    assessments: rows.assessments.length,
    recordings: rows.recordings.length,
    audioBlobs: rows.audioBlobs.length,
    clinicalReviews: rows.clinicalReviews.length,
  }
}

// --- public operations ------------------------------------------------------

export interface SeedResult {
  /** `false` when an up-to-date dataset was already present and nothing was written. */
  seeded: boolean
  counts: DemoCounts
}

/** The seed marker, or `null` if this device has never been seeded. */
export async function readDemoSeedMarker(
  db: Pick<AuscultaDB, 'appMeta'> = defaultDb,
): Promise<DemoSeedMarker | null> {
  const row = await db.appMeta.get(DEMO_SEED_META_KEY)
  const value = row?.value as Partial<DemoSeedMarker> | undefined
  if (value === undefined || typeof value.version !== 'number') return null
  return {
    version: value.version,
    seededAt: typeof value.seededAt === 'string' ? value.seededAt : '',
    counts: { ...EMPTY_COUNTS, ...(value.counts ?? {}) },
  }
}

export interface SeedOptions {
  /** Clock for the visit dates. Injectable so tests are not time-dependent. */
  now?: number
  /** Re-write the rows even if an up-to-date marker is present. */
  force?: boolean
  /** Who asked for this. Defaults to the system actor (first-run setup). */
  actor?: string
}

/**
 * Writes the fictional clinic, once.
 *
 * Safe to call on every app start: with an up-to-date marker present it does
 * no writes at all, and without one the deterministic ids mean `bulkPut`
 * refreshes the same rows rather than adding a second copy of the clinic.
 * Seeding does **not** switch demo mode on — showing fictional patients stays
 * an explicit act.
 */
export async function seedDemoData(
  db: AuscultaDB = defaultDb,
  options: SeedOptions = {},
): Promise<SeedResult> {
  const { now = Date.now(), force = false, actor = DEMO_SYSTEM_ACTOR } = options

  if (!force) {
    const marker = await readDemoSeedMarker(db)
    if (marker !== null && marker.version === DEMO_DATASET_VERSION) {
      return { seeded: false, counts: marker.counts }
    }
  }

  const rows = buildDemoRows(now)
  const counts = countOf(rows)

  await db.transaction(
    'rw',
    [db.patients, db.assessments, db.recordings, db.audioBlobs, db.clinicalReviews, db.appMeta],
    async () => {
      await db.patients.bulkPut(rows.patients)
      await db.assessments.bulkPut(rows.assessments)
      await db.recordings.bulkPut(rows.recordings)
      await db.audioBlobs.bulkPut(rows.audioBlobs)
      await db.clinicalReviews.bulkPut(rows.clinicalReviews)
      const marker: DemoSeedMarker = {
        version: DEMO_DATASET_VERSION,
        seededAt: new Date(now).toISOString(),
        counts,
      }
      await db.appMeta.put({ key: DEMO_SEED_META_KEY, value: marker })
    },
  )

  // After the transaction, never inside it: `auditLogs` is not in its scope,
  // and `logAction` swallows its own errors, so an in-transaction write would
  // fail silently and leave exactly the gap this entry exists to close.
  await logAction(
    {
      userId: actor,
      actionCode: DEMO_AUDIT_ACTIONS.DEMO_DATA_SEEDED,
      entityType: 'demoDataset',
      detail: { datasetVersion: DEMO_DATASET_VERSION, written: counts },
    },
    db,
  )

  return { seeded: true, counts }
}

export interface ResetResult {
  deleted: DemoCounts
}

/**
 * Deletes every seeded row and nothing else.
 *
 * Patients, assessments and recordings are selected through the `isDemo`
 * index, which cannot reach a row that never declared itself fictional.
 *
 * Clinical reviews, audio blobs and alerts carry no `isDemo` field of their
 * own — see the note in this feature's report — so they are reached by
 * derivation instead: a review is demo because *its assessment* is, an alert
 * because *its patient* is. That is strictly narrower than a flag would be,
 * which is the safe direction: the worst case is an orphaned row left behind,
 * never a real record removed.
 *
 * Audio blobs get one extra guard. A blob is only deleted once no non-demo
 * recording refers to it, so a real recording can never be silently muted by
 * a demo reset.
 */
export async function resetDemoData(
  db: AuscultaDB = defaultDb,
  actor: string = DEMO_SYSTEM_ACTOR,
): Promise<ResetResult> {
  const deleted: DemoCounts = { ...EMPTY_COUNTS }

  await db.transaction(
    'rw',
    [
      db.patients,
      db.assessments,
      db.recordings,
      db.audioBlobs,
      db.clinicalReviews,
      db.alerts,
      db.appMeta,
    ],
    async () => {
      const patientIds = (await demoRowsOnly(db.patients).primaryKeys()) as string[]
      const assessmentIds = (await demoRowsOnly(db.assessments).primaryKeys()) as string[]
      const recordings = await demoRowsOnly(db.recordings).toArray()

      if (assessmentIds.length > 0) {
        deleted.clinicalReviews = await db.clinicalReviews
          .where('assessmentId')
          .anyOf(assessmentIds)
          .delete()
      }
      if (patientIds.length > 0) {
        await db.alerts.where('patientId').anyOf(patientIds).delete()
      }

      // Blobs only when nothing real still points at them.
      const candidates = new Set(recordings.map((recording) => recording.audioBlobId))
      if (candidates.size > 0) {
        const stillReferenced = new Set<string>()
        await db.recordings
          .filter(
            (recording) => recording.isDemo !== DEMO && candidates.has(recording.audioBlobId),
          )
          .each((recording) => stillReferenced.add(recording.audioBlobId))
        const removable = [...candidates].filter((id) => !stillReferenced.has(id))
        if (removable.length > 0) {
          deleted.audioBlobs = await db.audioBlobs.where('id').anyOf(removable).delete()
        }
      }

      deleted.recordings = await demoRowsOnly(db.recordings).delete()
      deleted.assessments = await demoRowsOnly(db.assessments).delete()
      deleted.patients = await demoRowsOnly(db.patients).delete()

      await db.appMeta.delete(DEMO_SEED_META_KEY)
      await clearDemoMode(db)
    },
  )

  // An unlogged deletion is the one thing an audit trail should never miss,
  // even when everything it removed was fictional — that it was all fictional
  // is precisely the claim the entry needs to be able to support. Logged after
  // the transaction for the same scoping reason as the seed above.
  await logAction(
    {
      userId: actor,
      actionCode: DEMO_AUDIT_ACTIONS.DEMO_DATA_RESET,
      entityType: 'demoDataset',
      // `demoModeCleared` records the side effect, so the absence of a separate
      // "demo mode disabled" entry beside this one is not read as a gap.
      detail: { removed: deleted, demoModeCleared: true },
    },
    db,
  )

  return { deleted }
}
