import { describe, expect, it } from 'vitest'
import { fft, powerSpectrum } from '../dsp/fft'

/**
 * The FFT is checked against DFT values that can be worked out by hand, not
 * against another FFT implementation — an agreeing pair of wrong transforms
 * would sail through the quality gate tests downstream.
 */
describe('fft', () => {
  it('transforms a unit impulse at n=0 into a flat spectrum of ones', () => {
    const n = 16
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    re[0] = 1

    fft(re, im)

    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(1, 12)
      expect(im[k]).toBeCloseTo(0, 12)
    }
  })

  it('transforms DC into all energy in bin 0', () => {
    const n = 8
    const re = new Float64Array(n).fill(1)
    const im = new Float64Array(n)

    fft(re, im)

    expect(re[0]).toBeCloseTo(n, 12)
    expect(im[0]).toBeCloseTo(0, 12)
    for (let k = 1; k < n; k++) {
      expect(re[k]).toBeCloseTo(0, 12)
      expect(im[k]).toBeCloseTo(0, 12)
    }
  })

  it('puts a bin-aligned cosine entirely in that bin, with amplitude N/2', () => {
    const n = 32
    const k0 = 5
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * k0 * i) / n)

    fft(re, im)

    expect(re[k0]).toBeCloseTo(n / 2, 10)
    expect(im[k0]).toBeCloseTo(0, 10)
    // Mirror bin (negative frequency) carries the conjugate half.
    expect(re[n - k0]).toBeCloseTo(n / 2, 10)
    for (let k = 0; k < n; k++) {
      if (k === k0 || k === n - k0) continue
      expect(Math.hypot(re[k], im[k])).toBeCloseTo(0, 10)
    }
  })

  it('puts a bin-aligned sine in the imaginary part with amplitude -N/2', () => {
    const n = 32
    const k0 = 3
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * k0 * i) / n)

    fft(re, im)

    expect(re[k0]).toBeCloseTo(0, 10)
    expect(im[k0]).toBeCloseTo(-n / 2, 10)
  })

  it('rejects a length that is not a power of two', () => {
    expect(() => fft(new Float64Array(12), new Float64Array(12))).toThrow(/power of two/i)
  })

  it('rejects mismatched real and imaginary lengths', () => {
    expect(() => fft(new Float64Array(8), new Float64Array(16))).toThrow(/same length/i)
  })
})

describe('powerSpectrum', () => {
  it('returns N/2 + 1 bins', () => {
    expect(powerSpectrum(new Float64Array(64)).length).toBe(33)
  })

  it('reports |X[k]|^2 for a bin-aligned sine', () => {
    const n = 64
    const k0 = 9
    const x = new Float64Array(n)
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * k0 * i) / n)

    const p = powerSpectrum(x)

    expect(p[k0]).toBeCloseTo((n / 2) ** 2, 6)
    for (let k = 0; k < p.length; k++) {
      if (k === k0) continue
      expect(p[k]).toBeCloseTo(0, 6)
    }
  })

  it('reports a flat spectrum for a unit impulse', () => {
    const x = new Float64Array(32)
    x[0] = 1
    const p = powerSpectrum(x)
    for (const v of p) expect(v).toBeCloseTo(1, 12)
  })
})
