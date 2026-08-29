import { describe, expect, it } from 'vitest'
import { CLASSIFICATION_CODES, LOCATION_CODES, type LocationCode } from '../../db/codes'
import type { AssessmentSnapshot, RecordingSnapshot } from './alertEngine'
import { MIN_ASSESSMENTS_FOR_TREND, buildTrend } from './trend'

const R_UPPER = LOCATION_CODES.R_UPPER
const L_LOWER = LOCATION_CODES.L_LOWER

function rec(locationCode: LocationCode, flagged: boolean): RecordingSnapshot {
  return {
    recordingId: `rec-${locationCode}-${Math.random()}`,
    locationCode,
    flagged,
    unusable: false,
    classificationCode: flagged ? CLASSIFICATION_CODES.ASTHMA : CLASSIFICATION_CODES.HEALTHY,
  }
}

function visit(day: number, ...recordings: RecordingSnapshot[]): AssessmentSnapshot {
  return {
    assessmentId: `asm-${day}`,
    date: `2026-0${day}-01T00:00:00.000Z`,
    recordings,
  }
}

describe('refusing to draw a trend', () => {
  it('reports no data for an empty history', () => {
    const result = buildTrend([])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no-data')
  })

  it('refuses a single assessment', () => {
    // A line through one point implies a direction nobody measured, and on a
    // clinical screen an implied direction is read as a claim.
    const result = buildTrend([visit(1, rec(R_UPPER, true))])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-enough-data')
    expect(result.assessmentCount).toBe(1)
  })

  it('draws from two', () => {
    const result = buildTrend([visit(1, rec(R_UPPER, false)), visit(2, rec(R_UPPER, true))])
    expect(result.ok).toBe(true)
    expect(MIN_ASSESSMENTS_FOR_TREND).toBe(2)
  })
})

describe('the series', () => {
  it('covers every assessment for every location', () => {
    const result = buildTrend([
      visit(1, rec(R_UPPER, false), rec(L_LOWER, false)),
      visit(2, rec(R_UPPER, true), rec(L_LOWER, false)),
      visit(3, rec(R_UPPER, true), rec(L_LOWER, true)),
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.assessmentCount).toBe(3)
    expect(result.locations).toHaveLength(2)
    for (const location of result.locations) {
      expect(location.points).toHaveLength(3)
    }
  })

  it('keeps a missed location as a gap rather than dropping it', () => {
    // Dropping it would join two non-adjacent visits into a straight line and
    // invent continuity that was never recorded.
    const result = buildTrend([
      visit(1, rec(R_UPPER, true)),
      visit(2, rec(L_LOWER, true)),
      visit(3, rec(R_UPPER, true)),
    ])
    if (!result.ok) return

    const upper = result.locations.find((l) => l.locationCode === R_UPPER)
    expect(upper?.points).toHaveLength(3)
    expect(upper?.points[1]?.flagged).toBeUndefined()
    expect(upper?.points[0]?.flagged).toBe(true)
    expect(upper?.points[2]?.flagged).toBe(true)
  })

  it('orders points oldest first regardless of input order', () => {
    const result = buildTrend([visit(3, rec(R_UPPER, true)), visit(1, rec(R_UPPER, false))])
    if (!result.ok) return
    const dates = result.locations[0]?.points.map((p) => p.date) ?? []
    expect(dates).toEqual([...dates].sort())
  })

  it('marks a location with no usable point as having no data', () => {
    const result = buildTrend([visit(1, rec(R_UPPER, true)), visit(2, rec(L_LOWER, true))])
    if (!result.ok) return
    for (const location of result.locations) {
      // Each location has exactly one real point here, so both have data.
      expect(location.hasData).toBe(true)
    }
  })

  it('carries the classification at each point', () => {
    const result = buildTrend([visit(1, rec(R_UPPER, false)), visit(2, rec(R_UPPER, true))])
    if (!result.ok) return
    const points = result.locations[0]?.points ?? []
    expect(points[0]?.classificationCode).toBe(CLASSIFICATION_CODES.HEALTHY)
    expect(points[1]?.classificationCode).toBe(CLASSIFICATION_CODES.ASTHMA)
  })

  it('computes no direction of travel anywhere', () => {
    // There is deliberately no slope, no delta and no verdict in the output.
    const result = buildTrend([visit(1, rec(R_UPPER, false)), visit(2, rec(R_UPPER, true))])
    if (!result.ok) return
    const serialised = JSON.stringify(result).toLowerCase()
    for (const forbidden of ['improv', 'worse', 'better', 'deteriorat', 'trenddirection', 'slope']) {
      expect(serialised).not.toContain(forbidden)
    }
  })
})
