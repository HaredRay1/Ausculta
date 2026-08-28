import type { AssessmentSummary, PatientResultState } from './resultView'

/**
 * Assessments over time.
 *
 * Asthma monitoring is the app's stated purpose, so this exists — but it is
 * built around one refusal: **a trend needs at least two points.** A line drawn
 * through a single visit shows a direction nobody measured, and a patient with
 * asthma reading a downward slope will act on it. `canDrawLine` is false below
 * `MIN_TREND_POINTS` and the screen shows an honest empty state instead.
 *
 * What is deliberately absent: any severity series. `Assessment.aiSeverity` is
 * MODEL_NOT_CONNECTED with a null score, and the screen renders that slot as
 * Not Available. Deriving a severity line from the flagged-zone count would be
 * a fabricated clinical value wearing a chart.
 */

/** Below this, there is no trend — only a point. */
export const MIN_TREND_POINTS = 2

export interface TrendPoint {
  assessmentId: string
  date: string
  /** Places the app flagged for a closer look at this visit. */
  flaggedZones: number
  /** Places that produced any usable answer about the sound. */
  usableZones: number
  /** Places recorded at all. */
  recordedZones: number
  /**
   * Mean confidence over the flagged places, as a whole percent, or null.
   *
   * Null — not zero — when nothing was flagged. A visit with nothing flagged has
   * no confidence to report, and a zero would be read as "the app was 0% sure",
   * which is a different and false claim.
   */
  confidencePercent: number | null
  /** Proportion of recorded places that were usable, as a whole percent. */
  qualityPercent: number
  dominantState: PatientResultState | null
}

export interface TrendSeries {
  /** Oldest first: a chart reads left to right. */
  points: TrendPoint[]
  /** False below MIN_TREND_POINTS — the screen must not draw a line. */
  canDrawLine: boolean
  /**
   * Whether the dominant state changed between the last two visits, or null
   * when there are not two visits to compare.
   *
   * Phrased on screen as "a change in the recorded breathing sound pattern was
   * noticed" and never as better or worse. The app has no basis for a direction:
   * it compares what it heard, not how the person is.
   */
  patternChanged: boolean | null
}

export const EMPTY_SERIES: TrendSeries = { points: [], canDrawLine: false, patternChanged: null }

function meanFlaggedConfidence(summary: AssessmentSummary): number | null {
  const values = summary.views
    .map((view) => view.confidencePercent)
    .filter((value): value is number => value !== undefined)
  if (values.length === 0) return null
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length)
}

/** Oldest-first summaries -> the series the trends screen draws. */
export function buildTrendSeries(summaries: readonly AssessmentSummary[]): TrendSeries {
  const points: TrendPoint[] = [...summaries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((summary) => ({
      assessmentId: summary.assessmentId,
      date: summary.date,
      flaggedZones: summary.counts.suggestive,
      usableZones: summary.usableCount,
      recordedZones: summary.recordedCount,
      confidencePercent: meanFlaggedConfidence(summary),
      qualityPercent:
        summary.recordedCount === 0
          ? 0
          : Math.round((summary.usableCount / summary.recordedCount) * 100),
      dominantState: summary.dominantState,
    }))

  const canDrawLine = points.length >= MIN_TREND_POINTS
  const patternChanged = canDrawLine
    ? points[points.length - 1].dominantState !== points[points.length - 2].dominantState
    : null

  return { points, canDrawLine, patternChanged }
}

/**
 * Y-axis top for a count series.
 *
 * At least 1 so a series that is flat at zero still has a drawable box, and
 * never below the largest value.
 */
export function axisMax(values: readonly number[], floor = 1): number {
  return Math.max(floor, ...values)
}

/**
 * Point coordinates inside a `width` x `height` box.
 *
 * A single point lands in the middle horizontally rather than at x=0, so the
 * "not enough data" state — if it were ever drawn — would not look like the
 * start of a line.
 */
export function plotPoints(
  values: readonly number[],
  max: number,
  width: number,
  height: number,
  padding: number,
): { x: number; y: number }[] {
  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const span = values.length - 1

  return values.map((value, index) => ({
    x: span === 0 ? width / 2 : padding + (index / span) * innerW,
    y: padding + innerH - (max === 0 ? 0 : (value / max) * innerH),
  }))
}
