import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AI_STATUS } from '../../../db/codes'
import { toAiOutcome } from '../data/mapping'
import { DEVICE_IMPORT_META, defaultAudioPort } from './audioPort'
import { runAnalysis } from './runAnalysis'
import { toResultView } from './verdict'

/**
 * The safety behaviour, against the real sample recordings in `samples/`.
 *
 * The three garbage inputs below are the ones the raw model answers loudly and
 * wrongly — it scores digital silence as Healthy at 0.988 and white noise as
 * Asthma at 0.996. Every one of them must be refused by the quality gate
 * before inference. That refusal is the single most important thing this
 * software does, so it is tested here on the actual bytes rather than on a
 * synthetic buffer.
 *
 * The real audio module runs: `analyzeBuffer` returns the insufficient-quality
 * verdict without ever loading the model, so no WASM is needed for this suite.
 */
const SAMPLES = resolve(process.cwd(), '../samples')

function sampleFile(name: string): File {
  const bytes = new Uint8Array(readFileSync(resolve(SAMPLES, name)))
  return new File([bytes], name, { type: 'audio/wav' })
}

async function importSample(name: string) {
  return defaultAudioPort.precheck(sampleFile(name), DEVICE_IMPORT_META)
}

describe('the quality gate on the real sample recordings', () => {
  it.each(['01-silence.wav', '02-pure-tone.wav', '03-white-noise.wav'])(
    'refuses %s before the model ever sees it',
    async (name) => {
      const precheck = await importSample(name)
      expect(precheck.quality.ok).toBe(false)

      const analysed = await runAnalysis(precheck, defaultAudioPort)

      expect(analysed.verdict.kind).toBe('insufficient-quality')
      // No windows means no inference happened at all.
      expect(analysed.windows).toHaveLength(0)
      expect(analysed.aggregate).toBeNull()
      expect(analysed.timings.inferenceMs).toBe(0)

      const outcome = toAiOutcome(analysed)
      expect(outcome.aiStatus).toBe(AI_STATUS.INSUFFICIENT_QUALITY)
      expect(outcome.aiClassification).toBeUndefined()
      expect(outcome.aiConfidence).toBeUndefined()

      const view = toResultView(analysed)
      expect(view.state).toBe('insufficient-quality')
      expect(view.confidencePercent).toBeUndefined()
    },
  )

  it('names why each one was refused, so the screen can explain it', async () => {
    const flagsOf = async (name: string) =>
      (await importSample(name)).quality.flags
        .filter((flag) => flag.severity === 'reject')
        .map((flag) => flag.code)

    expect(await flagsOf('01-silence.wav')).toContain('silence')
    expect(await flagsOf('02-pure-tone.wav')).toContain('tonal')
    expect(await flagsOf('03-white-noise.wav')).toContain('noise-like')
  })

  it('flags the clipped recording', async () => {
    const precheck = await importSample('05-clipped.wav')
    const codes = precheck.quality.flags.map((flag) => flag.code)

    expect(codes.some((code) => code === 'clipping' || code === 'clipping-warn')).toBe(true)
  })

  /**
   * The one sample that must NOT be refused.
   *
   * Three rejected files and one accepted tells the story the sample set is for
   * — the gate discriminating, not the app being unable to analyse anything.
   * Four rejected would tell a validator the opposite.
   *
   * Asserted with margins rather than just `ok`, so a fixture that drifts back
   * towards a threshold fails here while it is still comfortably passing,
   * instead of flipping silently the first time a metric crosses the line.
   */
  it('lets 04-breath-like.wav through to the model, with room to spare', async () => {
    const { quality } = await importSample('04-breath-like.wav')
    const { metrics } = quality

    expect(quality.ok).toBe(true)
    // Not one flag, not even a warning.
    expect(quality.flags).toEqual([])

    expect(metrics.clipFraction).toBe(0)
    expect(metrics.rmsDbfs).toBeGreaterThan(-40)
    expect(metrics.durationMs).toBeGreaterThanOrEqual(3000)
    expect(metrics.spectralFlatness).toBeLessThan(0.3)
    expect(metrics.tonalityRatio).toBeLessThan(0.4)
    expect(metrics.hfEnergyRatio).toBeLessThan(0.4)
    expect(Math.abs(metrics.dcOffset)).toBeLessThan(0.01)
  })

  it('hands 04-breath-like.wav to the classifier rather than stopping at the gate', async () => {
    const analysed = await runAnalysis(await importSample('04-breath-like.wav'), defaultAudioPort)

    // The distinction that proves it got past the gate: a recording the gate
    // refuses comes back `insufficient-quality` without the model ever being
    // asked for. This one reaches `initClassifier` and only then finds there is
    // no impulse in this environment.
    expect(analysed.verdict.kind).not.toBe('insufficient-quality')
    expect(toAiOutcome(analysed).aiStatus).toBe(AI_STATUS.MODEL_NOT_CONNECTED)
  })
})

describe('runAnalysis when the model cannot be loaded', () => {
  it('degrades to model-not-connected, never to a fabricated finding', async () => {
    const precheck = await importSample('04-breath-like.wav')

    // No classifier worker exists under jsdom, which is exactly the shape of a
    // deployment built without the Edge Impulse assets.
    const analysed = await runAnalysis(precheck, defaultAudioPort)

    const outcome = toAiOutcome(analysed)
    expect(outcome.aiStatus).toBe(AI_STATUS.MODEL_NOT_CONNECTED)
    expect(outcome.aiClassification).toBeUndefined()
    expect(outcome.aiConfidence).toBeUndefined()

    // The audio and its quality report survive, so the recording is still
    // worth keeping and can be analysed later.
    expect(analysed.audio.pcm16k.length).toBeGreaterThan(0)
    expect(analysed.quality.ok).toBe(true)
  })
})
