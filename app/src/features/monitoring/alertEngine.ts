/**
 * The alerts engine.
 *
 * Pure logic: it reads a patient's history and returns the alerts that should
 * exist. It touches no database, no clock beyond the `now` it is handed, and no
 * translation — so every rule below can be tested against a synthetic history,
 * and a rule's behaviour is a property of this file rather than of the app it
 * happens to be running in.
 *
 * TWO RULES ABOUT WORDING, which matter more than the thresholds:
 *
 * 1. **An alert never makes a clinical claim.** It reports what was observed
 *    between recordings — "a change in respiratory sound pattern was detected"
 *    — never what it means for the person. The app observes; a clinician
 *    concludes. Nothing in this module names a diagnosis, a direction of
 *    travel, or a prognosis, and the display strings it points at are written
 *    the same way.
 *
 * 2. **Nothing here stores a sentence.** An alert carries its type code and a
 *    parameter bundle; the screen renders the words in the reader's language.
 *    Storing English in the row would make an alert unreadable in Filipino and
 *    unusable in a research export.
 *
 * WHY THE DEFINITION OF "FLAGGED" IS IMPORTED rather than restated: it comes
 * from the review feature, so the alerts engine and the practitioner's review
 * queue can never disagree about which recordings are abnormal. Two definitions
 * would drift, and an alert that fires for a case the queue does not flag is
 * worse than no alert at all.
 */

import {
  ALERT_TYPES,
  type AlertType,
  type ClassificationCode,
  type LocationCode,
} from '../../db/codes'
import type { Recording } from '../../db/types'
import { isFlagging, isUnusable } from '../review/repository'

// ---------------------------------------------------------------------------
// Thresholds, named so a clinician can read them
// ---------------------------------------------------------------------------

/**
 * How many consecutive assessments at one location must be flagged before the
 * finding is called persistent.
 *
 * Three, not two. NEW_ABNORMAL already fires the first time something appears;
 * calling it persistent the very next time would make "persistent" mean
 * "twice", which is not what the word means to a clinician reading it. The
 * consequence is deliberate: with fewer than three assessments this rule
 * cannot fire, because persistence is not a property you can establish from
 * two data points.
 */
export const PERSISTENT_MIN_CONSECUTIVE = 3

/**
 * Repeated poor quality is measured across VISITS, not across recordings.
 *
 * Six unusable recordings in one session is one bad session — a flat battery,
 * a noisy room, a restless child. The signal that something is wrong with the
 * technique or the microphone is the same health worker producing unusable
 * audio again on a different day, so the rule asks how many of the recent
 * assessments went badly rather than how many recordings did.
 */
export const POOR_QUALITY_WINDOW_ASSESSMENTS = 3
export const POOR_QUALITY_MIN_ASSESSMENTS = 2

/**
 * Grace period before a missed assessment is reported.
 *
 * A plan asking for a weekly recording does not become a missed one the moment
 * the seventh day passes: clinics close, patients travel, and an alert that
 * fires on the exact due date trains people to ignore alerts. The grace is a
 * fraction of the interval rather than a fixed number of days, so a daily plan
 * and a monthly plan are both treated proportionately.
 */
export const MISSED_GRACE_FRACTION = 0.5

const MS_PER_DAY = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One recording, reduced to what the rules actually reason about. */
export interface RecordingSnapshot {
  recordingId: string
  locationCode: LocationCode
  /** The app flagged a pattern worth a closer look. */
  flagged: boolean
  /** The audio could not be used, so nothing was decided from it. */
  unusable: boolean
  classificationCode?: ClassificationCode
}

export interface AssessmentSnapshot {
  assessmentId: string
  /** ISO-8601. */
  date: string
  recordings: readonly RecordingSnapshot[]
}

/** The parts of a monitoring plan the rules need. */
export interface MonitoringExpectation {
  /** Days between expected assessments. */
  intervalDays: number
  /** Only an approved, active plan creates an expectation. */
  active: boolean
}

export interface AlertEvaluationInput {
  /** Chronological, oldest first. The rules depend on that order. */
  history: readonly AssessmentSnapshot[]
  expectation?: MonitoringExpectation | null
  now: Date
}

/**
 * A proposed alert.
 *
 * No id and no timestamp: those belong to whoever persists it. `params` is the
 * evidence, and is what the display string interpolates — never a sentence.
 */
export interface AlertProposal {
  typeCode: AlertType
  /** Set when the alert is about one lung location. */
  locationCode?: LocationCode
  params: Record<string, string | number>
}

// ---------------------------------------------------------------------------
// Building snapshots from stored rows
// ---------------------------------------------------------------------------

export function snapshotRecording(recording: Recording): RecordingSnapshot {
  return {
    recordingId: recording.id,
    locationCode: recording.locationCode,
    flagged: isFlagging(recording),
    unusable: isUnusable(recording),
    ...(recording.aiClassification !== undefined && {
      classificationCode: recording.aiClassification,
    }),
  }
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function atLocation(
  assessment: AssessmentSnapshot,
  locationCode: LocationCode,
): RecordingSnapshot | undefined {
  return assessment.recordings.find((r) => r.locationCode === locationCode)
}

/**
 * NEW_ABNORMAL — the app flagged a location it did not flag last time.
 *
 * In words: at this lung location the app reported a pattern worth a closer
 * look, and at the previous assessment of the same location it did not. A
 * location with no earlier recording counts as new, because the finding is new
 * to whoever is reading.
 *
 * Deliberately silent when the previous recording was unusable: nothing was
 * decided then, so there is no "did not flag" to contrast against, and saying
 * a finding is new would be an artefact of a failed recording rather than an
 * observation about the patient.
 */
function newAbnormal(
  current: AssessmentSnapshot,
  previous: AssessmentSnapshot | undefined,
): AlertProposal[] {
  const proposals: AlertProposal[] = []

  for (const recording of current.recordings) {
    if (!recording.flagged) continue

    const before = previous === undefined ? undefined : atLocation(previous, recording.locationCode)
    if (before !== undefined && before.unusable) continue
    if (before !== undefined && before.flagged) continue

    proposals.push({
      typeCode: ALERT_TYPES.NEW_ABNORMAL,
      locationCode: recording.locationCode,
      params: { locationCode: recording.locationCode, date: current.date },
    })
  }
  return proposals
}

/**
 * PERSISTENT_ABNORMAL — the same location has been flagged every time for a
 * while.
 *
 * In words: at this lung location the app has reported a pattern worth a closer
 * look in the last PERSISTENT_MIN_CONSECUTIVE assessments in a row, including
 * the most recent one. Assessments where that location was not recorded break
 * the run, because a gap is not evidence of continuity.
 */
function persistentAbnormal(history: readonly AssessmentSnapshot[]): AlertProposal[] {
  const latest = history[history.length - 1]
  if (latest === undefined) return []

  const proposals: AlertProposal[] = []

  for (const recording of latest.recordings) {
    if (!recording.flagged) continue

    let run = 0
    for (let i = history.length - 1; i >= 0; i--) {
      const at = atLocation(history[i], recording.locationCode)
      if (at === undefined || !at.flagged) break
      run += 1
    }

    if (run >= PERSISTENT_MIN_CONSECUTIVE) {
      proposals.push({
        typeCode: ALERT_TYPES.PERSISTENT_ABNORMAL,
        locationCode: recording.locationCode,
        params: { locationCode: recording.locationCode, count: run },
      })
    }
  }
  return proposals
}

/**
 * SIGNIFICANT_CHANGE — the pattern at a location is not the one reported last
 * time.
 *
 * In words: between the previous recording of this location and the current
 * one, the app reported a different respiratory sound pattern. It says nothing
 * about whether that is better or worse, because the app cannot know that.
 *
 * Does not fire for a change INTO a flagged state — NEW_ABNORMAL already
 * reports that, and two alerts for one event is noise. Needs both recordings to
 * have been decided: a change measured against an unusable recording is a
 * change in recording quality, not in the patient.
 */
function significantChange(
  current: AssessmentSnapshot,
  previous: AssessmentSnapshot | undefined,
): AlertProposal[] {
  if (previous === undefined) return []
  const proposals: AlertProposal[] = []

  for (const recording of current.recordings) {
    const before = atLocation(previous, recording.locationCode)
    if (before === undefined) continue
    if (recording.unusable || before.unusable) continue
    if (recording.classificationCode === undefined || before.classificationCode === undefined) {
      continue
    }
    if (recording.classificationCode === before.classificationCode) continue

    // Already reported as a new finding; do not say it twice.
    if (recording.flagged && !before.flagged) continue

    proposals.push({
      typeCode: ALERT_TYPES.SIGNIFICANT_CHANGE,
      locationCode: recording.locationCode,
      params: { locationCode: recording.locationCode },
    })
  }
  return proposals
}

/**
 * MISSED_MONITORING — an approved plan expected an assessment by now.
 *
 * In words: this patient has an active monitoring plan asking for an assessment
 * every N days, and the most recent one is older than N days plus a grace
 * period. An inactive or unapproved plan creates no expectation, so it cannot
 * be missed.
 */
function missedMonitoring(
  history: readonly AssessmentSnapshot[],
  expectation: MonitoringExpectation | null | undefined,
  now: Date,
): AlertProposal[] {
  if (expectation === null || expectation === undefined) return []
  if (!expectation.active) return []
  if (expectation.intervalDays <= 0) return []

  const latest = history[history.length - 1]
  const since = latest === undefined ? undefined : new Date(latest.date).getTime()
  if (since === undefined || Number.isNaN(since)) return []

  const dueAfterDays = expectation.intervalDays * (1 + MISSED_GRACE_FRACTION)
  const elapsedDays = (now.getTime() - since) / MS_PER_DAY
  if (elapsedDays <= dueAfterDays) return []

  return [
    {
      typeCode: ALERT_TYPES.MISSED_MONITORING,
      params: {
        intervalDays: expectation.intervalDays,
        elapsedDays: Math.floor(elapsedDays),
        lastAssessmentDate: latest.date,
      },
    },
  ]
}

/**
 * REPEATED_POOR_QUALITY — recordings keep coming back unusable.
 *
 * In words: in at least POOR_QUALITY_MIN_ASSESSMENTS of the last
 * POOR_QUALITY_WINDOW_ASSESSMENTS visits, at least one recording could not be
 * used.
 *
 * This is the rule that earns its keep in the field, and it is about the
 * EQUIPMENT AND THE TECHNIQUE, not about the patient. Audio that keeps failing
 * usually means the bell is not sealed against the skin, the room is too loud,
 * or the microphone is failing — and nobody finds that out unless something
 * tells them, because each individual failure looks like bad luck. Its display
 * string must therefore address the person recording, not describe the person
 * being recorded.
 */
function repeatedPoorQuality(history: readonly AssessmentSnapshot[]): AlertProposal[] {
  const window = history.slice(-POOR_QUALITY_WINDOW_ASSESSMENTS)
  if (window.length < POOR_QUALITY_MIN_ASSESSMENTS) return []

  const badVisits = window.filter((assessment) =>
    assessment.recordings.some((r) => r.unusable),
  )
  if (badVisits.length < POOR_QUALITY_MIN_ASSESSMENTS) return []

  // Only worth saying if the most recent visit is one of them; otherwise the
  // problem may already have been fixed and the alert is stale on arrival.
  const latest = window[window.length - 1]
  if (latest === undefined || !latest.recordings.some((r) => r.unusable)) return []

  return [
    {
      typeCode: ALERT_TYPES.REPEATED_POOR_QUALITY,
      params: {
        affectedVisits: badVisits.length,
        ofVisits: window.length,
      },
    },
  ]
}

/**
 * Every alert this patient's history warrants, in a stable order.
 *
 * The order is fixed so two runs over the same history produce the same list,
 * which is what lets the caller compare against what is already open and raise
 * only what is genuinely new.
 */
export function evaluateAlerts(input: AlertEvaluationInput): AlertProposal[] {
  const history = input.history
  const current = history[history.length - 1]
  if (current === undefined) {
    // No assessments at all. A plan can still have been missed.
    return missedMonitoring(history, input.expectation, input.now)
  }
  const previous = history[history.length - 2]

  return [
    ...newAbnormal(current, previous),
    ...persistentAbnormal(history),
    ...significantChange(current, previous),
    ...repeatedPoorQuality(history),
    ...missedMonitoring(history, input.expectation, input.now),
  ]
}

/**
 * A stable identity for a proposal, so an alert that is already open is not
 * raised again on every save.
 *
 * Two proposals are the same alert when they are the same type about the same
 * location. The parameters deliberately do not participate: a persistent
 * finding whose run count has grown from three to four is still the same
 * standing alert, and re-raising it would bury the practitioner in duplicates
 * of something they have already seen.
 */
export function alertIdentity(proposal: AlertProposal): string {
  return `${proposal.typeCode}:${proposal.locationCode ?? '-'}`
}
