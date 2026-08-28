import { DEFAULT_MODEL_ID, MODEL_REGISTRY, TUNABLES } from './constants'
import { decodeFromBuffer, decodeToPcm16k, type DecodedAudio } from './decode/decode'
import { precheckQuality } from './dsp/quality'
import { toInt16 } from './dsp/wavEncode'
import type { AnalysisResult, CaptureMeta, ModelInfo } from './types'

/**
 * The no-model path.
 *
 * When the app is built or deployed without the Edge Impulse assets, the
 * platform still has to store a recording and render something coherent. This
 * produces a fully-formed AnalysisResult for that case: the audio is decoded
 * and the quality gate still runs (so the recording carries its metrics), but
 * no inference is attempted and no worker is spawned.
 *
 * The verdict is ALWAYS the model-not-connected one, even when quality also
 * failed. Without a model, "we could not analyse this" is the dominant fact,
 * and a single predictable verdict keeps the platform's verdict → aiStatus
 * mapping unambiguous. Quality problems are still visible in `quality.flags`.
 */
const MODEL_NOT_CONNECTED_MESSAGE_KEY = 'verdict.modelNotConnected'

function modelInfo(modelId: string): ModelInfo {
  const entry = MODEL_REGISTRY[modelId] ?? MODEL_REGISTRY[DEFAULT_MODEL_ID]
  return {
    id: modelId,
    name: entry.name,
    deployVersion: entry.deployVersion,
    labelSchemaId: entry.labelSchemaId,
    labels: entry.labels,
    frequencyHz: entry.frequencyHz,
    windowSamples: entry.windowSamples,
    sliceSamples: entry.sliceSamples,
  }
}

function buildResult(
  decoded: DecodedAudio,
  meta: CaptureMeta,
  decodeMs: number,
  modelId: string,
): AnalysisResult {
  const qualityStart = performance.now()
  const quality = precheckQuality(decoded.pcm16k)
  const qualityMs = performance.now() - qualityStart

  return {
    model: modelInfo(modelId),
    meta: { ...meta, originalSampleRate: decoded.originalSampleRate },
    quality,
    windows: [],
    aggregate: null,
    verdict: { kind: 'uncertain', messageKey: MODEL_NOT_CONNECTED_MESSAGE_KEY },
    audio: {
      pcm16k: toInt16(decoded.pcm16k),
      sampleRate: 16000,
      durationMs: decoded.durationMs,
    },
    timings: { decodeMs, qualityMs, inferenceMs: 0 },
    analyzedAt: new Date().toISOString(),
    tunablesVersion: TUNABLES.tunablesVersion,
  }
}

export async function notConnectedAnalyze(
  file: File | Blob,
  meta: CaptureMeta,
  modelId: string = DEFAULT_MODEL_ID,
): Promise<AnalysisResult> {
  const start = performance.now()
  const decoded = await decodeToPcm16k(file)
  return buildResult(decoded, meta, performance.now() - start, modelId)
}

export async function notConnectedAnalyzeBuffer(
  pcm: Float32Array,
  sampleRate: number,
  meta: CaptureMeta,
  modelId: string = DEFAULT_MODEL_ID,
): Promise<AnalysisResult> {
  const start = performance.now()
  const decoded = await decodeFromBuffer(pcm, sampleRate)
  return buildResult(decoded, meta, performance.now() - start, modelId)
}
