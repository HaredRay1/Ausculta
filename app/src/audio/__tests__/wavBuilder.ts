/**
 * Synthetic RIFF/WAVE builder for the parser tests. Deliberately able to
 * produce malformed files — lying chunk sizes, junk chunks, out-of-order
 * chunks, truncation — because those are exactly the cases the parser has to
 * survive when an SD card from the ESP32 is pulled mid-write.
 *
 * Not a test file — vitest only collects *.test.ts.
 */

/** WAVE_FORMAT_PCM subformat GUID used inside a WAVE_FORMAT_EXTENSIBLE fmt. */
export const PCM_SUBFORMAT_GUID = new Uint8Array([
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
])

/** WAVE_FORMAT_IEEE_FLOAT subformat GUID — valid EXTENSIBLE, wrong payload. */
export const FLOAT_SUBFORMAT_GUID = new Uint8Array([
  0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
])

export interface Chunk {
  id: string
  bytes: Uint8Array
  /** Written into the header instead of `bytes.length`, to fake a size. */
  declaredSize?: number
}

export function chunk(id: string, bytes: Uint8Array, declaredSize?: number): Chunk {
  return { id, bytes, declaredSize }
}

export interface FmtOptions {
  audioFormat?: number
  channels?: number
  sampleRate?: number
  bitsPerSample?: number
  subFormatGuid?: Uint8Array
}

export function fmtChunk(options: FmtOptions = {}): Chunk {
  const audioFormat = options.audioFormat ?? 1
  const channels = options.channels ?? 1
  const sampleRate = options.sampleRate ?? 16000
  const bitsPerSample = options.bitsPerSample ?? 16
  const extensible = audioFormat === 0xfffe
  const size = extensible ? 40 : 16

  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  const blockAlign = (channels * bitsPerSample) / 8
  view.setUint16(0, audioFormat, true)
  view.setUint16(2, channels, true)
  view.setUint32(4, sampleRate, true)
  view.setUint32(8, sampleRate * blockAlign, true)
  view.setUint16(12, blockAlign, true)
  view.setUint16(14, bitsPerSample, true)
  if (extensible) {
    view.setUint16(16, 22, true) // cbSize
    view.setUint16(18, bitsPerSample, true) // validBitsPerSample
    view.setUint32(20, channels === 1 ? 0x4 : 0x3, true) // channel mask
    bytes.set(options.subFormatGuid ?? PCM_SUBFORMAT_GUID, 24)
  }
  return { id: 'fmt ', bytes }
}

/** Interleaved int16 frames as little-endian bytes. */
export function pcm16Bytes(interleaved: Int16Array): Uint8Array {
  const bytes = new Uint8Array(interleaved.length * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < interleaved.length; i++) view.setInt16(i * 2, interleaved[i], true)
  return bytes
}

export interface BuildOptions {
  chunks: Chunk[]
  riffType?: string
  riffId?: string
  /** Cut the finished file down to this many bytes. */
  truncateTo?: number
}

export function buildRiff({ chunks, riffType = 'WAVE', riffId = 'RIFF', truncateTo }: BuildOptions): ArrayBuffer {
  let bodyLength = 0
  for (const c of chunks) bodyLength += 8 + c.bytes.length + (c.bytes.length % 2)

  const total = 12 + bodyLength
  const buffer = new ArrayBuffer(total)
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  writeAscii(bytes, 0, riffId)
  view.setUint32(4, total - 8, true)
  writeAscii(bytes, 8, riffType)

  let offset = 12
  for (const c of chunks) {
    writeAscii(bytes, offset, c.id)
    view.setUint32(offset + 4, c.declaredSize ?? c.bytes.length, true)
    bytes.set(c.bytes, offset + 8)
    offset += 8 + c.bytes.length + (c.bytes.length % 2)
  }

  return truncateTo === undefined ? buffer : buffer.slice(0, truncateTo)
}

/** The common case: a well-formed 16-bit PCM WAVE. */
export function buildWav(
  interleaved: Int16Array,
  options: FmtOptions & { extraChunks?: Chunk[]; dataFirst?: boolean; dataSizeOverride?: number; truncateTo?: number } = {},
): ArrayBuffer {
  const fmt = fmtChunk(options)
  const data = chunk('data', pcm16Bytes(interleaved), options.dataSizeOverride)
  const extra = options.extraChunks ?? []
  return buildRiff({
    chunks: options.dataFirst ? [...extra, data, fmt] : [...extra, fmt, data],
    truncateTo: options.truncateTo,
  })
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
}
