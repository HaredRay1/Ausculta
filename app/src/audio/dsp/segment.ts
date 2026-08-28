import { DBFS_FLOOR, DEFAULT_MODEL_ID, INT16_FULL_SCALE, MODEL_REGISTRY, TUNABLES } from '../constants'

/** One inference window's position in the clip. */
export interface Segment {
  index: number
  startSample: number
  /** Exclusive. Always exactly `windowSamples` past `startSample`. */
  endSample: number
  startMs: number
  endMs: number
}

export interface SegmentOptions {
  windowSamples?: number
  strideSamples?: number
  sampleRate?: number
}

const DEFAULT_MODEL = MODEL_REGISTRY[DEFAULT_MODEL_ID]

/**
 * Windows of exactly `windowSamples`, hopping by `strideSamples`.
 *
 * A trailing partial window is DROPPED, never zero-padded: padding silence
 * onto the end of a real recording produces a window the model has never seen
 * in training and scores arbitrarily, and that score would then vote.
 */
export function planSegments(totalSamples: number, options: SegmentOptions = {}): Segment[] {
  const sampleRate = options.sampleRate ?? DEFAULT_MODEL.frequencyHz
  const windowSamples = options.windowSamples ?? DEFAULT_MODEL.windowSamples
  const strideSamples =
    options.strideSamples ?? Math.round((TUNABLES.STRIDE_MS / 1000) * sampleRate)

  if (windowSamples <= 0 || strideSamples <= 0) {
    throw new Error('planSegments: window and stride must be positive')
  }

  const segments: Segment[] = []
  for (
    let start = 0, index = 0;
    start + windowSamples <= totalSamples;
    start += strideSamples, index++
  ) {
    segments.push({
      index,
      startSample: start,
      endSample: start + windowSamples,
      startMs: (start / sampleRate) * 1000,
      endMs: ((start + windowSamples) / sampleRate) * 1000,
    })
  }
  return segments
}

/**
 * RMS of `pcm[start, end)` in dBFS, where 0 dBFS is a full-scale int16
 * signal. Digital silence is floored at DBFS_FLOOR so the value stays finite
 * and JSON-serialisable.
 */
export function windowRmsDbfs(pcm: Float32Array, start: number, end: number): number {
  let sum = 0
  for (let i = start; i < end; i++) sum += pcm[i] * pcm[i]
  const count = end - start
  if (count <= 0) return DBFS_FLOOR
  const rms = Math.sqrt(sum / count)
  if (rms <= 0) return DBFS_FLOOR
  return Math.max(DBFS_FLOOR, 20 * Math.log10(rms / INT16_FULL_SCALE))
}
