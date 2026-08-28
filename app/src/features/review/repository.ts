/**
 * The practitioner review data layer.
 *
 * The product's entire safety argument is that a qualified person reviews every
 * AI output before it becomes advice. Two properties make that argument hold,
 * and both live here rather than in a screen:
 *
 * 1. **The AI's stored output is never mutated by a review.** A review is a
 *    separate record that snapshots what the model said at the time. Nothing in
 *    this module writes to a recording's `ai*` fields or to an assessment's
 *    `aiSeverity`. Without that, a later analysis cannot tell what the model
 *    actually predicted versus what a clinician corrected it to, and the
 *    research data stops being trustworthy. It is not retrofittable.
 *
 * 2. **A practitioner only ever sees their own patients**, enforced by the
 *    query rather than by the view.
 *
 * Review rows follow the shape the schema implies: a row with no `recordingId`
 * is the assessment-level conclusion; a row with one is a judgement about that
 * lung location. Auscultation findings are per-location — confirming the model
 * at one site while disagreeing at another is ordinary, not an edge case — and
 * `researchLabels` is keyed per recording, so a per-location judgement is what
 * lets ground truth be traced back to the clinician who made it.
 */

import { createAuditLogger } from '../../audit/audit'
import {
  AI_STATUS,
  CLASSIFICATION_CODES,
  INTERPRETATION_CODES,
  REVIEW_STATUSES,
  ROLES,
  type ClassificationCode,
  type InterpretationCode,
  type LocationCode,
  type ReviewStatus,
  type Role,
} from '../../db/codes'
import { db as defaultDb, type AuscultaDB } from '../../db/db'
import type { Assessment, ClinicalReview, Patient, Recording } from '../../db/types'
import { readDemoMode } from '../demo/demoMode'
import { isVisible } from '../demo/visibility'

export const REVIEW_AUDIT_ACTIONS = {
  REVIEW_SUBMITTED: 'REVIEW_SUBMITTED',
  REVIEW_REPEAT_REQUESTED: 'REVIEW_REPEAT_REQUESTED',
} as const

export const REVIEW_ERRORS = {
  NOT_FOUND: 'REVIEW_NOT_FOUND',
  NOT_PERMITTED: 'REVIEW_NOT_PERMITTED',
  INVALID_INTERPRETATION: 'REVIEW_INVALID_INTERPRETATION',
  NOTES_REQUIRED: 'REVIEW_NOTES_REQUIRED',
  MODIFIED_CLASSIFICATION_REQUIRED: 'REVIEW_MODIFIED_CLASSIFICATION_REQUIRED',
  LOCATION_REQUIRED: 'REVIEW_LOCATION_REQUIRED',
  UNKNOWN_RECORDING: 'REVIEW_UNKNOWN_RECORDING',
} as const

export type ReviewErrorCode = (typeof REVIEW_ERRORS)[keyof typeof REVIEW_ERRORS]

export class ReviewError extends Error {
  constructor(
    readonly code: ReviewErrorCode,
    readonly detail?: unknown,
  ) {
    super(code)
    this.name = 'ReviewError'
  }
}

export interface Actor {
  id: string
  role: Role
}

/** Only these roles review. A health worker records; they do not adjudicate. */
export const ROLES_THAT_CAN_REVIEW: readonly Role[] = [ROLES.PRACTITIONER, ROLES.ADMIN]

/**
 * What each outcome means for the assessment's status.
 *
 * MODIFIED maps to APPROVED because the practitioner has reached a conclusion —
 * they changed the label, they did not defer. UNCERTAIN and REPEAT_REQUESTED
 * both leave the case open, because in both the clinical question is still
 * unanswered.
 */
export const STATUS_FOR_INTERPRETATION: Record<InterpretationCode, ReviewStatus> = {
  [INTERPRETATION_CODES.CONFIRMED]: REVIEW_STATUSES.APPROVED,
  [INTERPRETATION_CODES.DISAGREED]: REVIEW_STATUSES.DISAPPROVED,
  [INTERPRETATION_CODES.MODIFIED]: REVIEW_STATUSES.APPROVED,
  [INTERPRETATION_CODES.UNCERTAIN]: REVIEW_STATUSES.FURTHER_REVIEW_REQUESTED,
  [INTERPRETATION_CODES.REPEAT_REQUESTED]: REVIEW_STATUSES.FURTHER_REVIEW_REQUESTED,
}

/** Outcomes that make no sense without naming a lung location. */
const LOCATION_SCOPED_OUTCOMES: readonly InterpretationCode[] = [
  INTERPRETATION_CODES.MODIFIED,
  INTERPRETATION_CODES.REPEAT_REQUESTED,
]

/** Outcomes where the practitioner must say why. */
const OUTCOMES_REQUIRING_NOTES: readonly InterpretationCode[] = [
  INTERPRETATION_CODES.DISAGREED,
  INTERPRETATION_CODES.UNCERTAIN,
  INTERPRETATION_CODES.REPEAT_REQUESTED,
]

/**
 * Classifications that mean "something worth a closer look".
 *
 * HEALTHY is the only one that is not. This drives triage, so it is stated once
 * here rather than re-derived on each screen.
 */
const FLAGGING_CLASSIFICATIONS: readonly ClassificationCode[] = [
  CLASSIFICATION_CODES.ASTHMA,
  CLASSIFICATION_CODES.BRONCHIOLITIS,
  CLASSIFICATION_CODES.PNEUMONIA,
]

export function isFlagging(recording: Recording): boolean {
  return (
    recording.aiStatus === AI_STATUS.ANALYZED &&
    recording.aiClassification !== undefined &&
    FLAGGING_CLASSIFICATIONS.includes(recording.aiClassification)
  )
}

export function isUnusable(recording: Recording): boolean {
  return (
    recording.aiStatus === AI_STATUS.INSUFFICIENT_QUALITY ||
    recording.aiStatus === AI_STATUS.ERROR
  )
}

export interface TriageInputs {
  flaggedCount: number
  unusableCount: number
  recordingCount: number
  waitingDays: number
}

/**
 * How urgent a waiting case is, stated explicitly rather than implied by a sort.
 *
 * The ordering this produces, in words:
 *
 * - Any flagged location outranks every case with none, no matter how long the
 *   unflagged one has waited. A queue that lets waiting time overtake a finding
 *   buries the case that needed attention under old routine ones.
 * - Among flagged cases, more flagged locations first.
 * - A recording the model could not use ranks above a clear one, because
 *   nothing was decided about that patient at all and a human still has to look.
 * - Ties break by who has waited longest, capped, so nothing is starved but the
 *   cap keeps waiting from ever crossing the flagged/unflagged boundary.
 *
 * This is a workload heuristic, not a clinical priority score. It orders a
 * queue using a model that is right about 71% of the time; it does not claim
 * one patient is sicker than another, and no screen should present it as such.
 */
export const TRIAGE_WEIGHTS = {
  anyFlagged: 100,
  perFlaggedLocation: 10,
  anyUnusable: 5,
  perWaitingDay: 1,
  maxWaitingDays: 14,
} as const

export function triageScore(inputs: TriageInputs): number {
  const flagged = inputs.flaggedCount > 0 ? TRIAGE_WEIGHTS.anyFlagged : 0
  const perLocation = inputs.flaggedCount * TRIAGE_WEIGHTS.perFlaggedLocation
  const unusable = inputs.unusableCount > 0 ? TRIAGE_WEIGHTS.anyUnusable : 0
  const waiting =
    Math.min(Math.max(inputs.waitingDays, 0), TRIAGE_WEIGHTS.maxWaitingDays) *
    TRIAGE_WEIGHTS.perWaitingDay

  return flagged + perLocation + unusable + waiting
}

export interface QueueItem {
  assessment: Assessment
  patient: Patient
  recordingCount: number
  flaggedCount: number
  unusableCount: number
  waitingDays: number
  score: number
}

/** One lung location, with everything needed to judge it. */
export interface LocationCase {
  recording: Recording
  locationCode: LocationCode
  /**
   * The audio itself, loaded here so the screen never reaches into the
   * database on its own. Undefined when the blob is missing, which the view
   * must show as a failure rather than as silence.
   */
  audioBlob?: Blob
  /** The most recent earlier recording at this location, if any. */
  previous?: Recording
  /**
   * Whether the pattern differs from `previous`. Undefined when there is no
   * previous recording — a comparison against nothing is how "improving" or
   * "deteriorating" gets implied from a single data point.
   */
  changed?: boolean
}

export interface ClinicalCase {
  assessment: Assessment
  patient: Patient
  locations: LocationCase[]
  reviews: ClinicalReview[]
}

export interface LocationJudgementInput {
  recordingId: string
  interpretationCode: InterpretationCode
  modifiedClassificationCode?: ClassificationCode
  notes?: string
}

export interface SubmitReviewInput {
  /** The overall conclusion for the assessment. */
  interpretationCode: InterpretationCode
  notes: string
  /**
   * Optional per-location judgements. The form defaults to none — one overall
   * decision in one action — and adds entries only where the practitioner
   * wants to say something about a specific site.
   */
  locations?: readonly LocationJudgementInput[]
}

export interface SubmitReviewResult {
  /** The assessment-level row. Its `recordingId` is always undefined. */
  overall: ClinicalReview
  /** Location-scoped rows, one per judgement. */
  locations: ClinicalReview[]
}

export interface RepeatRequest {
  recordingId: string
  locationCode: LocationCode
  reason: string
  requestedAt: string
  requestedBy: string
}

export interface QueueFilter {
  status?: ReviewStatus
}

/** What the AI said, frozen into the review. */
interface AiSnapshotEntry {
  recordingId: string
  locationCode: LocationCode
  aiStatus: string
  aiClassification?: ClassificationCode
  aiConfidence?: number
  uncertainFlag?: boolean
  modelVersion?: string
  capturedAt: string
}

const INTERPRETATION_VALUES: readonly string[] = Object.values(INTERPRETATION_CODES)
const CLASSIFICATION_VALUES: readonly string[] = Object.values(CLASSIFICATION_CODES)

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function createReviewRepository(database: AuscultaDB = defaultDb) {
  const audit = createAuditLogger(database)

  function canReview(actor: Actor): boolean {
    return ROLES_THAT_CAN_REVIEW.includes(actor.role)
  }

  /** A practitioner's caseload is the patients assigned to them. Admin sees all. */
  function patientVisibleTo(patient: Patient, actor: Actor): boolean {
    if (actor.role === ROLES.ADMIN) return true
    if (actor.role === ROLES.PRACTITIONER) {
      return patient.assignedPractitionerIds.includes(actor.id)
    }
    return false
  }

  async function loadCase(
    assessmentId: string,
    actor: Actor,
  ): Promise<{ assessment: Assessment; patient: Patient } | undefined> {
    if (!canReview(actor)) return undefined

    const assessment = await database.assessments.get(assessmentId)
    if (assessment === undefined) return undefined

    const patient = await database.patients.get(assessment.patientId)
    if (patient === undefined) return undefined
    if (!patientVisibleTo(patient, actor)) return undefined

    const demoEnabled = await readDemoMode(database)
    if (!isVisible(assessment, demoEnabled) || !isVisible(patient, demoEnabled)) {
      return undefined
    }

    return { assessment, patient }
  }

  async function queue(actor: Actor, filter: QueueFilter = {}): Promise<QueueItem[]> {
    if (!canReview(actor)) return []

    const demoEnabled = await readDemoMode(database)
    const status = filter.status ?? REVIEW_STATUSES.PENDING_REVIEW

    const assessments = (await database.assessments.toArray()).filter(
      (a) => a.reviewStatus === status && isVisible(a, demoEnabled),
    )

    const now = Date.now()
    const items: QueueItem[] = []

    for (const assessment of assessments) {
      const patient = await database.patients.get(assessment.patientId)
      if (patient === undefined) continue
      if (!patientVisibleTo(patient, actor)) continue
      if (!isVisible(patient, demoEnabled)) continue

      const recordings = await database.recordings
        .where('assessmentId')
        .equals(assessment.id)
        .toArray()

      const flaggedCount = recordings.filter(isFlagging).length
      const unusableCount = recordings.filter(isUnusable).length
      const waitingDays = Math.max(
        0,
        Math.floor((now - new Date(assessment.date).getTime()) / MS_PER_DAY),
      )

      items.push({
        assessment,
        patient,
        recordingCount: recordings.length,
        flaggedCount,
        unusableCount,
        waitingDays,
        score: triageScore({
          flaggedCount,
          unusableCount,
          recordingCount: recordings.length,
          waitingDays,
        }),
      })
    }

    return items.sort((a, b) => b.score - a.score || a.assessment.date.localeCompare(b.assessment.date))
  }

  async function getCase(
    assessmentId: string,
    actor: Actor,
  ): Promise<ClinicalCase | undefined> {
    const found = await loadCase(assessmentId, actor)
    if (found === undefined) return undefined
    const { assessment, patient } = found

    const recordings = await database.recordings
      .where('assessmentId')
      .equals(assessment.id)
      .toArray()

    // Every earlier recording for this patient, so each location can find its
    // own most recent predecessor without a query per location.
    const history = (
      await database.recordings.where('patientId').equals(patient.id).toArray()
    ).filter((r) => r.assessmentId !== assessment.id)

    const locations: LocationCase[] = []
    for (const recording of recordings.sort((a, b) =>
      a.locationCode.localeCompare(b.locationCode),
    )) {
      locations.push(await buildLocationCase(recording, history))
    }

    const reviews = await database.clinicalReviews
      .where('assessmentId')
      .equals(assessment.id)
      .toArray()

    return { assessment, patient, locations, reviews }
  }

  async function buildLocationCase(
    recording: Recording,
    history: readonly Recording[],
  ): Promise<LocationCase> {
    const blobRow = await database.audioBlobs.get(recording.audioBlobId)
    const audio = blobRow?.blob

    return ((recording) => {
      const previous = history
        .filter(
          (r) =>
            r.locationCode === recording.locationCode && r.createdAt < recording.createdAt,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

      if (previous === undefined) {
        // No `changed` at all rather than `false`: there is nothing to compare.
        return {
          recording,
          locationCode: recording.locationCode,
          ...(audio !== undefined && { audioBlob: audio }),
        }
      }

      return {
        recording,
        locationCode: recording.locationCode,
        ...(audio !== undefined && { audioBlob: audio }),
        previous,
        changed: previous.aiClassification !== recording.aiClassification,
      }
    })(recording)
  }

  function snapshotOf(recordings: readonly Recording[], at: string): AiSnapshotEntry[] {
    return recordings.map((r) => ({
      recordingId: r.id,
      locationCode: r.locationCode,
      aiStatus: r.aiStatus,
      ...(r.aiClassification !== undefined && { aiClassification: r.aiClassification }),
      ...(r.aiConfidence !== undefined && { aiConfidence: r.aiConfidence }),
      ...(r.uncertainFlag !== undefined && { uncertainFlag: r.uncertainFlag }),
      ...(r.modelVersion !== undefined && { modelVersion: r.modelVersion }),
      capturedAt: at,
    }))
  }

  function validate(input: SubmitReviewInput, recordingIds: ReadonlySet<string>): void {
    if (!INTERPRETATION_VALUES.includes(input.interpretationCode)) {
      throw new ReviewError(REVIEW_ERRORS.INVALID_INTERPRETATION)
    }

    const notes = input.notes.trim()
    if (OUTCOMES_REQUIRING_NOTES.includes(input.interpretationCode) && notes === '') {
      throw new ReviewError(REVIEW_ERRORS.NOTES_REQUIRED)
    }

    const locations = input.locations ?? []

    // Modify and repeat-requested are statements about a site, so one must be
    // named. A repeat request without a location tells the health worker to do
    // "it" again, which is not actionable.
    if (LOCATION_SCOPED_OUTCOMES.includes(input.interpretationCode) && locations.length === 0) {
      throw new ReviewError(REVIEW_ERRORS.LOCATION_REQUIRED)
    }

    for (const judgement of locations) {
      if (!INTERPRETATION_VALUES.includes(judgement.interpretationCode)) {
        throw new ReviewError(REVIEW_ERRORS.INVALID_INTERPRETATION)
      }
      if (!recordingIds.has(judgement.recordingId)) {
        throw new ReviewError(REVIEW_ERRORS.UNKNOWN_RECORDING)
      }
      if (judgement.interpretationCode === INTERPRETATION_CODES.MODIFIED) {
        const replacement = judgement.modifiedClassificationCode
        if (replacement === undefined || !CLASSIFICATION_VALUES.includes(replacement)) {
          throw new ReviewError(REVIEW_ERRORS.MODIFIED_CLASSIFICATION_REQUIRED)
        }
      }
    }
  }

  /**
   * Records a practitioner's judgement.
   *
   * Writes review rows and updates the assessment's own review fields. It never
   * writes to a recording, and never to `assessment.aiSeverity` — that is the
   * immutability guarantee, and `repository.test.ts` asserts the recording rows
   * are deep-equal before and after.
   */
  async function submitReview(
    assessmentId: string,
    input: SubmitReviewInput,
    actor: Actor,
  ): Promise<SubmitReviewResult> {
    if (!canReview(actor)) throw new ReviewError(REVIEW_ERRORS.NOT_PERMITTED)

    const found = await loadCase(assessmentId, actor)
    if (found === undefined) throw new ReviewError(REVIEW_ERRORS.NOT_FOUND)
    const { assessment, patient } = found

    const recordings = await database.recordings
      .where('assessmentId')
      .equals(assessment.id)
      .toArray()

    validate(input, new Set(recordings.map((r) => r.id)))

    const reviewedAt = new Date().toISOString()
    const snapshot = snapshotOf(recordings, reviewedAt)
    const notes = input.notes.trim()

    const overall: ClinicalReview = {
      id: crypto.randomUUID(),
      assessmentId: assessment.id,
      practitionerId: actor.id,
      aiResultSnapshot: snapshot,
      interpretationCode: input.interpretationCode,
      notes,
      reviewedAt,
    }

    const locationRows: ClinicalReview[] = (input.locations ?? []).map((judgement) => ({
      id: crypto.randomUUID(),
      assessmentId: assessment.id,
      recordingId: judgement.recordingId,
      practitionerId: actor.id,
      aiResultSnapshot: snapshot.filter((s) => s.recordingId === judgement.recordingId),
      interpretationCode: judgement.interpretationCode,
      ...(judgement.modifiedClassificationCode !== undefined && {
        modifiedClassificationCode: judgement.modifiedClassificationCode,
      }),
      // A location row with no note of its own inherits the overall reason, so
      // a repeat request always reaches the health worker with a why attached.
      notes: (judgement.notes ?? '').trim() || notes,
      reviewedAt,
    }))

    await database.clinicalReviews.bulkAdd([overall, ...locationRows])

    // Only the practitioner-facing fields change. aiSeverity is not touched.
    await database.assessments.update(assessment.id, {
      reviewStatus: STATUS_FOR_INTERPRETATION[input.interpretationCode],
      practitionerReviewerId: actor.id,
      practitionerSeverity: {
        interpretation: input.interpretationCode,
        notes,
        reviewedAt,
      },
    })

    // Notes are clinical content about a patient; the trail records that a
    // review happened and what was decided, not what was written in it.
    await audit({
      userId: actor.id,
      actionCode: REVIEW_AUDIT_ACTIONS.REVIEW_SUBMITTED,
      entityType: 'assessment',
      entityId: assessment.id,
      patientId: patient.id,
      detail: {
        interpretationCode: input.interpretationCode,
        locationJudgements: locationRows.length,
        reviewStatus: STATUS_FOR_INTERPRETATION[input.interpretationCode],
      },
    })

    if (input.interpretationCode === INTERPRETATION_CODES.REPEAT_REQUESTED) {
      await audit({
        userId: actor.id,
        actionCode: REVIEW_AUDIT_ACTIONS.REVIEW_REPEAT_REQUESTED,
        entityType: 'assessment',
        entityId: assessment.id,
        patientId: patient.id,
        detail: { recordingIds: locationRows.map((r) => r.recordingId) },
      })
    }

    return { overall, locations: locationRows }
  }

  /**
   * Outstanding repeat requests, resolved to a location and a reason.
   *
   * This is what the health worker needs: which site to record again, and why
   * the last attempt was not usable.
   */
  async function repeatRequestsFor(assessmentId: string): Promise<RepeatRequest[]> {
    const reviews = await database.clinicalReviews
      .where('assessmentId')
      .equals(assessmentId)
      .toArray()

    const requests: RepeatRequest[] = []
    for (const review of reviews) {
      if (review.interpretationCode !== INTERPRETATION_CODES.REPEAT_REQUESTED) continue
      if (review.recordingId === undefined) continue

      const recording = await database.recordings.get(review.recordingId)
      if (recording === undefined) continue

      requests.push({
        recordingId: review.recordingId,
        locationCode: recording.locationCode,
        reason: review.notes,
        requestedAt: review.reviewedAt,
        requestedBy: review.practitionerId,
      })
    }
    return requests
  }

  return { queue, getCase, submitReview, repeatRequestsFor }
}

export type ReviewRepository = ReturnType<typeof createReviewRepository>
