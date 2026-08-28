import { DEFAULT_MODEL_ID, INT16_FULL_SCALE, MODEL_REGISTRY, TUNABLES } from '../constants'
import type { QualityFlag, QualityMetrics, QualityReport } from '../types'
import { hannWindow, powerSpectrum } from './fft'
import { windowRmsDbfs } from './segment'

/**
 * The safety gate. It runs on the decoded 16 kHz int16-range buffer BEFORE any
 * inference, and its job is to keep garbage away from a classifier that will
 * happily score it. The trained model rates a pure sine wave as Asthma at
 * 0.996 confidence; the tonality check below is what stops that reaching a
 * clinician.
 *
 * Pure TypeScript — no browser APIs — so every decision here is testable in
 * Node.
 */

const SAMPLE_RATE = MODEL_REGISTRY[DEFAULT_MODEL_ID].frequencyHz
const { FFT_SIZE, FFT_FRAMES } = TUNABLES

/** Floor added under power bins so the geometric mean stays defined. */
const POWER_EPSILON = 1e-20

/**
 * Mean power spectrum of up to FFT_FRAMES Hann-windowed frames, evenly spaced
 * across the clip. One averaged spectrum feeds flatness, tonality and HF
 * ratio alike, so the three metrics always describe the same picture of the
 * signal. Bin 0 (DC) is excluded by every consumer — the signal is
 * mean-removed before it gets here, so bin 0 carries only window leakage.
 */
function averagePowerSpectrum(signal: Float32Array): Float64Array {
  const bins = FFT_SIZE / 2 + 1
  if (signal.length === 0) return new Float64Array(bins)

  const hann = hannWindow(FFT_SIZE)
  const frameCount =
    signal.length < FFT_SIZE
      ? 1
      : Math.min(FFT_FRAMES, Math.max(1, Math.floor(signal.length / FFT_SIZE)))
  const lastStart = Math.max(0, signal.length - FFT_SIZE)

  const accumulator = new Float64Array(bins)
  const frame = new Float64Array(FFT_SIZE)
  for (let f = 0; f < frameCount; f++) {
    const start = frameCount === 1 ? 0 : Math.round((f * lastStart) / (frameCount - 1))
    for (let i = 0; i < FFT_SIZE; i++) {
      // Shorter-than-one-frame clips are zero-padded here rather than skipped,
      // so the metrics stay finite for a buffer that is about to be rejected
      // as too-short anyway.
      const sample = start + i < signal.length ? signal[start + i] : 0
      frame[i] = sample * hann[i]
    }
    const spectrum = powerSpectrum(frame)
    for (let k = 0; k < bins; k++) accumulator[k] += spectrum[k] / frameCount
  }
  return accumulator
}

/** Wiener entropy: geometric mean / arithmetic mean over the non-DC bins. */
function spectralFlatness(spectrum: Float64Array, total: number): number {
  if (total <= 0) return 0
  const count = spectrum.length - 1
  let sumOfLogs = 0
  for (let k = 1; k < spectrum.length; k++) sumOfLogs += Math.log(spectrum[k] + POWER_EPSILON)
  const geometric = Math.exp(sumOfLogs / count)
  const arithmetic = total / count
  return Math.min(1, geometric / arithmetic)
}

/** Fraction of energy inside the dominant peak's neighbourhood. */
function tonalityRatio(spectrum: Float64Array, total: number): number {
  if (total <= 0) return 0
  let peak = 1
  for (let k = 1; k < spectrum.length; k++) if (spectrum[k] > spectrum[peak]) peak = k
  const from = Math.max(1, peak - TUNABLES.TONAL_BIN_HALF_WIDTH)
  const to = Math.min(spectrum.length - 1, peak + TUNABLES.TONAL_BIN_HALF_WIDTH)
  let band = 0
  for (let k = from; k <= to; k++) band += spectrum[k]
  return Math.min(1, band / total)
}

/** Fraction of energy above HF_CUTOFF_HZ. */
function highFrequencyRatio(spectrum: Float64Array, total: number): number {
  if (total <= 0) return 0
  const binHz = SAMPLE_RATE / FFT_SIZE
  const firstBin = Math.max(1, Math.ceil(TUNABLES.HF_CUTOFF_HZ / binHz))
  let high = 0
  for (let k = firstBin; k < spectrum.length; k++) high += spectrum[k]
  return Math.min(1, high / total)
}

/**
 * All quality metrics for a 16 kHz int16-range buffer, together with the
 * mean-removed signal they were measured on. The caller's buffer is never
 * modified: DC removal works on a copy.
 */
function computeQualityMetrics(pcm16k: Float32Array): {
  metrics: QualityMetrics
  centered: Float32Array
} {
  const length = pcm16k.length
  const durationMs = (length / SAMPLE_RATE) * 1000

  // Clipping is measured on the raw samples — DC removal would move samples
  // off the rail and hide the very thing being looked for.
  let clipped = 0
  let sum = 0
  for (let i = 0; i < length; i++) {
    if (Math.abs(pcm16k[i]) >= TUNABLES.CLIP_LEVEL_ABS) clipped++
    sum += pcm16k[i]
  }
  const clipFraction = length > 0 ? clipped / length : 0
  const mean = length > 0 ? sum / length : 0

  // Every level and spectral metric below is computed on the mean-removed
  // signal, so a DC-biased capture chain cannot inflate RMS or smear the
  // low bins.
  const centered = new Float32Array(length)
  for (let i = 0; i < length; i++) centered[i] = pcm16k[i] - mean

  const spectrum = averagePowerSpectrum(centered)
  let total = 0
  for (let k = 1; k < spectrum.length; k++) total += spectrum[k]

  return {
    metrics: {
      durationMs,
      rmsDbfs: windowRmsDbfs(centered, 0, length),
      clipFraction,
      /** Signed, as a fraction of full scale. */
      dcOffset: mean / INT16_FULL_SCALE,
      spectralFlatness: spectralFlatness(spectrum, total),
      tonalityRatio: tonalityRatio(spectrum, total),
      hfEnergyRatio: highFrequencyRatio(spectrum, total),
    },
    centered,
  }
}

/**
 * The quality report plus the mean-removed buffer every level metric in it was
 * measured on.
 *
 * Downstream per-window level measurements MUST use `centered`, not the raw
 * input. Measuring the clip on one signal and its windows on another is not a
 * cosmetic inconsistency: a DC bias of just 0.18 % of full scale (~58 counts)
 * lifts a digitally silent window's RAW rms to WINDOW_SILENCE_DBFS, which
 * would silently switch quiet-window exclusion off altogether — while
 * DC_OFFSET_WARN (2 %) is an order of magnitude away and only warns. Since the
 * model scores silence as Healthy at 0.988, that would let the silent half of
 * a half-contact recording vote its way to a false "no abnormality".
 */
export interface QualityAnalysis {
  report: QualityReport
  centered: Float32Array
}

export function analyzeQuality(pcm16k: Float32Array): QualityAnalysis {
  const { metrics, centered } = computeQualityMetrics(pcm16k)
  const flags: QualityFlag[] = []

  if (metrics.durationMs < TUNABLES.MIN_DURATION_S * 1000) {
    flags.push({
      code: 'too-short',
      severity: 'reject',
      value: metrics.durationMs,
      threshold: TUNABLES.MIN_DURATION_S * 1000,
    })
  }

  if (metrics.rmsDbfs < TUNABLES.SILENCE_RMS_DBFS) {
    flags.push({
      code: 'silence',
      severity: 'reject',
      value: metrics.rmsDbfs,
      threshold: TUNABLES.SILENCE_RMS_DBFS,
    })
  }

  if (metrics.clipFraction >= TUNABLES.CLIP_FRACTION_REJECT) {
    flags.push({
      code: 'clipping',
      severity: 'reject',
      value: metrics.clipFraction,
      threshold: TUNABLES.CLIP_FRACTION_REJECT,
    })
  } else if (metrics.clipFraction >= TUNABLES.CLIP_FRACTION_WARN) {
    flags.push({
      code: 'clipping-warn',
      severity: 'warn',
      value: metrics.clipFraction,
      threshold: TUNABLES.CLIP_FRACTION_WARN,
    })
  }

  if (Math.abs(metrics.dcOffset) > TUNABLES.DC_OFFSET_WARN) {
    flags.push({
      code: 'dc-offset',
      severity: 'warn',
      value: Math.abs(metrics.dcOffset),
      threshold: TUNABLES.DC_OFFSET_WARN,
    })
  }

  if (metrics.spectralFlatness > TUNABLES.FLATNESS_MAX) {
    flags.push({
      code: 'noise-like',
      severity: 'reject',
      value: metrics.spectralFlatness,
      threshold: TUNABLES.FLATNESS_MAX,
    })
  }

  if (metrics.tonalityRatio > TUNABLES.TONALITY_MAX) {
    flags.push({
      code: 'tonal',
      severity: 'reject',
      value: metrics.tonalityRatio,
      threshold: TUNABLES.TONALITY_MAX,
    })
  }

  if (metrics.hfEnergyRatio > TUNABLES.HF_RATIO_WARN) {
    flags.push({
      code: 'hf-dominant',
      severity: 'warn',
      value: metrics.hfEnergyRatio,
      threshold: TUNABLES.HF_RATIO_WARN,
    })
  }

  return {
    report: { ok: !flags.some((flag) => flag.severity === 'reject'), flags, metrics },
    centered,
  }
}

/**
 * Metrics plus the reject/warn decisions. `ok` is false if and only if at
 * least one flag has severity 'reject'; a false `ok` means inference must not
 * run at all.
 */
export function precheckQuality(pcm16k: Float32Array): QualityReport {
  return analyzeQuality(pcm16k).report
}
