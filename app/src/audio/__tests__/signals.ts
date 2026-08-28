/**
 * Deterministic synthetic test signals, in the module's int16-range float
 * convention (-32768..32767 held in a Float32Array).
 *
 * Not a test file — vitest only collects *.test.ts.
 */
import { INT16_FULL_SCALE } from '../constants'

export const SR = 16000

/** Small LCG. Seeded so every "random" fixture is byte-identical run to run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return (state / 4294967296) * 2 - 1
  }
}

export function sineWave(
  freqHz: number,
  amplitude: number,
  samples: number,
  sampleRate = SR,
): Float32Array {
  const out = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / sampleRate)
  }
  return out
}

export function whiteNoise(amplitude: number, samples: number, seed = 12345): Float32Array {
  const rnd = seededRandom(seed)
  const out = new Float32Array(samples)
  for (let i = 0; i < samples; i++) out[i] = amplitude * rnd()
  return out
}

/** Normalise so the largest |sample| equals `peak`. */
export function normalizePeak(src: Float32Array, peak: number): Float32Array {
  let max = 0
  for (const v of src) max = Math.max(max, Math.abs(v))
  if (max === 0) return Float32Array.from(src)
  return Float32Array.from(src, (v) => (v / max) * peak)
}

/** One-pole low-pass, applied `poles` times. */
export function lowPass(src: Float32Array, a: number, poles: number): Float32Array {
  let signal = Float32Array.from(src)
  for (let p = 0; p < poles; p++) {
    const out = new Float32Array(signal.length)
    let state = 0
    for (let i = 0; i < signal.length; i++) {
      state = a * state + (1 - a) * signal[i]
      out[i] = state
    }
    signal = out
  }
  return signal
}

/**
 * Low-frequency-dominant broadband noise: the stand-in for a real
 * auscultation recording. Spectrally shaped enough to be neither flat
 * (noise-like) nor peaky (tonal), so it passes the quality gate.
 */
export function shapedNoise(samples: number, seed = 12345): Float32Array {
  return normalizePeak(lowPass(whiteNoise(0.2 * INT16_FULL_SCALE, samples, seed), 0.6, 2), 0.5 * INT16_FULL_SCALE)
}

/** Shaped noise heterodyned up to 6 kHz — energy almost entirely above 4 kHz. */
export function highFrequencyNoise(samples: number, seed = 12345): Float32Array {
  const base = shapedNoise(samples, seed)
  return normalizePeak(
    Float32Array.from(base, (v, i) => v * Math.cos((2 * Math.PI * 6000 * i) / SR)),
    0.4 * INT16_FULL_SCALE,
  )
}

/** Force exactly `fraction` of samples to the int16 rails. */
export function injectClipping(src: Float32Array, fraction: number): Float32Array {
  const out = Float32Array.from(src)
  const step = Math.floor(1 / fraction)
  for (let i = 0; i < out.length; i += step) {
    out[i] = i % (2 * step) === 0 ? 32767 : -32768
  }
  return out
}

/** Amplify then hard-limit to the int16 rails. */
export function clipWithGain(src: Float32Array, gain: number): Float32Array {
  return Float32Array.from(src, (v) => Math.max(-32768, Math.min(32767, v * gain)))
}

/** Add a constant offset expressed as a fraction of full scale. */
export function addDcOffset(src: Float32Array, fractionOfFullScale: number): Float32Array {
  const offset = fractionOfFullScale * INT16_FULL_SCALE
  return Float32Array.from(src, (v) => v + offset)
}

/** Round to whole int16 values (what a real recording always is). */
export function quantizeToInt16(src: Float32Array): Int16Array {
  const out = new Int16Array(src.length)
  for (let i = 0; i < src.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(src[i])))
  }
  return out
}
