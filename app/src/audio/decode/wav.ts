/**
 * RIFF/WAVE reader for the files the ESP32 stethoscope writes to its SD card
 * and for imported WAVs.
 *
 * Pure TypeScript over a DataView — no browser decode path — because the
 * device's own recordings must parse identically in Node tests and in the
 * PWA, and because `decodeAudioData` silently resamples and normalises, which
 * would destroy the int16-range invariant this module depends on.
 *
 * Output convention: Float32Array holding raw int16 values (-32768..32767),
 * never Web Audio's -1..1. Nothing is scaled here.
 */

export type WavErrorCode =
  | 'not-riff'
  | 'missing-fmt'
  | 'missing-data'
  | 'no-frames'
  | 'unsupported-format'
  | 'unsupported-bit-depth'

export class WavParseError extends Error {
  readonly code: WavErrorCode
  constructor(code: WavErrorCode, message: string) {
    super(message)
    this.name = 'WavParseError'
    this.code = code
  }
}

export interface WavAudio {
  /** Mono, int16-range values held as floats. */
  pcm: Float32Array
  sampleRate: number
  /** Channel count of the source file (the pcm above is always mono). */
  channels: number
  bitDepth: number
}

const FORMAT_PCM = 0x0001
const FORMAT_EXTENSIBLE = 0xfffe
/** KSDATAFORMAT_SUBTYPE_PCM, little-endian byte order as stored in the file. */
const PCM_SUBFORMAT_GUID = [
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
]
const MAX_CHANNELS = 32
/** The only depth this module reads. See the typed error below. */
const SUPPORTED_BIT_DEPTH = 16
const BYTES_PER_SAMPLE = SUPPORTED_BIT_DEPTH / 8
/** Smallest fmt chunk that still holds every field parseWav reads. */
const MIN_FMT_SIZE = 16
/** fmt size a WAVE_FORMAT_EXTENSIBLE chunk needs to carry its subformat GUID. */
const EXTENSIBLE_FMT_SIZE = 40
/** Offset of the subformat GUID inside an EXTENSIBLE fmt chunk. */
const SUBFORMAT_GUID_OFFSET = 24

function readFourCC(view: DataView, offset: number): string {
  return (
    String.fromCharCode(view.getUint8(offset)) +
    String.fromCharCode(view.getUint8(offset + 1)) +
    String.fromCharCode(view.getUint8(offset + 2)) +
    String.fromCharCode(view.getUint8(offset + 3))
  )
}

/** Cheap sniff used by decode.ts to choose the parser over the browser codec. */
export function isRiffWave(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false
  const view = new DataView(buffer)
  return readFourCC(view, 0) === 'RIFF' && readFourCC(view, 8) === 'WAVE'
}

export function parseWav(buffer: ArrayBuffer): WavAudio {
  if (!isRiffWave(buffer)) {
    throw new WavParseError('not-riff', 'Not a RIFF/WAVE file')
  }
  const view = new DataView(buffer)
  const end = buffer.byteLength

  // Walk the chunk list rather than assuming fmt-then-data at fixed offsets:
  // real writers emit LIST/JUNK/fact chunks, and some emit data before fmt.
  let fmtOffset = -1
  let fmtSize = 0
  let dataOffset = -1
  let dataSize = 0
  for (let offset = 12; offset + 8 <= end; ) {
    const id = readFourCC(view, offset)
    const declaredSize = view.getUint32(offset + 4, true)
    const payload = offset + 8
    if (id === 'fmt ' && fmtOffset < 0) {
      fmtOffset = payload
      fmtSize = Math.min(declaredSize, end - payload)
    } else if (id === 'data' && dataOffset < 0) {
      dataOffset = payload
      // A size of 0xFFFFFFFF (streamed/unfinalised writer) or any size running
      // past EOF (interrupted write, truncated copy) is clamped to what the
      // file actually holds instead of being trusted.
      dataSize = Math.min(declaredSize, end - payload)
    }
    // Chunks are word-aligned: an odd size carries a pad byte.
    offset = payload + declaredSize + (declaredSize % 2)
  }

  if (fmtOffset < 0 || fmtSize < MIN_FMT_SIZE) {
    throw new WavParseError('missing-fmt', 'WAVE file has no usable fmt chunk')
  }

  const audioFormat = view.getUint16(fmtOffset, true)
  const channels = view.getUint16(fmtOffset + 2, true)
  const sampleRate = view.getUint32(fmtOffset + 4, true)
  const bitsPerSample = view.getUint16(fmtOffset + 14, true)

  if (audioFormat === FORMAT_EXTENSIBLE) {
    if (fmtSize < EXTENSIBLE_FMT_SIZE) {
      throw new WavParseError(
        'unsupported-format',
        'WAVE_FORMAT_EXTENSIBLE fmt chunk is too small to hold a subformat GUID',
      )
    }
    for (let i = 0; i < PCM_SUBFORMAT_GUID.length; i++) {
      if (view.getUint8(fmtOffset + SUBFORMAT_GUID_OFFSET + i) !== PCM_SUBFORMAT_GUID[i]) {
        throw new WavParseError(
          'unsupported-format',
          'WAVE_FORMAT_EXTENSIBLE file is not linear PCM',
        )
      }
    }
  } else if (audioFormat !== FORMAT_PCM) {
    throw new WavParseError(
      'unsupported-format',
      `Unsupported WAVE audio format 0x${audioFormat.toString(16)}; only uncompressed PCM is supported`,
    )
  }

  if (channels < 1 || channels > MAX_CHANNELS) {
    throw new WavParseError('unsupported-format', `Unsupported channel count ${channels}`)
  }
  if (sampleRate < 1) {
    throw new WavParseError('unsupported-format', 'WAVE file declares a zero sample rate')
  }
  if (bitsPerSample !== SUPPORTED_BIT_DEPTH) {
    throw new WavParseError(
      'unsupported-bit-depth',
      `Unsupported bit depth ${bitsPerSample}; this device records 16-bit PCM`,
    )
  }

  if (dataOffset < 0) {
    throw new WavParseError('missing-data', 'WAVE file has no data chunk')
  }

  const blockAlign = channels * BYTES_PER_SAMPLE
  const frames = Math.floor(dataSize / blockAlign)
  if (frames < 1) {
    throw new WavParseError('no-frames', 'WAVE data chunk holds no complete audio frames')
  }

  const pcm = new Float32Array(frames)
  for (let frame = 0; frame < frames; frame++) {
    const base = dataOffset + frame * blockAlign
    let sum = 0
    for (let channel = 0; channel < channels; channel++) {
      sum += view.getInt16(base + channel * BYTES_PER_SAMPLE, true)
    }
    pcm[frame] = sum / channels
  }

  return { pcm, sampleRate, channels, bitDepth: bitsPerSample }
}
