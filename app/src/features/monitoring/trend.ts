/**
 * Building a trend from a patient's history.
 *
 * One rule dominates this module: **a trend needs at least two assessments.**
 * A line through a single point is not a trend, it is a decoration that implies
 * a direction nobody measured — and on a clinical screen an implied direction
 * is read as a claim. So `buildTrend` returns an explicit `notEnoughData` state
 * rather than a series of length one, and the screen renders an explanation
 * instead of a chart.
 *
 * Nothing here computes a direction of travel. There is no "improving", no
 * "worsening", no slope. It reports what was recorded at each visit and leaves
 * the reading of it to a clinician.
 */

import type { ClassificationCode, LocationCode } from '../../db/codes'
import type { AssessmentSnapshot } from './alertEngine'

/** Below this a trend is not drawn at all. */
export const MIN_ASSESSMENTS_FOR_TREND = 2

export interface TrendPoint {
  assessmentId: string
  date: string
  /** Absent when this location was not recorded at that visit. */
  flagged?: boolean
  unusable?: boolean
  classificationCode?: ClassificationCode
}

export interface LocationTrend {
  locationCode: LocationCode
  points: TrendPoint[]
  /** True when at least one visit recorded this location. */
  hasData: boolean
}

export type TrendResult =
  | { ok: false; reason: 'no-data' | 'not-enough-data'; assessmentCount: number }
  | { ok: true; assessmentCount: number; locations: LocationTrend[] }

/**
 * Builds a per-location trend from a chronological history.
 *
 * Every location that appears anywhere in the history gets a series covering
 * every assessment, with gaps left as gaps: a visit where a location was not
 * recorded produces a point with no values rather than being dropped. Dropping
 * it would silently join two non-adjacent visits into a straight line and
 * invent continuity that was never recorded.
 */
export function buildTrend(history: readonly AssessmentSnapshot[]): TrendResult {
  if (history.length === 0) {
    return { ok: false, reason: 'no-data', assessmentCount: 0 }
  }
  if (history.length < MIN_ASSESSMENTS_FOR_TREND) {
    return { ok: false, reason: 'not-enough-data', assessmentCount: history.length }
  }

  const ordered = [...history].sort((a, b) => a.date.localeCompare(b.date))

  const locationCodes: LocationCode[] = []
  for (const assessment of ordered) {
    for (const recording of assessment.recordings) {
      if (!locationCodes.includes(recording.locationCode)) {
        locationCodes.push(recording.locationCode)
      }
    }
  }

  const locations: LocationTrend[] = locationCodes.map((locationCode) => {
    const points: TrendPoint[] = ordered.map((assessment) => {
      const recording = assessment.recordings.find((r) => r.locationCode === locationCode)
      if (recording === undefined) {
        // A gap, kept as a gap.
        return { assessmentId: assessment.assessmentId, date: assessment.date }
      }
      return {
        assessmentId: assessment.assessmentId,
        date: assessment.date,
        flagged: recording.flagged,
        unusable: recording.unusable,
        ...(recording.classificationCode !== undefined && {
          classificationCode: recording.classificationCode,
        }),
      }
    })

    return {
      locationCode,
      points,
      hasData: points.some((p) => p.flagged !== undefined),
    }
  })

  return { ok: true, assessmentCount: ordered.length, locations }
}
