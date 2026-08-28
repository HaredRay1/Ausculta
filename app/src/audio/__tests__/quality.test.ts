import { describe, expect, it } from 'vitest'
import { precheckQuality } from '../dsp/quality'
import { INT16_FULL_SCALE, TUNABLES } from '../constants'
import type { QualityFlagCode, QualityReport } from '../types'
import {
  SR,
  addDcOffset,
  clipWithGain,
  highFrequencyNoise,
  injectClipping,
  shapedNoise,
  sineWave,
  whiteNoise,
} from './signals'

const FOUR_SECONDS = 4 * SR

const codes = (report: QualityReport): QualityFlagCode[] => report.flags.map((f) => f.code)
const rejects = (report: QualityReport): QualityFlagCode[] =>
  report.flags.filter((f) => f.severity === 'reject').map((f) => f.code)

describe('precheckQuality — reject decisions', () => {
  it('rejects a clip shorter than MIN_DURATION_S as too-short', () => {
    const report = precheckQuality(shapedNoise(2.5 * SR))
    expect(report.ok).toBe(false)
    expect(rejects(report)).toContain('too-short')
    const flag = report.flags.find((f) => f.code === 'too-short')!
    expect(flag.value).toBeCloseTo(2500, 6)
    expect(flag.threshold).toBe(TUNABLES.MIN_DURATION_S * 1000)
  })

  it('accepts a clip of exactly MIN_DURATION_S', () => {
    const report = precheckQuality(shapedNoise(TUNABLES.MIN_DURATION_S * SR))
    expect(codes(report)).not.toContain('too-short')
  })

  it('rejects digital silence', () => {
    const report = precheckQuality(new Float32Array(FOUR_SECONDS))
    expect(report.ok).toBe(false)
    expect(rejects(report)).toContain('silence')
    expect(report.metrics.rmsDbfs).toBe(-120)
  })

  it('rejects near-silence below SILENCE_RMS_DBFS', () => {
    // -60 dBFS shaped noise: audible in theory, nothing on the bell in practice.
    const quiet = Float32Array.from(shapedNoise(FOUR_SECONDS), (v) => v * 0.002)
    const report = precheckQuality(quiet)
    expect(report.metrics.rmsDbfs).toBeLessThan(TUNABLES.SILENCE_RMS_DBFS)
    expect(rejects(report)).toContain('silence')
  })

  it('rejects a pure 440 Hz sine as tonal — the input the model calls Asthma at 0.996', () => {
    const report = precheckQuality(sineWave(440, 0.5 * INT16_FULL_SCALE, FOUR_SECONDS))
    expect(report.ok).toBe(false)
    expect(rejects(report)).toContain('tonal')
    expect(report.metrics.tonalityRatio).toBeGreaterThan(TUNABLES.TONALITY_MAX)
  })

  it('rejects white noise as noise-like', () => {
    const report = precheckQuality(whiteNoise(0.2 * INT16_FULL_SCALE, FOUR_SECONDS))
    expect(report.ok).toBe(false)
    expect(rejects(report)).toContain('noise-like')
    expect(report.metrics.spectralFlatness).toBeGreaterThan(TUNABLES.FLATNESS_MAX)
  })

  it('rejects heavy clipping', () => {
    const report = precheckQuality(injectClipping(shapedNoise(FOUR_SECONDS), 0.02))
    expect(report.ok).toBe(false)
    expect(rejects(report)).toContain('clipping')
    expect(report.metrics.clipFraction).toBeGreaterThanOrEqual(TUNABLES.CLIP_FRACTION_REJECT)
  })

  it('rejects a clipped sine for clipping as well as tonality', () => {
    const report = precheckQuality(
      clipWithGain(sineWave(440, 0.5 * INT16_FULL_SCALE, FOUR_SECONDS), 2.5),
    )
    expect(report.ok).toBe(false)
    expect(rejects(report)).toEqual(expect.arrayContaining(['clipping', 'tonal']))
  })
})

describe('precheckQuality — warn decisions do not block inference', () => {
  it('warns but passes on light clipping', () => {
    const report = precheckQuality(injectClipping(shapedNoise(FOUR_SECONDS), 0.005))
    expect(report.ok).toBe(true)
    expect(codes(report)).toEqual(['clipping-warn'])
    expect(report.flags[0].severity).toBe('warn')
  })

  it('warns but passes on a DC-offset capture chain', () => {
    const report = precheckQuality(addDcOffset(shapedNoise(FOUR_SECONDS), 0.05))
    expect(report.ok).toBe(true)
    expect(codes(report)).toContain('dc-offset')
    expect(Math.abs(report.metrics.dcOffset)).toBeGreaterThan(TUNABLES.DC_OFFSET_WARN)
  })

  it('warns but passes on high-frequency-dominant audio', () => {
    const report = precheckQuality(highFrequencyNoise(FOUR_SECONDS))
    expect(report.ok).toBe(true)
    expect(codes(report)).toContain('hf-dominant')
    expect(report.metrics.hfEnergyRatio).toBeGreaterThan(TUNABLES.HF_RATIO_WARN)
  })
})

describe('precheckQuality — pass', () => {
  it('passes lung-like shaped noise with no flags at all', () => {
    const report = precheckQuality(shapedNoise(FOUR_SECONDS))
    expect(report.ok).toBe(true)
    expect(report.flags).toEqual([])
  })

  it('reports every metric even when nothing is flagged', () => {
    const { metrics } = precheckQuality(shapedNoise(FOUR_SECONDS))
    expect(metrics.durationMs).toBeCloseTo(4000, 6)
    expect(metrics.rmsDbfs).toBeLessThan(0)
    expect(metrics.clipFraction).toBe(0)
    expect(Math.abs(metrics.dcOffset)).toBeLessThan(TUNABLES.DC_OFFSET_WARN)
    expect(metrics.spectralFlatness).toBeGreaterThan(0)
    expect(metrics.spectralFlatness).toBeLessThan(TUNABLES.FLATNESS_MAX)
    expect(metrics.tonalityRatio).toBeGreaterThan(0)
    expect(metrics.hfEnergyRatio).toBeGreaterThanOrEqual(0)
    for (const value of Object.values(metrics)) expect(Number.isFinite(value)).toBe(true)
  })

  it('measures spectral shape after removing DC, so an offset cannot mask it', () => {
    const clean = precheckQuality(shapedNoise(FOUR_SECONDS))
    const offset = precheckQuality(addDcOffset(shapedNoise(FOUR_SECONDS), 0.05))
    expect(offset.metrics.spectralFlatness).toBeCloseTo(clean.metrics.spectralFlatness, 6)
    expect(offset.metrics.tonalityRatio).toBeCloseTo(clean.metrics.tonalityRatio, 6)
    expect(offset.metrics.rmsDbfs).toBeCloseTo(clean.metrics.rmsDbfs, 6)
  })

  it('survives a buffer shorter than one FFT frame without throwing', () => {
    const report = precheckQuality(shapedNoise(512))
    expect(report.ok).toBe(false)
    expect(rejects(report)).toContain('too-short')
    for (const value of Object.values(report.metrics)) expect(Number.isFinite(value)).toBe(true)
  })

  it('survives an empty buffer', () => {
    const report = precheckQuality(new Float32Array(0))
    expect(report.ok).toBe(false)
    expect(rejects(report)).toEqual(expect.arrayContaining(['too-short', 'silence']))
    for (const value of Object.values(report.metrics)) expect(Number.isFinite(value)).toBe(true)
  })

  it('does not mutate the caller’s buffer while removing DC', () => {
    const input = addDcOffset(shapedNoise(FOUR_SECONDS), 0.05)
    const copy = Float32Array.from(input)
    precheckQuality(input)
    expect(input).toEqual(copy)
  })
})
