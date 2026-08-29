import { CLASSIFICATION_CODES, type ClassificationCode } from '../../db/codes'

/**
 * Classification metrics over recordings that have both a model prediction and
 * a human reference label.
 *
 * Every decision in this file exists to stop the screen above it from
 * overstating what the data supports.
 *
 * **A missing metric is `null`, never `0`.** Precision with no predictions of
 * that class is undefined, not zero — zero says "the model got them all
 * wrong", which is a claim about evidence that does not exist. Callers must
 * render `null` as "not enough data", and the type forces them to handle it.
 *
 * **Every metric ships its denominator.** `precision = 1.0` off two samples and
 * `precision = 1.0` off two hundred are different findings, and a reader
 * cannot tell them apart from the number alone.
 *
 * **No RMSE, MAE or R².** These are categorical labels; a regression error
 * statistic over class indices would be arithmetic on names and is
 * meaningless. The project specification forbids them and this module has no
 * function that could produce one.
 *
 * Orientation, since transposing a confusion matrix is the classic silent bug:
 * **rows are the actual class, columns are the predicted class.** `counts[a][p]`
 * is the number of recordings whose true class was `a` and which the model
 * called `p`. The test suite pins an asymmetric matrix precisely so a
 * transposition cannot pass.
 */

export const CLASS_ORDER: readonly ClassificationCode[] = [
  CLASSIFICATION_CODES.ASTHMA,
  CLASSIFICATION_CODES.BRONCHIOLITIS,
  CLASSIFICATION_CODES.HEALTHY,
  CLASSIFICATION_CODES.PNEUMONIA,
]

/**
 * Fewest scored recordings before any metric is shown at all.
 *
 * Four classes, so twenty is five per class on average — thin, and chosen as a
 * floor below which a confusion matrix is actively misleading rather than as a
 * claim that twenty is sufficient. Per-class support is reported separately
 * (see `MINIMUM_CLASS_SUPPORT`) because a dataset can clear this bar overall
 * while a class inside it rests on one or two recordings.
 */
export const MINIMUM_SCORED_FOR_METRICS = 20

/** Below this, a single class's own metrics are flagged as unreliable. */
export const MINIMUM_CLASS_SUPPORT = 5

/** One recording with both a prediction and a reference class. */
export interface ScoredPair {
  recordingId: string
  predicted: ClassificationCode
  actual: ClassificationCode
}

export type ConfusionCounts = Record<ClassificationCode, Record<ClassificationCode, number>>

export interface ClassMetrics {
  code: ClassificationCode
  /** Recordings whose true class is this one. The row total. */
  support: number
  /** Recordings the model called this class. The column total. */
  predictedCount: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  trueNegatives: number
  /** tp / (tp + fp) — `null` when the model never predicted this class. */
  precision: number | null
  /** tp / (tp + fn) — `null` when no recording actually is this class. */
  recall: number | null
  /** tn / (tn + fp) — `null` when every recording actually is this class. */
  specificity: number | null
  /** Harmonic mean of precision and recall — `null` when either is. */
  f1: number | null
  /** True when this class rests on too few recordings to read anything into. */
  underSupported: boolean
}

export interface PerformanceReport {
  /** Recordings with both a prediction and a reference class. */
  scored: number
  /** True when `scored` cleared `MINIMUM_SCORED_FOR_METRICS`. */
  sufficient: boolean
  counts: ConfusionCounts
  /** `null` until there is anything to be accurate about. */
  accuracy: number | null
  correct: number
  perClass: ClassMetrics[]
  /** Unweighted mean of the defined per-class F1 scores. */
  macroF1: number | null
}

function emptyCounts(): ConfusionCounts {
  const counts = {} as ConfusionCounts
  for (const actual of CLASS_ORDER) {
    counts[actual] = {} as Record<ClassificationCode, number>
    for (const predicted of CLASS_ORDER) counts[actual][predicted] = 0
  }
  return counts
}

/** Tallies pairs into `counts[actual][predicted]`. */
export function buildConfusionCounts(pairs: readonly ScoredPair[]): ConfusionCounts {
  const counts = emptyCounts()
  for (const pair of pairs) {
    // Defensive: a class outside the registry would silently corrupt every
    // metric derived from this matrix, so it is dropped rather than added.
    if (counts[pair.actual]?.[pair.predicted] === undefined) continue
    counts[pair.actual][pair.predicted] += 1
  }
  return counts
}

/** `null` rather than `0` when the denominator is empty — undefined, not zero. */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

function harmonicMean(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null
  if (a + b === 0) return 0
  return (2 * a * b) / (a + b)
}

export function metricsForClass(counts: ConfusionCounts, code: ClassificationCode): ClassMetrics {
  const total = CLASS_ORDER.reduce(
    (sum, actual) => sum + CLASS_ORDER.reduce((row, pred) => row + counts[actual][pred], 0),
    0,
  )
  const truePositives = counts[code][code]
  const support = CLASS_ORDER.reduce((sum, pred) => sum + counts[code][pred], 0)
  const predictedCount = CLASS_ORDER.reduce((sum, actual) => sum + counts[actual][code], 0)
  const falseNegatives = support - truePositives
  const falsePositives = predictedCount - truePositives
  const trueNegatives = total - truePositives - falsePositives - falseNegatives

  const precision = ratio(truePositives, truePositives + falsePositives)
  const recall = ratio(truePositives, truePositives + falseNegatives)

  return {
    code,
    support,
    predictedCount,
    truePositives,
    falsePositives,
    falseNegatives,
    trueNegatives,
    precision,
    recall,
    specificity: ratio(trueNegatives, trueNegatives + falsePositives),
    f1: harmonicMean(precision, recall),
    underSupported: support < MINIMUM_CLASS_SUPPORT,
  }
}

/**
 * The whole report.
 *
 * Note that the matrix and the counts are computed even when `sufficient` is
 * false. Suppressing the numbers is the screen's job, not this function's — and
 * "how many labelled recordings do we have, and of what" is exactly what a
 * researcher needs to see in order to know what to label next.
 */
export function buildPerformanceReport(pairs: readonly ScoredPair[]): PerformanceReport {
  const counts = buildConfusionCounts(pairs)
  const scored = CLASS_ORDER.reduce(
    (sum, actual) => sum + CLASS_ORDER.reduce((row, pred) => row + counts[actual][pred], 0),
    0,
  )
  const correct = CLASS_ORDER.reduce((sum, code) => sum + counts[code][code], 0)
  const perClass = CLASS_ORDER.map((code) => metricsForClass(counts, code))
  const definedF1 = perClass
    .map((entry) => entry.f1)
    .filter((value): value is number => value !== null)

  return {
    scored,
    sufficient: scored >= MINIMUM_SCORED_FOR_METRICS,
    counts,
    accuracy: ratio(correct, scored),
    correct,
    perClass,
    macroF1:
      definedF1.length === 0
        ? null
        : definedF1.reduce((sum, value) => sum + value, 0) / definedF1.length,
  }
}

/** `0.5834` -> `"58.3%"`, and `null` -> `null` so the caller must handle it. */
export function formatPercent(value: number | null, digits = 1): string | null {
  return value === null ? null : `${(value * 100).toFixed(digits)}%`
}
