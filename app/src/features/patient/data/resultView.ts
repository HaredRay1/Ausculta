import { RESULT_VERDICTS, type ResultVerdict } from '../../../components'
import {
  AI_STATUS,
  CLASSIFICATION_CODES,
  REVIEW_STATUSES,
  type ClassificationCode,
  type LocationCode,
  type ReviewStatus,
} from '../../../db/codes'
import type { Assessment, Recording } from '../../../db/types'

/**
 * One stored recording -> everything a patient screen is allowed to show about
 * it.
 *
 * This module is the single enforcement point for the hard project rule: **a
 * degraded state renders no number anywhere.** The screens render this object
 * and nothing else, so "there is no confidence to show" is a property of the
 * data a test can assert on, rather than a branch of JSX where a stray
 * `{recording.aiConfidence}` could survive review.
 *
 * It mirrors `features/assessment/analysis/verdict.ts`, which does the same job
 * for a live analysis result. The difference is the input: that module reads an
 * in-memory `AnalysisResult`, this one reads a `Recording` row that may have
 * been written weeks ago by a different version of the app — so it treats every
 * field as untrusted and withholds a number unless the row positively earns it.
 */

/** Every state a stored recording can be in, from a patient's point of view. */
export type PatientResultState =
  | 'suggestive'
  | 'no-abnormality'
  | 'uncertain'
  | 'insufficient-quality'
  | 'not-analysed'
  | 'model-not-connected'
  | 'error'

/**
 * The states that have a `ResultVerdict`, and therefore a `ResultCard` with its
 * fixed safety wording. The remaining three are not verdicts about the person
 * at all — nothing was decided — so they get an explicit "nothing decided"
 * panel instead of a card that would imply one.
 */
const STATE_VERDICT: Readonly<Partial<Record<PatientResultState, ResultVerdict>>> = {
  suggestive: RESULT_VERDICTS.SUGGESTIVE,
  'no-abnormality': RESULT_VERDICTS.NO_ABNORMALITY_DETECTED,
  uncertain: RESULT_VERDICTS.UNCERTAIN,
  'insufficient-quality': RESULT_VERDICTS.INSUFFICIENT_QUALITY,
}

export interface PatientRecordingView {
  recordingId: string
  locationCode: LocationCode
  state: PatientResultState
  /** Null for the states where nothing was decided about the person. */
  verdict: ResultVerdict | null
  /**
   * The condition the app thought the sound resembled, as a CODE. Present only
   * for `suggestive` — the only state that names anything.
   */
  conditionCode?: ClassificationCode
  /**
   * Whole percent, present ONLY for `suggestive`.
   *
   * Whole numbers because the model is roughly 71 % accurate; a decimal place
   * would be false precision dressed up as measurement. Absent everywhere else,
   * including `no-abnormality` — a percentage beside "nothing unusual heard"
   * reads as confidence that the person is well, which nothing here supports.
   */
  confidencePercent?: number
  /** Which listening tool produced this, when one ran at all. */
  modelVersion?: string
  /** Whether the stored row carries a quality report. */
  hasQualityReport: boolean
  durationSec: number
  audioBlobId: string
  assessmentId: string
  createdAt: string
}

/** `true` when `value` is a probability we are willing to render as a percent. */
function isUsableConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

/**
 * The state of one stored recording.
 *
 * Ordered so that every "no answer" branch is taken before any branch that
 * could produce a number. `MODEL_NOT_CONNECTED`, `INSUFFICIENT_QUALITY`,
 * `PENDING` and `ERROR` all exit before the classification is even read.
 */
export function patientResultState(recording: Recording): PatientResultState {
  switch (recording.aiStatus) {
    case AI_STATUS.MODEL_NOT_CONNECTED:
      return 'model-not-connected'
    case AI_STATUS.INSUFFICIENT_QUALITY:
      return 'insufficient-quality'
    case AI_STATUS.PENDING:
      return 'not-analysed'
    case AI_STATUS.ERROR:
      return 'error'
    case AI_STATUS.ANALYZED:
      break
    default:
      // A status this build does not know about is not a result. Claiming
      // anything from it would be inventing a finding.
      return 'error'
  }

  if (recording.uncertainFlag === true) return 'uncertain'
  if (recording.aiClassification === undefined) {
    // Analysed but nothing named: that is precisely "the app could not tell".
    return 'uncertain'
  }
  if (recording.aiClassification === CLASSIFICATION_CODES.HEALTHY) return 'no-abnormality'
  return 'suggestive'
}

/** One recording row -> the view a patient screen renders. */
export function toPatientRecordingView(recording: Recording): PatientRecordingView {
  const state = patientResultState(recording)

  const base: PatientRecordingView = {
    recordingId: recording.id,
    locationCode: recording.locationCode,
    state,
    verdict: STATE_VERDICT[state] ?? null,
    hasQualityReport: recording.quality !== null && recording.quality !== undefined,
    durationSec: recording.durationSec,
    audioBlobId: recording.audioBlobId,
    assessmentId: recording.assessmentId,
    createdAt: recording.createdAt,
  }

  // The model version is only meaningful where a model ran. INSUFFICIENT_QUALITY
  // is rejected by the quality gate before inference, so no model ever saw it.
  if (
    typeof recording.modelVersion === 'string' &&
    state !== 'insufficient-quality' &&
    state !== 'model-not-connected' &&
    state !== 'not-analysed'
  ) {
    base.modelVersion = recording.modelVersion
  }

  if (state !== 'suggestive') return base

  const view: PatientRecordingView = { ...base, conditionCode: recording.aiClassification }
  if (isUsableConfidence(recording.aiConfidence)) {
    view.confidencePercent = Math.round(recording.aiConfidence * 100)
  }
  return view
}

/**
 * `true` when this view would put a numeral on screen.
 *
 * Exported so the rule can be asserted over a whole dataset rather than over a
 * handful of hand-picked examples — see resultView.test.ts.
 */
export function viewRendersANumber(view: PatientRecordingView): boolean {
  return view.confidencePercent !== undefined
}

// --- assessment level --------------------------------------------------------

/**
 * How loudly each state should speak when several are mixed together.
 *
 * Higher wins. Deliberately NOT "most common": if five zones were clear and one
 * was flagged, summarising the visit as "nothing unusual" would bury the only
 * part worth acting on. Equally, the two no-answer states outrank
 * `no-abnormality`, because "nothing unusual heard in the four zones we could
 * actually check" is not the same claim as "nothing unusual heard".
 */
const STATE_PROMINENCE: Record<PatientResultState, number> = {
  suggestive: 6,
  uncertain: 5,
  'insufficient-quality': 4,
  error: 3,
  'model-not-connected': 2,
  'not-analysed': 1,
  'no-abnormality': 0,
}

export type PatientResultCounts = Record<PatientResultState, number>

export function emptyResultCounts(): PatientResultCounts {
  return {
    suggestive: 0,
    'no-abnormality': 0,
    uncertain: 0,
    'insufficient-quality': 0,
    'not-analysed': 0,
    'model-not-connected': 0,
    error: 0,
  }
}

export interface AssessmentSummary {
  assessmentId: string
  date: string
  reviewStatus: ReviewStatus
  /** `true` once a practitioner has actually written something about it. */
  hasPractitionerReview: boolean
  /** The state the summary row leads with, or null when nothing was recorded. */
  dominantState: PatientResultState | null
  dominantVerdict: ResultVerdict | null
  counts: PatientResultCounts
  /** Locations recorded at this visit, in the order they were recorded. */
  locations: LocationCode[]
  recordedCount: number
  /** Zones that produced a usable answer about the sound. */
  usableCount: number
  views: PatientRecordingView[]
}

/**
 * A visit and its recordings -> the row a patient sees in "my results".
 *
 * Carries no severity of any kind. `Assessment.aiSeverity` exists in the schema
 * with status MODEL_NOT_CONNECTED and a null score, and the screens render a
 * NotConnectedPanel for it rather than a figure — so it deliberately never
 * enters this summary, where a later change could turn it into a number.
 */
export function summariseAssessment(
  assessment: Assessment,
  recordings: readonly Recording[],
): AssessmentSummary {
  const views = [...recordings]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toPatientRecordingView)

  const counts = emptyResultCounts()
  for (const view of views) counts[view.state] += 1

  let dominantState: PatientResultState | null = null
  for (const view of views) {
    if (dominantState === null || STATE_PROMINENCE[view.state] > STATE_PROMINENCE[dominantState]) {
      dominantState = view.state
    }
  }

  return {
    assessmentId: assessment.id,
    date: assessment.date,
    reviewStatus: assessment.reviewStatus,
    hasPractitionerReview:
      assessment.practitionerSeverity !== undefined &&
      assessment.reviewStatus !== REVIEW_STATUSES.DRAFT &&
      assessment.reviewStatus !== REVIEW_STATUSES.PENDING_REVIEW,
    dominantState,
    dominantVerdict: dominantState === null ? null : (STATE_VERDICT[dominantState] ?? null),
    counts,
    locations: views.map((view) => view.locationCode),
    recordedCount: views.length,
    usableCount: counts.suggestive + counts['no-abnormality'],
    views,
  }
}

/** The i18n key under `results.breakdown` for a state, for the counts line. */
export const BREAKDOWN_KEY: Record<PatientResultState, string> = {
  suggestive: 'suggestive',
  'no-abnormality': 'noAbnormality',
  uncertain: 'uncertain',
  'insufficient-quality': 'insufficientQuality',
  'not-analysed': 'notAnalysed',
  'model-not-connected': 'modelNotConnected',
  error: 'error',
}

/** The order the counts line lists states in: loudest first. */
export const BREAKDOWN_ORDER: readonly PatientResultState[] = [
  'suggestive',
  'uncertain',
  'insufficient-quality',
  'error',
  'model-not-connected',
  'not-analysed',
  'no-abnormality',
]
