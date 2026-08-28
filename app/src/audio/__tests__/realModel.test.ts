/// <reference types="node" />
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { assertRuntimeMatchesRegistry } from '../analyze'
import { DEFAULT_MODEL_ID, INT16_FULL_SCALE, MODEL_REGISTRY } from '../constants'
import { precheckQuality } from '../dsp/quality'
import fixtures from '../__fixtures__/wasm-fixtures.json'
import { SR, sineWave, whiteNoise } from './signals'

/**
 * Tier 2: the REAL Edge Impulse WASM, no browser and no mock.
 *
 * The Emscripten deployment turns out to run headlessly under Node inside a
 * `vm` context (see __fixtures__/runRealModel.cjs), so the fixtures are
 * captured and checked automatically on every `npm test` rather than by hand
 * in a browser.
 *
 * Two things are pinned here. First, that the deployed model really is the one
 * MODEL_REGISTRY claims — the cross-check `initClassifier` performs at runtime,
 * run against the actual artefact. Second, and the reason this file exists:
 * that the inputs this model scores CONFIDENTLY AND WRONGLY are all stopped by
 * the quality gate before they could ever reach it.
 */

const require = createRequire(import.meta.url)
const realModel = require('../__fixtures__/runRealModel.cjs') as {
  modelFilesPresent(): boolean
  loadRealClassifier(): Promise<{
    classifier: { classify(pcm: Float32Array): { results: { label: string; value: number }[] } }
    properties: Record<string, number | string>
    projectInfo: Record<string, number | string>
  }>
  checksum(vector: Float32Array): number
}

const ENTRY = MODEL_REGISTRY[DEFAULT_MODEL_ID]
const WINDOW = ENTRY.windowSamples

/** Mirrors of the vectors runRealModel.cjs captured, built from the shared helpers. */
const VECTORS: Record<string, Float32Array> = {
  zeros: new Float32Array(WINDOW),
  'sine-440hz': sineWave(440, 0.5 * INT16_FULL_SCALE, WINDOW),
  'seeded-noise': whiteNoise(0.2 * INT16_FULL_SCALE, WINDOW, 12345),
}

/** The same signals extended past MIN_DURATION_S, i.e. as a real import. */
const FULL_LENGTH_VECTORS: Record<string, Float32Array> = {
  zeros: new Float32Array(4 * SR),
  'sine-440hz': sineWave(440, 0.5 * INT16_FULL_SCALE, 4 * SR),
  'seeded-noise': whiteNoise(0.2 * INT16_FULL_SCALE, 4 * SR, 12345),
}

describe.skipIf(!realModel.modelFilesPresent())('the real Edge Impulse WASM', () => {
  let classify: (pcm: Float32Array) => Record<string, number>
  let properties: Record<string, number | string>
  let projectInfo: Record<string, number | string>
  let labels: string[]

  beforeAll(async () => {
    const loaded = await realModel.loadRealClassifier()
    properties = loaded.properties
    projectInfo = loaded.projectInfo
    classify = (pcm) => {
      const probabilities: Record<string, number> = {}
      for (const result of loaded.classifier.classify(pcm).results) {
        probabilities[result.label] = result.value
      }
      return probabilities
    }
    labels = Object.keys(classify(new Float32Array(WINDOW)))
  }, 60_000)

  it('is the model MODEL_REGISTRY describes', () => {
    expect(labels).toEqual([...ENTRY.labels])
    expect(properties.frequency).toBe(ENTRY.frequencyHz)
    expect(properties.input_features_count).toBe(ENTRY.windowSamples)
    expect(properties.slice_size).toBe(ENTRY.sliceSamples)
    expect(properties.label_count).toBe(ENTRY.labels.length)
    expect(projectInfo.deploy_version).toBe(ENTRY.deployVersion)
  })

  it('passes the same cross-check initClassifier applies at runtime', () => {
    expect(() =>
      assertRuntimeMatchesRegistry(DEFAULT_MODEL_ID, ENTRY, {
        properties: properties as never,
        projectInfo: projectInfo as never,
        labels,
      }),
    ).not.toThrow()
  })

  it.each(Object.keys(VECTORS))('still scores the "%s" vector as captured', (name) => {
    const fixture = fixtures.vectors[name as keyof typeof fixtures.vectors]
    const vector = VECTORS[name]

    // Guards against the fixture and the test drifting onto different audio.
    expect(realModel.checksum(vector)).toBeCloseTo(fixture.checksum, 6)

    const probabilities = classify(vector)
    expect(Object.keys(probabilities).sort()).toEqual(
      Object.keys(fixture.probabilities).sort(),
    )
    for (const [label, expected] of Object.entries(fixture.probabilities)) {
      expect(probabilities[label]).toBeCloseTo(expected, 4)
    }
  })
})

describe.skipIf(!realModel.modelFilesPresent())('what the real model does with garbage', () => {
  /**
   * These are the captured facts that justify the entire quality gate. Read
   * them as: given a second of nothing, or a tone, or hiss, this classifier
   * does not abstain — it answers, and sometimes it answers loudly.
   */
  it('answers confidently on inputs that carry no lung sound at all', () => {
    expect(fixtures.vectors.zeros.probabilities.Healthy).toBeGreaterThan(0.9)
    expect(fixtures.vectors['seeded-noise'].probabilities.Asthma).toBeGreaterThan(0.99)
    const sine = fixtures.vectors['sine-440hz'].probabilities
    expect(Math.max(...Object.values(sine))).toBeGreaterThan(0.5)
  })

  it.each(Object.keys(FULL_LENGTH_VECTORS))(
    'refuses the "%s" input before it can reach the model',
    (name) => {
      const report = precheckQuality(FULL_LENGTH_VECTORS[name])
      expect(report.ok).toBe(false)
      expect(report.flags.some((flag) => flag.severity === 'reject')).toBe(true)
    },
  )

  it('names the specific defect it rejected each input for', () => {
    const rejectCodes = (pcm: Float32Array) =>
      precheckQuality(pcm)
        .flags.filter((flag) => flag.severity === 'reject')
        .map((flag) => flag.code)

    expect(rejectCodes(FULL_LENGTH_VECTORS.zeros)).toContain('silence')
    expect(rejectCodes(FULL_LENGTH_VECTORS['sine-440hz'])).toContain('tonal')
    expect(rejectCodes(FULL_LENGTH_VECTORS['seeded-noise'])).toContain('noise-like')
  })
})
