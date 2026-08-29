import { describe, expect, it } from 'vitest'
import { CLASSIFICATION_CODES, type ClassificationCode } from '../../../db/codes'
import {
  CLASS_ORDER,
  MINIMUM_CLASS_SUPPORT,
  MINIMUM_SCORED_FOR_METRICS,
  buildConfusionCounts,
  buildPerformanceReport,
  formatPercent,
  metricsForClass,
  type ScoredPair,
} from '../metrics'

const { ASTHMA, BRONCHIOLITIS, HEALTHY, PNEUMONIA } = CLASSIFICATION_CODES

/**
 * The fixture, worked out by hand before any code was written.
 *
 * Rows are the ACTUAL class, columns are what the model PREDICTED.
 *
 *   actual \ pred   AST  BRO  HEA  PNE  | row total (support)
 *   ASTHMA           5    1    2    0   |  8
 *   BRONCHIOLITIS    2    3    0    1   |  6
 *   HEALTHY          2    0    9    1   | 12
 *   PNEUMONIA        0    1    1    3   |  5
 *   -----------------------------------------------------
 *   col total        9    5   12    5   | 31
 *
 * Deliberately ASYMMETRIC. A symmetric matrix makes precision equal recall for
 * every class, which would let a transposed implementation pass unnoticed.
 * Here ASTHMA has precision 5/9 and recall 5/8, so a transposition swaps them
 * and the test fails.
 *
 * Correct predictions: 5 + 3 + 9 + 3 = 20, so accuracy = 20/31.
 */
const MATRIX: [ClassificationCode, ClassificationCode, number][] = [
  [ASTHMA, ASTHMA, 5],
  [ASTHMA, BRONCHIOLITIS, 1],
  [ASTHMA, HEALTHY, 2],
  [BRONCHIOLITIS, ASTHMA, 2],
  [BRONCHIOLITIS, BRONCHIOLITIS, 3],
  [BRONCHIOLITIS, PNEUMONIA, 1],
  [HEALTHY, ASTHMA, 2],
  [HEALTHY, HEALTHY, 9],
  [HEALTHY, PNEUMONIA, 1],
  [PNEUMONIA, BRONCHIOLITIS, 1],
  [PNEUMONIA, HEALTHY, 1],
  [PNEUMONIA, PNEUMONIA, 3],
]

function fixturePairs(): ScoredPair[] {
  const pairs: ScoredPair[] = []
  let n = 0
  for (const [actual, predicted, count] of MATRIX) {
    for (let i = 0; i < count; i++) {
      pairs.push({ recordingId: `r-${n++}`, actual, predicted })
    }
  }
  return pairs
}

const CLOSE = 1e-12

describe('buildConfusionCounts', () => {
  it('tallies rows as actual and columns as predicted', () => {
    const counts = buildConfusionCounts(fixturePairs())

    expect(counts[ASTHMA][ASTHMA]).toBe(5)
    expect(counts[ASTHMA][HEALTHY]).toBe(2)
    // Actually bronchiolitis, called asthma. The transposed cell is different.
    expect(counts[BRONCHIOLITIS][ASTHMA]).toBe(2)
    expect(counts[ASTHMA][BRONCHIOLITIS]).toBe(1)
  })

  it('row totals are class support, column totals are predictions made', () => {
    const counts = buildConfusionCounts(fixturePairs())
    const row = (c: ClassificationCode) =>
      CLASS_ORDER.reduce((sum, p) => sum + counts[c][p], 0)
    const col = (c: ClassificationCode) =>
      CLASS_ORDER.reduce((sum, a) => sum + counts[a][c], 0)

    expect([row(ASTHMA), row(BRONCHIOLITIS), row(HEALTHY), row(PNEUMONIA)]).toEqual([8, 6, 12, 5])
    expect([col(ASTHMA), col(BRONCHIOLITIS), col(HEALTHY), col(PNEUMONIA)]).toEqual([9, 5, 12, 5])
  })

  it('drops a pair whose class is outside the registry rather than corrupting the matrix', () => {
    const counts = buildConfusionCounts([
      { recordingId: 'a', actual: ASTHMA, predicted: ASTHMA },
      { recordingId: 'b', actual: 'TUBERCULOSIS' as ClassificationCode, predicted: ASTHMA },
    ])
    const total = CLASS_ORDER.reduce(
      (sum, a) => sum + CLASS_ORDER.reduce((r, p) => r + counts[a][p], 0),
      0,
    )
    expect(total).toBe(1)
  })
})

describe('per-class metrics, against the hand-computed matrix', () => {
  const counts = buildConfusionCounts(fixturePairs())

  it('ASTHMA: tp 5, fp 4, fn 3, tn 19', () => {
    const m = metricsForClass(counts, ASTHMA)
    expect([m.truePositives, m.falsePositives, m.falseNegatives, m.trueNegatives]).toEqual([
      5, 4, 3, 19,
    ])
    expect(m.support).toBe(8)
    expect(m.predictedCount).toBe(9)
    // precision 5/9, recall 5/8 — different, so a transposition cannot pass.
    expect(m.precision).toBeCloseTo(5 / 9, 12)
    expect(m.recall).toBeCloseTo(5 / 8, 12)
    expect(m.specificity).toBeCloseTo(19 / 23, 12)
    // f1 = 2PR/(P+R) = 50/85 = 10/17
    expect(m.f1).toBeCloseTo(10 / 17, 12)
  })

  it('BRONCHIOLITIS: tp 3, fp 2, fn 3, tn 23', () => {
    const m = metricsForClass(counts, BRONCHIOLITIS)
    expect([m.truePositives, m.falsePositives, m.falseNegatives, m.trueNegatives]).toEqual([
      3, 2, 3, 23,
    ])
    expect(m.precision).toBeCloseTo(3 / 5, 12)
    expect(m.recall).toBeCloseTo(3 / 6, 12)
    expect(m.specificity).toBeCloseTo(23 / 25, 12)
    expect(m.f1).toBeCloseTo(6 / 11, 12)
  })

  it('HEALTHY: tp 9, fp 3, fn 3, tn 16', () => {
    const m = metricsForClass(counts, HEALTHY)
    expect([m.truePositives, m.falsePositives, m.falseNegatives, m.trueNegatives]).toEqual([
      9, 3, 3, 16,
    ])
    expect(m.precision).toBeCloseTo(0.75, 12)
    expect(m.recall).toBeCloseTo(0.75, 12)
    expect(m.specificity).toBeCloseTo(16 / 19, 12)
    expect(m.f1).toBeCloseTo(0.75, 12)
  })

  it('PNEUMONIA: tp 3, fp 2, fn 2, tn 24', () => {
    const m = metricsForClass(counts, PNEUMONIA)
    expect([m.truePositives, m.falsePositives, m.falseNegatives, m.trueNegatives]).toEqual([
      3, 2, 2, 24,
    ])
    expect(m.precision).toBeCloseTo(0.6, 12)
    expect(m.recall).toBeCloseTo(0.6, 12)
    expect(m.specificity).toBeCloseTo(24 / 26, 12)
    expect(m.f1).toBeCloseTo(0.6, 12)
  })

  it('tp + fp + fn + tn equals the whole sample for every class', () => {
    for (const code of CLASS_ORDER) {
      const m = metricsForClass(counts, code)
      expect(m.truePositives + m.falsePositives + m.falseNegatives + m.trueNegatives).toBe(31)
    }
  })
})

describe('buildPerformanceReport', () => {
  it('accuracy is correct predictions over the scored total', () => {
    const report = buildPerformanceReport(fixturePairs())
    expect(report.scored).toBe(31)
    expect(report.correct).toBe(20)
    expect(report.accuracy).toBeCloseTo(20 / 31, 12)
  })

  it('macro F1 is the unweighted mean of the per-class scores', () => {
    const report = buildPerformanceReport(fixturePairs())
    const expected = (10 / 17 + 6 / 11 + 0.75 + 0.6) / 4
    expect(report.macroF1).toBeCloseTo(expected, 12)
  })

  it('reports sufficiency against the documented floor', () => {
    expect(buildPerformanceReport(fixturePairs()).sufficient).toBe(true)
    expect(buildPerformanceReport(fixturePairs().slice(0, 19)).sufficient).toBe(false)
    expect(buildPerformanceReport(fixturePairs().slice(0, MINIMUM_SCORED_FOR_METRICS)).sufficient).toBe(
      true,
    )
  })

  it('still counts an insufficient sample, so a researcher can see what to label next', () => {
    const report = buildPerformanceReport(fixturePairs().slice(0, 3))
    expect(report.sufficient).toBe(false)
    expect(report.scored).toBe(3)
    expect(report.counts[ASTHMA][ASTHMA]).toBe(3)
  })
})

describe('undefined is never reported as zero', () => {
  it('precision is null when the model never predicted the class', () => {
    // Nothing was ever called PNEUMONIA, so its precision has no denominator.
    const report = buildPerformanceReport([
      { recordingId: 'a', actual: ASTHMA, predicted: ASTHMA },
      { recordingId: 'b', actual: PNEUMONIA, predicted: ASTHMA },
    ])
    const pneumonia = report.perClass.find((m) => m.code === PNEUMONIA)!
    expect(pneumonia.predictedCount).toBe(0)
    expect(pneumonia.precision).toBeNull()
    expect(pneumonia.precision).not.toBe(0)
    // Recall does have a denominator: one recording really is pneumonia.
    expect(pneumonia.recall).toBe(0)
  })

  it('recall is null when no recording actually is the class', () => {
    const report = buildPerformanceReport([
      { recordingId: 'a', actual: ASTHMA, predicted: PNEUMONIA },
    ])
    const pneumonia = report.perClass.find((m) => m.code === PNEUMONIA)!
    expect(pneumonia.support).toBe(0)
    expect(pneumonia.recall).toBeNull()
    expect(pneumonia.precision).toBe(0)
  })

  it('accuracy is null on an empty sample rather than 0%', () => {
    const report = buildPerformanceReport([])
    expect(report.accuracy).toBeNull()
    expect(report.macroF1).toBeNull()
    expect(report.scored).toBe(0)
  })

  it('f1 is null whenever either input is', () => {
    const report = buildPerformanceReport([
      { recordingId: 'a', actual: ASTHMA, predicted: ASTHMA },
    ])
    const healthy = report.perClass.find((m) => m.code === HEALTHY)!
    expect(healthy.precision).toBeNull()
    expect(healthy.recall).toBeNull()
    expect(healthy.f1).toBeNull()
  })

  it('formatPercent passes null through so a caller cannot print "0.0%" for nothing', () => {
    expect(formatPercent(null)).toBeNull()
    expect(formatPercent(20 / 31)).toBe('64.5%')
    expect(formatPercent(0)).toBe('0.0%')
  })
})

describe('per-class support', () => {
  it('flags a class resting on too few recordings even when the whole sample is sufficient', () => {
    const pairs = fixturePairs()
    const report = buildPerformanceReport(pairs)
    expect(report.sufficient).toBe(true)

    const pneumonia = report.perClass.find((m) => m.code === PNEUMONIA)!
    expect(pneumonia.support).toBe(5)
    expect(pneumonia.underSupported).toBe(5 < MINIMUM_CLASS_SUPPORT)

    const bronchiolitis = report.perClass.find((m) => m.code === BRONCHIOLITIS)!
    expect(bronchiolitis.support).toBe(6)
    expect(bronchiolitis.underSupported).toBe(false)
  })
})

describe('what this module deliberately cannot do', () => {
  it('exposes no regression error statistic', async () => {
    const module: Record<string, unknown> = await import('../metrics')
    const names = Object.keys(module).join(' ').toLowerCase()
    // RMSE, MAE and R-squared are arithmetic on class names. The spec forbids
    // them and there must be no function here that could produce one.
    expect(names).not.toContain('rmse')
    expect(names).not.toContain('mae')
    expect(names).not.toContain('rsquared')
    expect(names).not.toContain('meansquared')
  })
})
