/**
 * Builders for the audio module's public result shapes.
 *
 * Not a test file — vitest only collects *.test.ts.
 *
 * These construct `AnalysisResult` values by hand rather than by running the
 * real classifier: the impulse is an 8 MB WASM download and none of the logic
 * under test here depends on what the model actually says, only on the shape
 * of the verdict it produced. The one place the real module IS exercised is
 * `mapping.test.ts`, which pins the model-not-connected message key against
 * `notConnectedAnalyzeBuffer` so this file cannot drift from the contract.
 */
import type {
  AggregateStats,
  AnalysisResult,
  CaptureMeta,
  ModelInfo,
  QualityFlag,
  QualityReport,
  Verdict,
  WindowResult,
} from '../../../audio'

export const TEST_MODEL: ModelInfo = {
  id: 'ei-disease-v5',
  name: 'SmartStethoscope',
  deployVersion: 5,
  labelSchemaId: 'disease-v1',
  labels: ['Asthma', 'Bronchiolitis', 'Healthy', 'Pneumonia'],
  frequencyHz: 16000,
  windowSamples: 16000,
  sliceSamples: 4000,
}

export const TEST_META: CaptureMeta = {
  source: 'device-wav',
  originalMime: 'audio/wav',
  originalSampleRate: 16000,
}

export function goodQuality(): QualityReport {
  return {
    ok: true,
    flags: [],
    metrics: {
      durationMs: 6000,
      rmsDbfs: -24,
      clipFraction: 0,
      dcOffset: 0.001,
      spectralFlatness: 0.2,
      tonalityRatio: 0.2,
      hfEnergyRatio: 0.2,
    },
  }
}

export function badQuality(...flags: QualityFlag[]): QualityReport {
  const rejected =
    flags.length > 0
      ? flags
      : [{ code: 'silence' as const, severity: 'reject' as const, value: -70, threshold: -50 }]
  return {
    ok: !rejected.some((flag) => flag.severity === 'reject'),
    flags: rejected,
    metrics: { ...goodQuality().metrics, rmsDbfs: -70 },
  }
}

export function window(topLabel: string, topScore: number, startMs = 0): WindowResult {
  const rest = (1 - topScore) / (TEST_MODEL.labels.length - 1)
  const probabilities: Record<string, number> = {}
  for (const label of TEST_MODEL.labels) {
    probabilities[label] = label === topLabel ? topScore : rest
  }
  return {
    startMs,
    endMs: startMs + 1000,
    probabilities,
    topLabel,
    topScore,
    rmsDbfs: -24,
    excluded: false,
  }
}

export function aggregate(meanProbabilities: Record<string, number>, used = 5): AggregateStats {
  return {
    meanProbabilities,
    agreement: 1,
    margin: 0.4,
    windowsUsed: used,
    windowsTotal: used,
  }
}

export interface ResultOverrides {
  verdict: Verdict
  quality?: QualityReport
  windows?: WindowResult[]
  aggregate?: AggregateStats | null
  model?: ModelInfo
  durationMs?: number
  sampleCount?: number
}

export function analysisResult(overrides: ResultOverrides): AnalysisResult {
  const durationMs = overrides.durationMs ?? 6000
  const sampleCount = overrides.sampleCount ?? Math.round((durationMs / 1000) * 16000)
  return {
    model: overrides.model ?? TEST_MODEL,
    meta: TEST_META,
    quality: overrides.quality ?? goodQuality(),
    windows: overrides.windows ?? [],
    aggregate: overrides.aggregate ?? null,
    verdict: overrides.verdict,
    audio: { pcm16k: new Int16Array(sampleCount), sampleRate: 16000, durationMs },
    timings: { decodeMs: 4, qualityMs: 3, inferenceMs: 20 },
    analyzedAt: '2026-08-29T00:00:00.000Z',
    tunablesVersion: 1,
  }
}

/** A confident Pneumonia finding — the only verdict that carries a number. */
export function suggestiveResult(label = 'Pneumonia', confidence = 0.82): AnalysisResult {
  return analysisResult({
    verdict: { kind: 'suggestive', label, confidence, messageKey: 'verdict.suggestive' },
    windows: [window(label, confidence, 0), window(label, confidence, 500)],
    aggregate: aggregate({ Asthma: 0.06, Bronchiolitis: 0.06, Healthy: 0.06, Pneumonia: confidence }),
  })
}

export function noAbnormalityResult(healthyMean = 0.74): AnalysisResult {
  const rest = (1 - healthyMean) / 3
  return analysisResult({
    verdict: { kind: 'no-abnormality', messageKey: 'verdict.noAbnormality' },
    windows: [window('Healthy', healthyMean, 0), window('Healthy', healthyMean, 500)],
    aggregate: aggregate({
      Asthma: rest,
      Bronchiolitis: rest,
      Healthy: healthyMean,
      Pneumonia: rest,
    }),
  })
}

export function uncertainResult(messageKey = 'verdict.uncertain'): AnalysisResult {
  return analysisResult({
    verdict: { kind: 'uncertain', messageKey },
    windows: [window('Asthma', 0.4, 0), window('Healthy', 0.38, 500)],
    aggregate: aggregate({ Asthma: 0.4, Bronchiolitis: 0.1, Healthy: 0.38, Pneumonia: 0.12 }),
  })
}

export function insufficientQualityResult(): AnalysisResult {
  return analysisResult({
    verdict: { kind: 'insufficient-quality', messageKey: 'verdict.insufficientQuality' },
    quality: badQuality(),
    windows: [],
    aggregate: null,
  })
}

/** What the audio module returns when there is no model to run. */
export function notConnectedResult(): AnalysisResult {
  return analysisResult({
    verdict: { kind: 'uncertain', messageKey: 'verdict.modelNotConnected' },
    windows: [],
    aggregate: null,
  })
}
