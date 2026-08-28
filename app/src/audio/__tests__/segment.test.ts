import { describe, expect, it } from 'vitest'
import { planSegments, windowRmsDbfs } from '../dsp/segment'
import { INT16_FULL_SCALE, MODEL_REGISTRY, TUNABLES } from '../constants'

const SR = 16000
const WINDOW = MODEL_REGISTRY['ei-disease-v5'].windowSamples
const STRIDE = (TUNABLES.STRIDE_MS / 1000) * SR

describe('planSegments', () => {
  it('yields 8 windows for 4.9 s at a 500 ms stride', () => {
    expect(planSegments(4.9 * SR).length).toBe(8)
  })

  it('yields 5 windows for exactly 3.0 s', () => {
    expect(planSegments(3.0 * SR).length).toBe(5)
  })

  it('yields no windows for audio shorter than one window', () => {
    expect(planSegments(0.999 * SR).length).toBe(0)
    expect(planSegments(0).length).toBe(0)
  })

  it('yields exactly one window for exactly one window of audio', () => {
    expect(planSegments(WINDOW).length).toBe(1)
  })

  it('drops the trailing partial window rather than zero-padding it', () => {
    // 4.9 s: the 9th window would start at 64000 and need samples up to
    // 80000, but only 78400 exist. It must not appear.
    const segments = planSegments(4.9 * SR)
    const last = segments[segments.length - 1]
    expect(last.endSample).toBeLessThanOrEqual(4.9 * SR)
    expect(last.startSample).toBe(7 * STRIDE)
  })

  it('spaces windows by the stride and sizes them to exactly one window', () => {
    const segments = planSegments(5 * SR)
    segments.forEach((segment, i) => {
      expect(segment.index).toBe(i)
      expect(segment.startSample).toBe(i * STRIDE)
      expect(segment.endSample - segment.startSample).toBe(WINDOW)
    })
  })

  it('reports window bounds in milliseconds', () => {
    const [first, second] = planSegments(5 * SR)
    expect(first.startMs).toBe(0)
    expect(first.endMs).toBe(1000)
    expect(second.startMs).toBe(500)
    expect(second.endMs).toBe(1500)
  })

  it('honours an explicit window and stride', () => {
    const segments = planSegments(1000, { windowSamples: 400, strideSamples: 200 })
    expect(segments.map((s) => s.startSample)).toEqual([0, 200, 400, 600])
  })
})

describe('windowRmsDbfs', () => {
  it('reports 0 dBFS for a full-scale square wave', () => {
    const pcm = new Float32Array(1000)
    for (let i = 0; i < pcm.length; i++) pcm[i] = i % 2 === 0 ? INT16_FULL_SCALE : -INT16_FULL_SCALE
    expect(windowRmsDbfs(pcm, 0, pcm.length)).toBeCloseTo(0, 6)
  })

  it('reports -6 dBFS for a half-scale square wave', () => {
    const pcm = new Float32Array(1000)
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = i % 2 === 0 ? INT16_FULL_SCALE / 2 : -INT16_FULL_SCALE / 2
    }
    expect(windowRmsDbfs(pcm, 0, pcm.length)).toBeCloseTo(-6.0206, 3)
  })

  it('floors digital silence instead of returning -Infinity', () => {
    expect(windowRmsDbfs(new Float32Array(100), 0, 100)).toBe(-120)
  })

  it('measures only the requested slice', () => {
    const pcm = new Float32Array(200)
    pcm.fill(INT16_FULL_SCALE, 100, 200)
    expect(windowRmsDbfs(pcm, 0, 100)).toBe(-120)
    expect(windowRmsDbfs(pcm, 100, 200)).toBeCloseTo(0, 6)
  })
})
