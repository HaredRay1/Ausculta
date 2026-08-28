import { DEFAULT_MODEL_ID, INT16_FULL_SCALE, MODEL_REGISTRY, TUNABLES } from '../constants'
import { resampleTo16k } from './resample'
import { isRiffWave, parseWav } from './wav'

const TARGET_RATE = MODEL_REGISTRY[DEFAULT_MODEL_ID].frequencyHz

export type DecodeErrorCode = 'empty' | 'too-long' | 'decode-failed'

export class DecodeError extends Error {
  readonly code: DecodeErrorCode
  constructor(code: DecodeErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DecodeError'
    this.code = code
  }
}

export interface DecodedAudio {
  /** Mono, 16 kHz, int16-range values held as floats. */
  pcm16k: Float32Array
  /** Sample rate of the source material, before any resampling. */
  originalSampleRate: number
  durationMs: number
}

/**
 * THE ONE PLACE where Web Audio's -1..1 float convention becomes this
 * module's int16-range convention.
 *
 * The Edge Impulse impulse was trained on raw int16 PCM values, so its DSP
 * block expects features spanning roughly -32768..32767. Handing it -1..1
 * floats does not fail loudly — it produces confident, meaningless
 * classifications. Every other file in this module therefore assumes
 * int16 range and never scales; wav.ts emits int16 values directly, and the
 * ÷/× pair inside resample.ts is a lossless round trip, not a second scaling
 * site. If you find yourself writing `* 32768` anywhere else, you have a bug.
 */
export function scaleUnitFloatsToInt16Range(unit: Float32Array): Float32Array {
  const out = new Float32Array(unit.length)
  for (let i = 0; i < unit.length; i++) out[i] = unit[i] * INT16_FULL_SCALE
  return out
}

function assertWithinMaxDuration(seconds: number): void {
  if (seconds > TUNABLES.MAX_DURATION_S) {
    throw new DecodeError(
      'too-long',
      `Recording is ${seconds.toFixed(1)} s; the maximum is ${TUNABLES.MAX_DURATION_S} s`,
    )
  }
}

type AudioContextCtor = typeof AudioContext

function getAudioContext(): AudioContextCtor | null {
  return (
    (globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor })
      .AudioContext ??
    (globalThis as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
    null
  )
}

/** Average all channels of a decoded AudioBuffer into one -1..1 track. */
function mixdownToMono(audioBuffer: AudioBuffer): Float32Array {
  const frames = audioBuffer.length
  const channels = audioBuffer.numberOfChannels
  const mono = new Float32Array(frames)
  for (let channel = 0; channel < channels; channel++) {
    const data = audioBuffer.getChannelData(channel)
    for (let i = 0; i < frames; i++) mono[i] += data[i]
  }
  if (channels > 1) for (let i = 0; i < frames; i++) mono[i] /= channels
  return mono
}

/**
 * `Blob.prototype.arrayBuffer` is missing on older Android WebViews and on
 * Safari before 14 — both of which are in this app's target range — and also
 * on jsdom, which is what lets the whole file pipeline be tested in Node.
 */
function readArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file'))
    reader.readAsArrayBuffer(file)
  })
}

async function decodeWithBrowserCodec(buffer: ArrayBuffer): Promise<DecodedAudio> {
  const Ctor = getAudioContext()
  if (!Ctor) {
    throw new DecodeError(
      'decode-failed',
      'This environment has no Web Audio decoder for compressed audio',
    )
  }
  const context = new Ctor()
  try {
    const audioBuffer = await context.decodeAudioData(buffer)
    // The compressed path can only be length-checked once decoded — there is
    // no cheap, format-independent way to know a container's duration first.
    assertWithinMaxDuration(audioBuffer.duration)
    const scaled = scaleUnitFloatsToInt16Range(mixdownToMono(audioBuffer))
    const pcm16k = await resampleTo16k(scaled, audioBuffer.sampleRate)
    return {
      pcm16k,
      originalSampleRate: audioBuffer.sampleRate,
      durationMs: (pcm16k.length / TARGET_RATE) * 1000,
    }
  } finally {
    void context.close?.()
  }
}

/**
 * File/Blob → mono 16 kHz int16-range PCM.
 *
 * WAV is parsed in-process (see wav.ts) so device recordings never touch the
 * browser codec; anything else falls back to `decodeAudioData` at its native
 * rate, is mixed down, scaled once, and then resampled.
 */
export async function decodeToPcm16k(file: File | Blob): Promise<DecodedAudio> {
  const buffer = await readArrayBuffer(file)
  if (buffer.byteLength === 0) {
    throw new DecodeError('empty', 'The selected file is empty')
  }

  let wavError: unknown = null
  if (isRiffWave(buffer)) {
    try {
      const wav = parseWav(buffer)
      assertWithinMaxDuration(wav.pcm.length / wav.sampleRate)
      const pcm16k = await resampleTo16k(wav.pcm, wav.sampleRate)
      return {
        pcm16k,
        originalSampleRate: wav.sampleRate,
        durationMs: (pcm16k.length / TARGET_RATE) * 1000,
      }
    } catch (error) {
      if (error instanceof DecodeError) throw error
      // A WAV we could not read may still be one the browser can decode (24-bit,
      // float, ADPCM). Remember why we refused it, in case the codec fails too.
      wavError = error
    }
  }

  try {
    return await decodeWithBrowserCodec(buffer)
  } catch (error) {
    if (error instanceof DecodeError && error.code === 'too-long') throw error
    // Prefer the WAV parser's diagnosis: "this file is 24-bit" is actionable,
    // "decodeAudioData failed" is not.
    if (wavError) throw wavError
    throw new DecodeError('decode-failed', 'Could not decode this audio file', { cause: error })
  }
}

/**
 * Buffer → mono 16 kHz int16-range PCM, for callers that already hold samples.
 * `pcm` must already be in int16 range (-32768..32767).
 */
export async function decodeFromBuffer(
  pcm: Float32Array,
  sampleRate: number,
): Promise<DecodedAudio> {
  if (pcm.length === 0) throw new DecodeError('empty', 'The supplied audio buffer is empty')
  assertWithinMaxDuration(pcm.length / sampleRate)
  const pcm16k = await resampleTo16k(pcm, sampleRate)
  return {
    pcm16k,
    originalSampleRate: sampleRate,
    durationMs: (pcm16k.length / TARGET_RATE) * 1000,
  }
}
