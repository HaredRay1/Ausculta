import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeWav } from '../../../audio'
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

/**
 * Six seconds of low-passed noise at a third of full scale — spectrally
 * shaped enough to be neither flat nor tonal, and quiet enough not to clip.
 * Stands in for a usable auscultation recording, which `samples/` does not
 * currently contain (see the sample-file test below).
 */
function usableRecording(): File {
  const samples = 16000 * 6
  let state = 12345
  const signal = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    state = (state * 1664525 + 1013904223) >>> 0
    signal[i] = (state / 4294967296) * 2 - 1
  }
  // Two poles of low-pass: one is not enough shaping and the spectrum stays
  // flat enough to be rejected as broadband noise, which is the point of that
  // check.
  for (let pole = 0; pole < 2; pole++) {
    let filtered = 0
    for (let i = 0; i < samples; i++) {
      filtered = 0.6 * filtered + 0.4 * signal[i]
      signal[i] = filtered
    }
  }
  let peak = 0
  for (const value of signal) peak = Math.max(peak, Math.abs(value))
  const pcm = new Int16Array(samples)
  for (let i = 0; i < samples; i++) {
    pcm[i] = Math.round((signal[i] / peak) * 0.4 * 32768)
  }
  return new File([encodeWav(pcm)], 'usable.wav', { type: 'audio/wav' })
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
   * `samples/README.md` says 04-breath-like.wav should pass the gate and reach
   * the model. It does not: it is generated at close to full scale, so 1.5 % of
   * its samples sit on the int16 rail (the reject threshold is 1 %) and its
   * whole-clip RMS is -8.7 dBFS, far hotter than any real chest recording.
   *
   * The gate is behaving correctly — a recording that clips that much IS
   * unusable — so the fix belongs in whatever generated the sample: scale it to
   * roughly a third of full scale. This test pins the discrepancy rather than
   * hiding it, and will fail the moment the file is regenerated, which is when
   * it should be replaced by the assertion the README describes.
   */
  it('records that 04-breath-like.wav does NOT yet pass the gate: it clips', async () => {
    const precheck = await importSample('04-breath-like.wav')

    expect(precheck.quality.ok).toBe(false)
    expect(precheck.quality.flags.map((flag) => flag.code)).toEqual(['clipping'])
    expect(precheck.quality.metrics.clipFraction).toBeGreaterThan(0.01)
  })

  it('lets a properly-levelled recording through to the model', async () => {
    const precheck = await defaultAudioPort.precheck(usableRecording(), DEVICE_IMPORT_META)

    expect(precheck.quality.ok).toBe(true)
    expect(precheck.quality.flags.filter((flag) => flag.severity === 'reject')).toEqual([])
  })
})

describe('runAnalysis when the model cannot be loaded', () => {
  it('degrades to model-not-connected, never to a fabricated finding', async () => {
    const precheck = await defaultAudioPort.precheck(usableRecording(), DEVICE_IMPORT_META)

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
