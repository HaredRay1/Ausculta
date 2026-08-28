/**
 * Self-contained iterative radix-2 Cooley-Tukey FFT.
 *
 * Deliberately dependency-free and browser-API-free so the quality gate can
 * be exercised in Node. Twiddle factors are evaluated directly rather than
 * accumulated recurrently: the quality gate compares geometric against
 * arithmetic means, where accumulated phase error in the small bins shows up
 * as a biased flatness score.
 */

/** In-place complex FFT. `re`/`im` must be the same power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  if (im.length !== n) {
    throw new Error('fft: real and imaginary parts must have the same length')
  }
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error(`fft: length must be a power of two, got ${n}`)
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    for (let k = 0; k < half; k++) {
      const angle = (-2 * Math.PI * k) / len
      const wr = Math.cos(angle)
      const wi = Math.sin(angle)
      for (let base = 0; base < n; base += len) {
        const a = base + k
        const b = a + half
        const vr = re[b] * wr - im[b] * wi
        const vi = re[b] * wi + im[b] * wr
        re[b] = re[a] - vr
        im[b] = im[a] - vi
        re[a] += vr
        im[a] += vi
      }
    }
  }
}

/**
 * One-sided power spectrum |X[k]|² of a real signal, length N/2 + 1
 * (DC through Nyquist inclusive). The input is not modified.
 */
export function powerSpectrum(samples: ArrayLike<number>): Float64Array {
  const n = samples.length
  const re = new Float64Array(n)
  for (let i = 0; i < n; i++) re[i] = samples[i]
  const im = new Float64Array(n)
  fft(re, im)

  const bins = new Float64Array(n / 2 + 1)
  for (let k = 0; k < bins.length; k++) bins[k] = re[k] * re[k] + im[k] * im[k]
  return bins
}

/** Periodic Hann window of the given length, cached per length. */
const hannCache = new Map<number, Float64Array>()
export function hannWindow(length: number): Float64Array {
  const cached = hannCache.get(length)
  if (cached) return cached
  const w = new Float64Array(length)
  for (let i = 0; i < length; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / length))
  hannCache.set(length, w)
  return w
}
