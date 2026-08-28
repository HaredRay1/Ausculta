import { describe, expect, it } from 'vitest'
import { AI_STATUS, CLASSIFICATION_CODES, LOCATION_CODES, REVIEW_STATUSES } from '../../../db/codes'
import type { Assessment, Recording } from '../../../db/types'
import { summariseAssessment } from './resultView'
import { buildTrendSeries, MIN_TREND_POINTS, plotPoints } from './trends'

function visit(
  id: string,
  date: string,
  rows: Partial<Recording>[],
): ReturnType<typeof summariseAssessment> {
  const assessment: Assessment = {
    id,
    patientId: 'pt-1',
    assessorId: 'DEMO-STAFF-HW1',
    date,
    symptoms: [],
    vitals: [],
    reviewStatus: REVIEW_STATUSES.PENDING_REVIEW,
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
    isDemo: 1,
    createdAt: date,
  }

  const recordings: Recording[] = rows.map((overrides, index) => ({
    id: `${id}-${index}`,
    assessmentId: id,
    patientId: 'pt-1',
    locationCode: LOCATION_CODES.R_UPPER,
    audioBlobId: `blob-${id}-${index}`,
    audioSource: 'DEMO_FICTIONAL',
    importedSampleRate: 16000,
    bitDepth: 16,
    channels: 1,
    durationSec: 12,
    quality: null,
    aiStatus: AI_STATUS.ANALYZED,
    isDemo: 1,
    createdAt: date,
    ...overrides,
  }))

  return summariseAssessment(assessment, recordings)
}

const clear = { aiClassification: CLASSIFICATION_CODES.HEALTHY, aiConfidence: 0.9 }
const flagged = { aiClassification: CLASSIFICATION_CODES.ASTHMA, aiConfidence: 0.8 }
const unusable = { aiStatus: AI_STATUS.INSUFFICIENT_QUALITY }

describe('buildTrendSeries', () => {
  it('refuses to draw a line from fewer than two visits', () => {
    expect(buildTrendSeries([]).canDrawLine).toBe(false)
    expect(buildTrendSeries([visit('a', '2026-08-01T00:00:00.000Z', [clear])]).canDrawLine).toBe(
      false,
    )
    expect(MIN_TREND_POINTS).toBe(2)
  })

  it('draws once there are two visits, oldest first', () => {
    const series = buildTrendSeries([
      visit('b', '2026-08-10T00:00:00.000Z', [clear]),
      visit('a', '2026-08-01T00:00:00.000Z', [flagged]),
    ])
    expect(series.canDrawLine).toBe(true)
    expect(series.points.map((point) => point.assessmentId)).toEqual(['a', 'b'])
  })

  it('reports no direction, only whether the pattern changed', () => {
    const changed = buildTrendSeries([
      visit('a', '2026-08-01T00:00:00.000Z', [flagged]),
      visit('b', '2026-08-10T00:00:00.000Z', [clear]),
    ])
    expect(changed.patternChanged).toBe(true)

    const same = buildTrendSeries([
      visit('a', '2026-08-01T00:00:00.000Z', [clear]),
      visit('b', '2026-08-10T00:00:00.000Z', [clear]),
    ])
    expect(same.patternChanged).toBe(false)

    // Nothing in the series claims better or worse.
    expect(Object.keys(changed)).not.toContain('improving')
    expect(Object.keys(changed)).not.toContain('worsening')
  })

  it('has no confidence for a visit where nothing was named — null, never zero', () => {
    const series = buildTrendSeries([
      visit('a', '2026-08-01T00:00:00.000Z', [clear, clear]),
      visit('b', '2026-08-10T00:00:00.000Z', [flagged]),
    ])
    expect(series.points[0].confidencePercent).toBeNull()
    expect(series.points[1].confidencePercent).toBe(80)
  })

  it('measures quality as usable-over-recorded', () => {
    const series = buildTrendSeries([
      visit('a', '2026-08-01T00:00:00.000Z', [clear, unusable, unusable, unusable]),
      visit('b', '2026-08-10T00:00:00.000Z', [clear, clear]),
    ])
    expect(series.points[0].qualityPercent).toBe(25)
    expect(series.points[1].qualityPercent).toBe(100)
  })

  it('carries no severity series at all', () => {
    const series = buildTrendSeries([
      visit('a', '2026-08-01T00:00:00.000Z', [flagged]),
      visit('b', '2026-08-10T00:00:00.000Z', [flagged]),
    ])
    for (const point of series.points) {
      expect(point).not.toHaveProperty('severity')
      expect(point).not.toHaveProperty('severityScore')
    }
  })
})

describe('plotPoints', () => {
  it('centres a lone point rather than starting it at the left edge', () => {
    const [only] = plotPoints([3], 3, 300, 100, 10)
    expect(only.x).toBe(150)
  })

  it('spans the box across several points', () => {
    const points = plotPoints([0, 1, 2], 2, 300, 100, 10)
    expect(points[0].x).toBe(10)
    expect(points[2].x).toBe(290)
    // Larger value sits higher on the screen (smaller y).
    expect(points[2].y).toBeLessThan(points[0].y)
  })
})
