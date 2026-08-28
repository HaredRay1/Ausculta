import { describe, expect, it } from 'vitest'
import { aggregateWindows, decideVerdict, topOf } from '../aggregate'
import { DEFAULT_MODEL_ID, MODEL_REGISTRY, TUNABLES } from '../constants'
import type { QualityReport, WindowResult } from '../types'

const LABELS = MODEL_REGISTRY[DEFAULT_MODEL_ID].labels

/** Build a window from a probability vector; topLabel/topScore follow from it. */
function win(probabilities: Record<string, number>, excluded = false, index = 0): WindowResult {
  const top = topOf(probabilities, LABELS)
  return {
    startMs: index * TUNABLES.STRIDE_MS,
    endMs: index * TUNABLES.STRIDE_MS + 1000,
    probabilities,
    topLabel: top.label,
    topScore: top.score,
    rmsDbfs: -20,
    excluded,
  }
}

const vector = (asthma: number, bronchiolitis: number, healthy: number, pneumonia: number) => ({
  Asthma: asthma,
  Bronchiolitis: bronchiolitis,
  Healthy: healthy,
  Pneumonia: pneumonia,
})

const repeat = (probabilities: Record<string, number>, count: number): WindowResult[] =>
  Array.from({ length: count }, (_, i) => win(probabilities, false, i))

const passingQuality: QualityReport = {
  ok: true,
  flags: [],
  metrics: {
    durationMs: 4000,
    rmsDbfs: -20,
    clipFraction: 0,
    dcOffset: 0,
    spectralFlatness: 0.2,
    tonalityRatio: 0.05,
    hfEnergyRatio: 0.02,
  },
}
const failingQuality: QualityReport = {
  ...passingQuality,
  ok: false,
  flags: [{ code: 'tonal', severity: 'reject', value: 1, threshold: TUNABLES.TONALITY_MAX }],
}

describe('topOf', () => {
  it('returns the highest-scoring label', () => {
    expect(topOf(vector(0.1, 0.2, 0.65, 0.05), LABELS)).toEqual({ label: 'Healthy', score: 0.65 })
  })

  it('breaks ties deterministically by label order', () => {
    expect(topOf(vector(0.25, 0.25, 0.25, 0.25), LABELS).label).toBe('Asthma')
    expect(topOf(vector(0.1, 0.4, 0.4, 0.1), LABELS).label).toBe('Bronchiolitis')
  })

  it('treats a label missing from the vector as zero', () => {
    expect(topOf({ Pneumonia: 0.9 }, LABELS)).toEqual({ label: 'Pneumonia', score: 0.9 })
  })
})

describe('aggregateWindows', () => {
  it('returns null when there are no windows at all', () => {
    expect(aggregateWindows([], LABELS)).toBeNull()
  })

  it('averages the probability vectors arithmetically', () => {
    const stats = aggregateWindows(
      [win(vector(0.8, 0.1, 0.1, 0)), win(vector(0.4, 0.1, 0.5, 0))],
      LABELS,
    )!
    expect(stats.meanProbabilities.Asthma).toBeCloseTo(0.6, 10)
    expect(stats.meanProbabilities.Bronchiolitis).toBeCloseTo(0.1, 10)
    expect(stats.meanProbabilities.Healthy).toBeCloseTo(0.3, 10)
    expect(stats.meanProbabilities.Pneumonia).toBe(0)
  })

  it('reports agreement as the fraction of voting windows matching the mean winner', () => {
    const stats = aggregateWindows(
      [
        win(vector(0.7, 0.1, 0.1, 0.1)),
        win(vector(0.6, 0.2, 0.1, 0.1)),
        win(vector(0.1, 0.1, 0.7, 0.1)),
        win(vector(0.2, 0.1, 0.6, 0.1)),
      ],
      LABELS,
    )!
    expect(topOf(stats.meanProbabilities, LABELS).label).toBe('Asthma')
    expect(stats.agreement).toBe(0.5)
  })

  it('reports margin as mean-of-top minus mean-of-runner-up', () => {
    const stats = aggregateWindows(repeat(vector(0.5, 0.3, 0.15, 0.05), 4), LABELS)!
    expect(stats.margin).toBeCloseTo(0.2, 10)
  })

  it('counts excluded windows in the total but never lets them vote', () => {
    const stats = aggregateWindows(
      [
        win(vector(0.9, 0.05, 0.05, 0)),
        win(vector(0.9, 0.05, 0.05, 0)),
        win(vector(0, 0, 0, 1), true),
        win(vector(0, 0, 0, 1), true),
      ],
      LABELS,
    )!
    expect(stats.windowsUsed).toBe(2)
    expect(stats.windowsTotal).toBe(4)
    expect(stats.meanProbabilities.Pneumonia).toBe(0)
    expect(topOf(stats.meanProbabilities, LABELS).label).toBe('Asthma')
    expect(stats.agreement).toBe(1)
  })

  it('degrades safely when every window was excluded', () => {
    const stats = aggregateWindows(repeat(vector(0.9, 0, 0.1, 0), 4).map((w) => ({ ...w, excluded: true })), LABELS)!
    expect(stats.windowsUsed).toBe(0)
    expect(stats.windowsTotal).toBe(4)
    expect(stats.agreement).toBe(0)
    expect(stats.margin).toBe(0)
    expect(Object.values(stats.meanProbabilities).every((v) => v === 0)).toBe(true)
  })
})

describe('decideVerdict — the decision table, in order', () => {
  it('1. a failed quality gate outranks even a unanimous confident aggregate', () => {
    const stats = aggregateWindows(repeat(vector(0.95, 0.02, 0.02, 0.01), 8), LABELS)
    const verdict = decideVerdict(failingQuality, stats)
    expect(verdict).toEqual({ kind: 'insufficient-quality', messageKey: 'verdict.insufficientQuality' })
  })

  it('2. too few voting windows yields uncertain, whatever they said', () => {
    const stats = aggregateWindows(repeat(vector(0.99, 0.005, 0.005, 0), 2), LABELS)
    expect(stats!.windowsUsed).toBeLessThan(TUNABLES.MIN_VALID_WINDOWS)
    expect(decideVerdict(passingQuality, stats)).toEqual({
      kind: 'uncertain',
      messageKey: 'verdict.tooFewWindows',
    })
  })

  it('2. a null aggregate yields uncertain rather than throwing', () => {
    expect(decideVerdict(passingQuality, null)).toEqual({
      kind: 'uncertain',
      messageKey: 'verdict.tooFewWindows',
    })
  })

  it('2. windows that all got excluded count as too few', () => {
    const stats = aggregateWindows(
      repeat(vector(0.9, 0, 0.1, 0), 8).map((w) => ({ ...w, excluded: true })),
      LABELS,
    )
    expect(decideVerdict(passingQuality, stats).messageKey).toBe('verdict.tooFewWindows')
  })

  it('3. confident, agreeing Healthy yields no-abnormality', () => {
    const stats = aggregateWindows(repeat(vector(0.1, 0.1, 0.7, 0.1), 6), LABELS)
    expect(decideVerdict(passingQuality, stats)).toEqual({
      kind: 'no-abnormality',
      messageKey: 'verdict.noAbnormality',
    })
  })

  it('3. Healthy exactly at HEALTHY_MEAN_MIN and AGREEMENT_MIN still passes', () => {
    // Six windows: three say Healthy 0.9, three say Healthy 0.3 with Asthma on
    // top. Mean Healthy = 0.60 exactly, agreement = 0.50 exactly.
    const stats = aggregateWindows(
      [
        ...repeat(vector(0.05, 0.0, 0.9, 0.05), 3),
        ...repeat(vector(0.4, 0.15, 0.3, 0.15), 3),
      ],
      LABELS,
    )!
    expect(stats.meanProbabilities.Healthy).toBeCloseTo(TUNABLES.HEALTHY_MEAN_MIN, 10)
    expect(stats.agreement).toBe(TUNABLES.AGREEMENT_MIN)
    expect(decideVerdict(passingQuality, stats).kind).toBe('no-abnormality')
  })

  it('3. Healthy below HEALTHY_MEAN_MIN falls through to uncertain', () => {
    const stats = aggregateWindows(repeat(vector(0.2, 0.15, 0.55, 0.1), 6), LABELS)
    expect(decideVerdict(passingQuality, stats)).toEqual({
      kind: 'uncertain',
      messageKey: 'verdict.uncertain',
    })
  })

  it('3. Healthy with too little agreement falls through to uncertain', () => {
    // Two emphatic Healthy windows drag the mean above 0.60, but three of the
    // five windows actually topped out at Asthma: the average is being carried
    // by a minority, which is exactly what AGREEMENT_MIN exists to catch.
    const stats = aggregateWindows(
      [...repeat(vector(0, 0, 1, 0), 2), ...repeat(vector(0.37, 0.13, 0.36, 0.14), 3)],
      LABELS,
    )!
    expect(topOf(stats.meanProbabilities, LABELS).label).toBe('Healthy')
    expect(stats.meanProbabilities.Healthy).toBeGreaterThan(TUNABLES.HEALTHY_MEAN_MIN)
    expect(stats.agreement).toBeLessThan(TUNABLES.AGREEMENT_MIN)
    expect(decideVerdict(passingQuality, stats)).toEqual({
      kind: 'uncertain',
      messageKey: 'verdict.uncertain',
    })
  })

  it('4. a confident, agreeing, well-separated disease yields suggestive', () => {
    const stats = aggregateWindows(repeat(vector(0.75, 0.1, 0.1, 0.05), 6), LABELS)!
    expect(decideVerdict(passingQuality, stats)).toEqual({
      kind: 'suggestive',
      label: 'Asthma',
      confidence: stats.meanProbabilities.Asthma,
      messageKey: 'verdict.suggestive',
    })
  })

  it('4. reports whichever disease won, not just the first label', () => {
    const stats = aggregateWindows(repeat(vector(0.05, 0.1, 0.15, 0.7), 5), LABELS)
    expect(decideVerdict(passingQuality, stats)).toMatchObject({
      kind: 'suggestive',
      label: 'Pneumonia',
    })
  })

  it('4. holds at exactly CONFIDENCE_MEAN_MIN and AGREEMENT_MIN', () => {
    // Two windows top out at Asthma 0.80, two at Bronchiolitis: mean Asthma is
    // exactly 0.60 and agreement is exactly 0.50, both right on the boundary.
    const stats = aggregateWindows(
      [...repeat(vector(0.8, 0.05, 0.1, 0.05), 2), ...repeat(vector(0.4, 0.45, 0.1, 0.05), 2)],
      LABELS,
    )!
    expect(stats.meanProbabilities.Asthma).toBeCloseTo(TUNABLES.CONFIDENCE_MEAN_MIN, 10)
    expect(stats.agreement).toBe(TUNABLES.AGREEMENT_MIN)
    expect(decideVerdict(passingQuality, stats).kind).toBe('suggestive')
  })

  it('4. a disease below CONFIDENCE_MEAN_MIN is uncertain', () => {
    const stats = aggregateWindows(repeat(vector(0.55, 0.1, 0.25, 0.1), 6), LABELS)
    expect(decideVerdict(passingQuality, stats)).toEqual({
      kind: 'uncertain',
      messageKey: 'verdict.uncertain',
    })
  })

  it('4. a disease with a margin below MARGIN_MIN is uncertain', () => {
    // NOTE: with normalised probability vectors this rule can never fire at
    // the current tunables — a mean of 0.60 leaves at most 0.40 for the
    // runner-up, so the margin is always at least 0.20. The stats are
    // therefore built directly, which is the only way to exercise the rule as
    // written and to keep it honest if CONFIDENCE_MEAN_MIN is ever lowered.
    const narrow = {
      meanProbabilities: { Asthma: 0.62, Bronchiolitis: 0.55, Healthy: 0.05, Pneumonia: 0.05 },
      agreement: 1,
      margin: 0.07,
      windowsUsed: 6,
      windowsTotal: 6,
    }
    expect(narrow.meanProbabilities.Asthma).toBeGreaterThan(TUNABLES.CONFIDENCE_MEAN_MIN)
    expect(narrow.margin).toBeLessThan(TUNABLES.MARGIN_MIN)
    expect(decideVerdict(passingQuality, narrow, LABELS)).toEqual({
      kind: 'uncertain',
      messageKey: 'verdict.uncertain',
    })
  })

  it('4. holds at exactly MARGIN_MIN', () => {
    const onBoundary = {
      meanProbabilities: { Asthma: 0.62, Bronchiolitis: 0.47, Healthy: 0.05, Pneumonia: 0.05 },
      agreement: 1,
      margin: TUNABLES.MARGIN_MIN,
      windowsUsed: 6,
      windowsTotal: 6,
    }
    expect(decideVerdict(passingQuality, onBoundary, LABELS).kind).toBe('suggestive')
  })

  it('4. a disease the windows do not agree on is uncertain', () => {
    // Mean Asthma 0.62 with margin 0.44, but only 2 of 5 windows top out there.
    const stats = aggregateWindows(
      [
        ...repeat(vector(0.95, 0.02, 0.02, 0.01), 2),
        ...repeat(vector(0.4, 0.45, 0.1, 0.05), 3),
      ],
      LABELS,
    )!
    expect(stats.meanProbabilities.Asthma).toBeGreaterThan(TUNABLES.CONFIDENCE_MEAN_MIN)
    expect(stats.margin).toBeGreaterThan(TUNABLES.MARGIN_MIN)
    expect(stats.agreement).toBeLessThan(TUNABLES.AGREEMENT_MIN)
    expect(decideVerdict(passingQuality, stats).messageKey).toBe('verdict.uncertain')
  })

  it('5. a four-way split is uncertain', () => {
    const stats = aggregateWindows(
      [
        win(vector(0.7, 0.1, 0.1, 0.1), false, 0),
        win(vector(0.1, 0.7, 0.1, 0.1), false, 1),
        win(vector(0.1, 0.1, 0.7, 0.1), false, 2),
        win(vector(0.1, 0.1, 0.1, 0.7), false, 3),
      ],
      LABELS,
    )
    expect(decideVerdict(passingQuality, stats)).toEqual({
      kind: 'uncertain',
      messageKey: 'verdict.uncertain',
    })
  })

  it('never attaches a label or confidence to a non-suggestive verdict', () => {
    const healthy = decideVerdict(passingQuality, aggregateWindows(repeat(vector(0.1, 0.1, 0.7, 0.1), 6), LABELS))
    const uncertain = decideVerdict(passingQuality, null)
    const bad = decideVerdict(failingQuality, null)
    for (const verdict of [healthy, uncertain, bad]) {
      expect(verdict.label).toBeUndefined()
      expect(verdict.confidence).toBeUndefined()
    }
  })
})
