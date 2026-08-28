import { DEFAULT_MODEL_ID, INT16_FULL_SCALE, MODEL_REGISTRY } from '../constants'

const TARGET_RATE = MODEL_REGISTRY[DEFAULT_MODEL_ID].frequencyHz

type OfflineAudioContextCtor = typeof OfflineAudioContext

function getOfflineAudioContext(): OfflineAudioContextCtor {
  const ctor = (globalThis as { OfflineAudioContext?: OfflineAudioContextCtor })
    .OfflineAudioContext
  if (!ctor) {
    throw new Error(
      'Resampling to 16 kHz requires OfflineAudioContext, which this environment does not provide',
    )
  }
  return ctor
}

/**
 * Resample an int16-range mono buffer to the model's 16 kHz.
 *
 * The browser's own sample-rate converter is used rather than a hand-rolled
 * one: it is band-limited, and a naive interpolator would fold aliases into
 * the 0-4 kHz band the classifier actually looks at.
 *
 * NOTE ON THE ÷32768 / ×32768 PAIR BELOW: it is a lossless round trip, not a
 * scaling decision. AudioBuffer channels are defined over -1..1, so the data
 * is divided on the way in and multiplied back on the way out; both factors
 * are the same power of two, so float32 values survive exactly. The module's
 * single *scaling decision* — turning Web Audio floats into int16 range —
 * lives in decode.ts and nowhere else.
 *
 * A 16 kHz input short-circuits and the caller's array is returned as-is.
 */
export async function resampleTo16k(
  pcmInt16Range: Float32Array,
  fromRate: number,
): Promise<Float32Array> {
  if (fromRate === TARGET_RATE) return pcmInt16Range
  if (fromRate < 1) throw new Error(`Cannot resample from a sample rate of ${fromRate}`)
  if (pcmInt16Range.length === 0) return pcmInt16Range

  const OfflineCtx = getOfflineAudioContext()
  const targetLength = Math.ceil((pcmInt16Range.length * TARGET_RATE) / fromRate)
  const context = new OfflineCtx(1, targetLength, TARGET_RATE)

  const source = context.createBuffer(1, pcmInt16Range.length, fromRate)
  const channel = source.getChannelData(0)
  for (let i = 0; i < pcmInt16Range.length; i++) channel[i] = pcmInt16Range[i] / INT16_FULL_SCALE

  const node = context.createBufferSource()
  node.buffer = source
  node.connect(context.destination)
  node.start()

  const rendered = await context.startRendering()
  const out = new Float32Array(rendered.length)
  rendered.copyFromChannel(out, 0)
  for (let i = 0; i < out.length; i++) out[i] *= INT16_FULL_SCALE
  return out
}
