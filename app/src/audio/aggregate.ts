import { HEALTHY_LABEL, TUNABLES } from './constants'
import type { AggregateStats, QualityReport, Verdict, WindowResult } from './types'

/**
 * Per-window classifications → one aggregate → one verdict.
 *
 * Pure TypeScript. The decision table below is the last thing standing
 * between a ~71 %-accurate model and a clinician reading a confident finding,
 * so it is written as a flat, ordered sequence of rules that can be read
 * against the brief line by line.
 */

/** Highest-scoring label. Ties break by the model's own label order. */
export function topOf(
  probabilities: Record<string, number>,
  labels: readonly string[],
): { label: string; score: number } {
  let best = labels[0]
  let bestScore = probabilities[labels[0]] ?? 0
  for (const label of labels) {
    const score = probabilities[label] ?? 0
    if (score > bestScore) {
      best = label
      bestScore = score
    }
  }
  return { label: best, score: bestScore }
}

function runnerUpScore(
  probabilities: Record<string, number>,
  labels: readonly string[],
  winner: string,
): number {
  let best = 0
  let seen = false
  for (const label of labels) {
    if (label === winner) continue
    const score = probabilities[label] ?? 0
    if (!seen || score > best) {
      best = score
      seen = true
    }
  }
  return seen ? best : 0
}

/**
 * Mean probabilities, agreement and margin over the windows that are allowed
 * to vote. Excluded windows still count toward `windowsTotal` so the UI can
 * say "4 of 9 windows were too quiet to use".
 *
 * Returns null only when there were no windows at all — i.e. inference never
 * had anything to run on.
 */
export function aggregateWindows(
  windows: WindowResult[],
  labels: readonly string[],
): AggregateStats | null {
  if (windows.length === 0) return null

  const voting = windows.filter((window) => !window.excluded)
  const meanProbabilities: Record<string, number> = {}
  for (const label of labels) {
    let sum = 0
    for (const window of voting) sum += window.probabilities[label] ?? 0
    meanProbabilities[label] = voting.length > 0 ? sum / voting.length : 0
  }

  if (voting.length === 0) {
    return {
      meanProbabilities,
      agreement: 0,
      margin: 0,
      windowsUsed: 0,
      windowsTotal: windows.length,
    }
  }

  const winner = topOf(meanProbabilities, labels)
  const agreeing = voting.filter((window) => window.topLabel === winner.label).length

  return {
    meanProbabilities,
    agreement: agreeing / voting.length,
    margin: winner.score - runnerUpScore(meanProbabilities, labels, winner.label),
    windowsUsed: voting.length,
    windowsTotal: windows.length,
  }
}

/**
 * The decision table, evaluated strictly in order. Only rule 4 attaches a
 * label and a confidence: a negative or inconclusive result must not be
 * rendered with a number beside it, because the number would be read as
 * confidence in the absence of disease, which this model cannot support.
 */
export function decideVerdict(
  quality: QualityReport,
  aggregate: AggregateStats | null,
  labels?: readonly string[],
): Verdict {
  // 1. The recording itself is unusable — nothing downstream matters.
  if (!quality.ok) {
    return { kind: 'insufficient-quality', messageKey: 'verdict.insufficientQuality' }
  }

  // 2. Too few voting windows to average over.
  if (aggregate === null || aggregate.windowsUsed < TUNABLES.MIN_VALID_WINDOWS) {
    return { kind: 'uncertain', messageKey: 'verdict.tooFewWindows' }
  }

  const labelOrder = labels ?? Object.keys(aggregate.meanProbabilities)
  const winner = topOf(aggregate.meanProbabilities, labelOrder)

  // 3. Confident, agreed-upon Healthy.
  if (
    winner.label === HEALTHY_LABEL &&
    winner.score >= TUNABLES.HEALTHY_MEAN_MIN &&
    aggregate.agreement >= TUNABLES.AGREEMENT_MIN
  ) {
    return { kind: 'no-abnormality', messageKey: 'verdict.noAbnormality' }
  }

  // 4. Confident, agreed-upon, well-separated disease.
  if (
    winner.label !== HEALTHY_LABEL &&
    winner.score >= TUNABLES.CONFIDENCE_MEAN_MIN &&
    aggregate.agreement >= TUNABLES.AGREEMENT_MIN &&
    aggregate.margin >= TUNABLES.MARGIN_MIN
  ) {
    return {
      kind: 'suggestive',
      label: winner.label,
      confidence: winner.score,
      messageKey: 'verdict.suggestive',
    }
  }

  // 5. Everything else.
  return { kind: 'uncertain', messageKey: 'verdict.uncertain' }
}
