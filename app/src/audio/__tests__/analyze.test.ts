import { afterEach, describe, expect, it } from 'vitest'
import {
  analyzeBuffer,
  analyzeFile,
  assertRuntimeMatchesRegistry,
  disposeClassifier,
  initClassifier,
  setClassifierPort,
  type ClassifierPort,
} from '../analyze'
import { notConnectedAnalyze } from '../notConnected'
import { DEFAULT_MODEL_ID, INT16_FULL_SCALE, MODEL_REGISTRY, TUNABLES } from '../constants'
import type { CaptureMeta, ModelInfo } from '../types'
import { SR, quantizeToInt16, shapedNoise, sineWave } from './signals'
import { buildWav } from './wavBuilder'

const ENTRY = MODEL_REGISTRY[DEFAULT_MODEL_ID]
const LABELS = ENTRY.labels

const MODEL: ModelInfo = {
  id: DEFAULT_MODEL_ID,
  name: ENTRY.name,
  deployVersion: ENTRY.deployVersion,
  labelSchemaId: ENTRY.labelSchemaId,
  labels: ENTRY.labels,
  frequencyHz: ENTRY.frequencyHz,
  windowSamples: ENTRY.windowSamples,
  sliceSamples: ENTRY.sliceSamples,
}

const META: CaptureMeta = { source: 'device-wav', originalMime: 'audio/wav' }

interface SpyPort extends ClassifierPort {
  initCalls: number
  classified: number[]
}

/** A classifier stand-in that records every window it was handed. */
function spyPort(respond: (pcm: Float32Array) => Record<string, number>): SpyPort {
  const port: SpyPort = {
    initCalls: 0,
    classified: [],
    async init() {
      port.initCalls++
      return MODEL
    },
    async classify(pcm) {
      port.classified.push(pcm.length)
      return respond(pcm)
    },
    dispose() {},
  }
  return port
}

/** A classifier that must never be reached. */
function forbiddenPort(): SpyPort {
  return spyPort(() => {
    throw new Error('The quality gate let an unusable recording reach the classifier')
  })
}

const wavBlob = (samples: Int16Array): Blob => new Blob([buildWav(samples)], { type: 'audio/wav' })
const uniform = () => ({ Asthma: 0.25, Bronchiolitis: 0.25, Healthy: 0.25, Pneumonia: 0.25 })

afterEach(() => {
  setClassifierPort(null)
})

describe('THE FLAGSHIP SAFETY TEST', () => {
  it('never lets a pure sine reach the classifier — the model calls it Asthma at 0.996', async () => {
    const port = forbiddenPort()
    setClassifierPort(port)

    const sine = quantizeToInt16(sineWave(440, 0.5 * INT16_FULL_SCALE, 5 * SR))
    const result = await analyzeFile(wavBlob(sine), META)

    expect(port.classified).toEqual([])
    expect(port.initCalls).toBe(0) // the 8 MB model is not even loaded
    expect(result.verdict).toEqual({
      kind: 'insufficient-quality',
      messageKey: 'verdict.insufficientQuality',
    })
    expect(result.quality.ok).toBe(false)
    expect(result.quality.flags.map((f) => f.code)).toContain('tonal')
    expect(result.windows).toEqual([])
    expect(result.aggregate).toBeNull()
  })

  it('still returns the refused audio so the app can store and replay it', async () => {
    setClassifierPort(forbiddenPort())
    const sine = quantizeToInt16(sineWave(440, 0.5 * INT16_FULL_SCALE, 5 * SR))

    const result = await analyzeFile(wavBlob(sine), META)

    expect(result.audio.sampleRate).toBe(16000)
    expect(result.audio.pcm16k.length).toBe(sine.length)
    expect(Array.from(result.audio.pcm16k.slice(0, 32))).toEqual(Array.from(sine.slice(0, 32)))
    expect(result.audio.durationMs).toBeCloseTo(5000, 6)
    expect(result.quality.metrics.tonalityRatio).toBeGreaterThan(TUNABLES.TONALITY_MAX)
  })

  it('keeps silence, noise and over-short clips away from the classifier too', async () => {
    for (const samples of [
      new Int16Array(5 * SR), // digital silence
      quantizeToInt16(shapedNoise(2 * SR)), // too short
    ]) {
      const port = forbiddenPort()
      setClassifierPort(port)
      const result = await analyzeFile(wavBlob(samples), META)
      expect(result.verdict.kind).toBe('insufficient-quality')
      expect(port.classified).toEqual([])
    }
  })
})

describe('analyzeFile — the happy path', () => {
  it('classifies every window and aggregates them into a verdict', async () => {
    const port = spyPort(() => ({
      Asthma: 0.05,
      Bronchiolitis: 0.05,
      Healthy: 0.85,
      Pneumonia: 0.05,
    }))
    setClassifierPort(port)

    const result = await analyzeFile(wavBlob(quantizeToInt16(shapedNoise(4 * SR))), META)

    expect(result.quality.ok).toBe(true)
    expect(result.windows).toHaveLength(7) // 4.0 s at a 500 ms stride
    expect(port.classified).toEqual(Array(7).fill(ENTRY.windowSamples))
    expect(result.aggregate).toMatchObject({ windowsUsed: 7, windowsTotal: 7, agreement: 1 })
    expect(result.verdict).toEqual({
      kind: 'no-abnormality',
      messageKey: 'verdict.noAbnormality',
    })
  })

  it('labels each window from its own probabilities and stamps its position', async () => {
    setClassifierPort(spyPort(() => ({ Asthma: 0.7, Bronchiolitis: 0.1, Healthy: 0.1, Pneumonia: 0.1 })))

    const result = await analyzeFile(wavBlob(quantizeToInt16(shapedNoise(4 * SR))), META)

    expect(result.windows[0]).toMatchObject({ startMs: 0, endMs: 1000, topLabel: 'Asthma', topScore: 0.7 })
    expect(result.windows[1]).toMatchObject({ startMs: 500, endMs: 1500 })
    expect(result.verdict).toMatchObject({
      kind: 'suggestive',
      label: 'Asthma',
      messageKey: 'verdict.suggestive',
    })
    expect(result.verdict.confidence).toBeCloseTo(0.7, 10)
  })

  it('classifies quiet windows but does not let them vote', async () => {
    // Four seconds of usable audio with the second half faded to near-silence.
    const loud = shapedNoise(4 * SR)
    const faded = Float32Array.from(loud, (v, i) => (i > 2.5 * SR ? v * 0.0005 : v))
    setClassifierPort(spyPort(() => uniform()))

    const result = await analyzeFile(wavBlob(quantizeToInt16(faded)), META)

    const excluded = result.windows.filter((w) => w.excluded)
    expect(excluded.length).toBeGreaterThan(0)
    for (const window of excluded) {
      expect(window.rmsDbfs).toBeLessThan(TUNABLES.WINDOW_SILENCE_DBFS)
      expect(window.probabilities).toEqual(uniform()) // still classified
    }
    expect(result.aggregate!.windowsUsed).toBe(result.windows.length - excluded.length)
    expect(result.aggregate!.windowsTotal).toBe(result.windows.length)
  })

  it('always fills in the original sample rate and the tunables version', async () => {
    setClassifierPort(spyPort(() => uniform()))
    const result = await analyzeFile(wavBlob(quantizeToInt16(shapedNoise(4 * SR))), {
      source: 'file-import',
    })
    expect(result.meta).toEqual({ source: 'file-import', originalSampleRate: 16000 })
    expect(result.tunablesVersion).toBe(TUNABLES.tunablesVersion)
    expect(result.model).toEqual(MODEL)
    expect(Date.parse(result.analyzedAt)).not.toBeNaN()
  })

  it('reports decode, quality and inference timings separately', async () => {
    setClassifierPort(spyPort(() => uniform()))
    const result = await analyzeFile(wavBlob(quantizeToInt16(shapedNoise(4 * SR))), META)
    for (const value of Object.values(result.timings)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('propagates a decode failure rather than inventing a verdict', async () => {
    setClassifierPort(forbiddenPort())
    await expect(analyzeFile(new Blob([]), META)).rejects.toMatchObject({ code: 'empty' })
  })
})

describe('analyzeBuffer', () => {
  it('skips decoding and analyses samples already at 16 kHz', async () => {
    const port = spyPort(() => uniform())
    setClassifierPort(port)

    const pcm = shapedNoise(4 * SR)
    const result = await analyzeBuffer(pcm, 16000, { source: 'phone-mic' })

    expect(result.meta).toEqual({ source: 'phone-mic', originalSampleRate: 16000 })
    expect(result.windows).toHaveLength(7)
    expect(result.timings.decodeMs).toBeGreaterThanOrEqual(0)
  })

  it('applies the same gate as the file path', async () => {
    const port = forbiddenPort()
    setClassifierPort(port)
    const result = await analyzeBuffer(sineWave(440, 0.5 * INT16_FULL_SCALE, 4 * SR), 16000, META)
    expect(result.verdict.kind).toBe('insufficient-quality')
    expect(port.classified).toEqual([])
  })
})

describe('initClassifier', () => {
  it('is idempotent — one load, however many callers', async () => {
    const port = spyPort(() => uniform())
    setClassifierPort(port)
    const [a, b] = await Promise.all([initClassifier(), initClassifier()])
    expect(port.initCalls).toBe(1)
    expect(a).toEqual(MODEL)
    expect(b).toEqual(MODEL)
  })

  it('rejects an unknown model id', async () => {
    await expect(initClassifier('not-a-model')).rejects.toThrow('Unknown model id')
  })

  it('lets a failed load be retried instead of caching the failure', async () => {
    let attempt = 0
    setClassifierPort({
      async init() {
        attempt++
        if (attempt === 1) throw new Error('wasm fetch failed')
        return MODEL
      },
      async classify() {
        return uniform()
      },
      dispose() {},
    })
    await expect(initClassifier()).rejects.toThrow('wasm fetch failed')
    await expect(initClassifier()).resolves.toEqual(MODEL)
  })

  it('disposes the port and forgets its state', async () => {
    let disposed = false
    setClassifierPort({
      async init() {
        return MODEL
      },
      async classify() {
        return uniform()
      },
      dispose() {
        disposed = true
      },
    })
    await initClassifier()
    disposeClassifier()
    expect(disposed).toBe(true)
  })
})

describe('assertRuntimeMatchesRegistry', () => {
  const loaded = {
    projectInfo: {
      project_id: 1,
      project_owner: 'Ausculta',
      project_name: 'SmartStethoscope',
      impulse_id: 1,
      impulse_name: 'impulse',
      deploy_version: 5,
    },
    properties: {
      frequency: 16000,
      input_features_count: 16000,
      label_count: 4,
      slice_size: 4000,
      interval_ms: 0.0625,
      model_type: 'classification',
      has_anomaly: 0,
    },
    labels: [...LABELS],
  }

  it('accepts the model the app was calibrated against', () => {
    expect(() => assertRuntimeMatchesRegistry(DEFAULT_MODEL_ID, ENTRY, loaded)).not.toThrow()
  })

  it('accepts a runtime whose label probe failed, falling back to the count', () => {
    expect(() =>
      assertRuntimeMatchesRegistry(DEFAULT_MODEL_ID, ENTRY, { ...loaded, labels: null }),
    ).not.toThrow()
  })

  it.each([
    ['sampling frequency', { properties: { ...loaded.properties, frequency: 8000 } }],
    ['window size', { properties: { ...loaded.properties, input_features_count: 8000 } }],
    ['slice size', { properties: { ...loaded.properties, slice_size: 2000 } }],
    ['label count', { properties: { ...loaded.properties, label_count: 3 } }],
    ['deploy version', { projectInfo: { ...loaded.projectInfo, deploy_version: 6 } }],
    ['label order', { labels: ['Healthy', 'Asthma', 'Bronchiolitis', 'Pneumonia'] }],
  ])('rejects a runtime whose %s does not match', (what, override) => {
    expect(() =>
      assertRuntimeMatchesRegistry(DEFAULT_MODEL_ID, ENTRY, { ...loaded, ...override }),
    ).toThrow(new RegExp(what))
  })

  it('rejects a renamed label even when the count still matches', () => {
    expect(() =>
      assertRuntimeMatchesRegistry(DEFAULT_MODEL_ID, ENTRY, {
        ...loaded,
        labels: ['Asthma', 'Bronchiolitis', 'Normal', 'Pneumonia'],
      }),
    ).toThrow(/label order/)
  })
})

describe('notConnectedAnalyze', () => {
  it('produces a well-formed result without loading a model', async () => {
    const port = forbiddenPort()
    setClassifierPort(port)

    const result = await notConnectedAnalyze(wavBlob(quantizeToInt16(shapedNoise(4 * SR))), META)

    expect(port.initCalls).toBe(0)
    expect(result.verdict).toEqual({ kind: 'uncertain', messageKey: 'verdict.modelNotConnected' })
    expect(result.windows).toEqual([])
    expect(result.aggregate).toBeNull()
    expect(result.quality.ok).toBe(true)
    expect(result.audio.pcm16k.length).toBe(4 * SR)
    expect(result.meta.originalSampleRate).toBe(16000)
    expect(result.tunablesVersion).toBe(TUNABLES.tunablesVersion)
  })

  it('keeps the model-not-connected verdict even when quality also failed', async () => {
    const sine = quantizeToInt16(sineWave(440, 0.5 * INT16_FULL_SCALE, 4 * SR))
    const result = await notConnectedAnalyze(wavBlob(sine), META)
    expect(result.verdict.messageKey).toBe('verdict.modelNotConnected')
    expect(result.quality.ok).toBe(false)
    expect(result.quality.flags.map((f) => f.code)).toContain('tonal')
  })
})
