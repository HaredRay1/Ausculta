import { DEFAULT_MODEL_ID, MODEL_REGISTRY } from '../constants'

const TARGET_RATE = MODEL_REGISTRY[DEFAULT_MODEL_ID].frequencyHz
const HEADER_BYTES = 44

/**
 * Canonical 44-byte-header 16-bit mono WAV. Written so that whatever the app
 * stores and later replays is the exact buffer that was classified, rather
 * than a re-encode of the original upload.
 */
export function encodeWavBuffer(pcm16k: Int16Array, sampleRate = TARGET_RATE): ArrayBuffer {
  const dataBytes = pcm16k.length * 2
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')

  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk size
  view.setUint16(20, 1, true) // WAVE_FORMAT_PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample

  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)
  for (let i = 0; i < pcm16k.length; i++) {
    view.setInt16(HEADER_BYTES + i * 2, pcm16k[i], true)
  }

  return buffer
}

export function encodeWav(pcm16k: Int16Array, sampleRate = TARGET_RATE): Blob {
  return new Blob([encodeWavBuffer(pcm16k, sampleRate)], { type: 'audio/wav' })
}

/** Round an int16-range float buffer to the Int16Array the app stores. */
export function toInt16(pcm: Float32Array): Int16Array {
  const out = new Int16Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i])))
  }
  return out
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}
