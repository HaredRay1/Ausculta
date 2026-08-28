import { aggregateWindows, decideVerdict, topOf } from './aggregate'
import { ClassifierClient } from './classifier/client'
import type { WorkerResponse } from './classifier/protocol'
import {
  DEFAULT_MODEL_ID,
  MODEL_REGISTRY,
  TUNABLES,
  type ModelRegistryEntry,
} from './constants'
import { decodeFromBuffer, decodeToPcm16k, type DecodedAudio } from './decode/decode'
import { precheckQuality } from './dsp/quality'
import { planSegments, windowRmsDbfs } from './dsp/segment'
import { toInt16 } from './dsp/wavEncode'
import type { AnalysisResult, CaptureMeta, ModelInfo, WindowResult } from './types'

type LoadedResponse = Extract<WorkerResponse, { type: 'loaded' }>

/**
 * Everything analyze.ts needs from a classifier. Injecting this rather than
 * reaching for the worker directly is what lets the pipeline — including the
 * rule that a rejected recording never reaches the model — be tested in Node.
 */
export interface ClassifierPort {
  init(): Promise<ModelInfo>
  classify(pcm: Float32Array): Promise<Record<string, number>>
  dispose(): void
}

let port: ClassifierPort | null = null
let initPromise: Promise<ModelInfo> | null = null
let initializedModelId: string | null = null

/**
 * Test seam. Not exported from index.ts — the platform gets the worker-backed
 * classifier and nothing else.
 * @internal
 */
export function setClassifierPort(next: ClassifierPort | null): void {
  port = next
  initPromise = null
  initializedModelId = null
}

function now(): number {
  return performance.now()
}

function toModelInfo(modelId: string, entry: ModelRegistryEntry): ModelInfo {
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

function requireEntry(modelId: string): ModelRegistryEntry {
  const entry = MODEL_REGISTRY[modelId]
  if (!entry) throw new Error(`Unknown model id "${modelId}"`)
  return entry
}

/**
 * Refuse to run a model that is not the one this app's thresholds were chosen
 * for. A re-export with different labels, a different label ORDER, or a
 * different sample rate produces confident output that means something else
 * entirely, and nothing downstream could tell.
 * @internal — exported for its unit test, not part of the public API.
 */
export function assertRuntimeMatchesRegistry(
  modelId: string,
  entry: ModelRegistryEntry,
  loaded: Pick<LoadedResponse, 'projectInfo' | 'properties' | 'labels'>,
): void {
  const { properties, projectInfo, labels } = loaded
  const mismatch = (what: string, expected: unknown, actual: unknown): never => {
    throw new Error(
      `Model "${modelId}" does not match its registry entry: ${what} is ${String(actual)}, expected ${String(expected)}`,
    )
  }

  if (properties.frequency !== entry.frequencyHz) {
    mismatch('sampling frequency', entry.frequencyHz, properties.frequency)
  }
  if (properties.input_features_count !== entry.windowSamples) {
    mismatch('window size', entry.windowSamples, properties.input_features_count)
  }
  if (properties.slice_size !== entry.sliceSamples) {
    mismatch('slice size', entry.sliceSamples, properties.slice_size)
  }
  if (projectInfo.deploy_version !== entry.deployVersion) {
    mismatch('deploy version', entry.deployVersion, projectInfo.deploy_version)
  }
  if (properties.label_count !== entry.labels.length) {
    mismatch('label count', entry.labels.length, properties.label_count)
  }
  if (labels && labels.join('|') !== entry.labels.join('|')) {
    mismatch('label order', entry.labels.join(', '), labels.join(', '))
  }
}

function createWorkerPort(modelId: string, entry: ModelRegistryEntry): ClassifierPort {
  const client = new ClassifierClient()
  return {
    async init() {
      const loaded = await client.load(entry.baseUrl)
      assertRuntimeMatchesRegistry(modelId, entry, loaded)
      return toModelInfo(modelId, entry)
    },
    classify: (pcm) => client.classify(pcm),
    dispose: () => client.dispose(),
  }
}

/**
 * Spin up the worker, load the model, and verify it is the model this app was
 * calibrated against. Idempotent: repeat calls share one in-flight promise.
 */
export function initClassifier(modelId: string = DEFAULT_MODEL_ID): Promise<ModelInfo> {
  let entry: ModelRegistryEntry
  try {
    entry = requireEntry(modelId)
  } catch (error) {
    return Promise.reject(error)
  }

  if (initPromise && initializedModelId !== null && initializedModelId !== modelId) {
    return Promise.reject(
      new Error(
        `Classifier is already initialised with model "${initializedModelId}"; dispose it before loading "${modelId}"`,
      ),
    )
  }

  if (!initPromise) {
    if (!port) port = createWorkerPort(modelId, entry)
    initializedModelId = modelId
    initPromise = port.init().catch((error: unknown) => {
      // Let the next call retry rather than caching the failure forever.
      initPromise = null
      initializedModelId = null
      throw error
    })
  }
  return initPromise
}

export function disposeClassifier(): void {
  port?.dispose()
  port = null
  initPromise = null
  initializedModelId = null
}

async function runPipeline(
  decoded: DecodedAudio,
  meta: CaptureMeta,
  decodeMs: number,
  modelId: string,
): Promise<AnalysisResult> {
  const entry = requireEntry(modelId)

  const qualityStart = now()
  const quality = precheckQuality(decoded.pcm16k)
  const qualityMs = now() - qualityStart

  const audio = {
    pcm16k: toInt16(decoded.pcm16k),
    sampleRate: 16000 as const,
    durationMs: decoded.durationMs,
  }
  const resolvedMeta: CaptureMeta = { ...meta, originalSampleRate: decoded.originalSampleRate }

  // The gate is the whole point: a rejected recording never reaches the model,
  // so the worker is not even loaded. The decoded audio is still returned so
  // the app can store and replay what was refused.
  if (!quality.ok) {
    return {
      model: toModelInfo(modelId, entry),
      meta: resolvedMeta,
      quality,
      windows: [],
      aggregate: null,
      verdict: decideVerdict(quality, null, entry.labels),
      audio,
      timings: { decodeMs, qualityMs, inferenceMs: 0 },
      analyzedAt: new Date().toISOString(),
      tunablesVersion: TUNABLES.tunablesVersion,
    }
  }

  const model = await initClassifier(modelId)
  const classifier = port
  if (!classifier) throw new Error('Classifier was disposed while an analysis was in flight')

  const inferenceStart = now()
  const windows: WindowResult[] = []
  for (const segment of planSegments(decoded.pcm16k.length)) {
    const rmsDbfs = windowRmsDbfs(decoded.pcm16k, segment.startSample, segment.endSample)
    // A fresh copy per window: client.classify transfers the buffer away.
    const slice = decoded.pcm16k.slice(segment.startSample, segment.endSample)
    const probabilities = await classifier.classify(slice)
    const top = topOf(probabilities, model.labels)
    windows.push({
      startMs: segment.startMs,
      endMs: segment.endMs,
      probabilities,
      topLabel: top.label,
      topScore: top.score,
      rmsDbfs,
      // Quiet windows are still classified and reported, but must not vote:
      // the model has no "nothing here" class.
      excluded: rmsDbfs < TUNABLES.WINDOW_SILENCE_DBFS,
    })
  }
  const inferenceMs = now() - inferenceStart

  const aggregate = aggregateWindows(windows, model.labels)
  return {
    model,
    meta: resolvedMeta,
    quality,
    windows,
    aggregate,
    verdict: decideVerdict(quality, aggregate, model.labels),
    audio,
    timings: { decodeMs, qualityMs, inferenceMs },
    analyzedAt: new Date().toISOString(),
    tunablesVersion: TUNABLES.tunablesVersion,
  }
}

export async function analyzeFile(
  file: File | Blob,
  meta: CaptureMeta,
  modelId: string = DEFAULT_MODEL_ID,
): Promise<AnalysisResult> {
  const start = now()
  const decoded = await decodeToPcm16k(file)
  return runPipeline(decoded, meta, now() - start, modelId)
}

/**
 * As analyzeFile, for callers that already hold samples. `pcm` must be in
 * int16 range (-32768..32767) — the same convention as `precheckQuality` and
 * `AnalysisResult.audio` — not Web Audio's -1..1.
 */
export async function analyzeBuffer(
  pcm: Float32Array,
  sampleRate: number,
  meta: CaptureMeta,
  modelId: string = DEFAULT_MODEL_ID,
): Promise<AnalysisResult> {
  const start = now()
  const decoded = await decodeFromBuffer(pcm, sampleRate)
  return runPipeline(decoded, meta, now() - start, modelId)
}
