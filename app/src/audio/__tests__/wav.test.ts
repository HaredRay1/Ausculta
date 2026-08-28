import { describe, expect, it } from 'vitest'
import { WavParseError, isRiffWave, parseWav } from '../decode/wav'
import {
  FLOAT_SUBFORMAT_GUID,
  buildRiff,
  buildWav,
  chunk,
  fmtChunk,
  pcm16Bytes,
} from './wavBuilder'

const MONO = new Int16Array([0, 1, -1, 32767, -32768, 1234, -4321, 7])

function expectWavError(fn: () => unknown, code: string): void {
  let thrown: unknown
  try {
    fn()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(WavParseError)
  expect((thrown as WavParseError).code).toBe(code)
}

describe('parseWav — well-formed files', () => {
  it('reads mono 16-bit PCM as raw int16 values held in floats', () => {
    const wav = parseWav(buildWav(MONO))
    expect(wav.sampleRate).toBe(16000)
    expect(wav.channels).toBe(1)
    expect(wav.bitDepth).toBe(16)
    expect(Array.from(wav.pcm)).toEqual(Array.from(MONO))
  })

  it('reads the sample rate from the header rather than assuming 16 kHz', () => {
    expect(parseWav(buildWav(MONO, { sampleRate: 44100 })).sampleRate).toBe(44100)
    expect(parseWav(buildWav(MONO, { sampleRate: 8000 })).sampleRate).toBe(8000)
  })

  it('mixes stereo down by averaging the channels', () => {
    const stereo = new Int16Array([100, 200, -100, 100, 32767, -32767, 0, 0])
    const wav = parseWav(buildWav(stereo, { channels: 2 }))
    expect(wav.channels).toBe(2)
    expect(Array.from(wav.pcm)).toEqual([150, 0, 0, 0])
  })

  it('accepts WAVE_FORMAT_EXTENSIBLE carrying the PCM subformat GUID', () => {
    const wav = parseWav(buildWav(MONO, { audioFormat: 0xfffe }))
    expect(Array.from(wav.pcm)).toEqual(Array.from(MONO))
  })

  it('skips JUNK and LIST chunks wherever they appear', () => {
    const wav = parseWav(
      buildWav(MONO, {
        extraChunks: [
          chunk('JUNK', new Uint8Array(28)),
          chunk('LIST', new Uint8Array([0x49, 0x4e, 0x46, 0x4f, 1, 2, 3])),
        ],
      }),
    )
    expect(Array.from(wav.pcm)).toEqual(Array.from(MONO))
  })

  it('pads odd-sized chunks so the next chunk header stays aligned', () => {
    const wav = parseWav(buildWav(MONO, { extraChunks: [chunk('JUNK', new Uint8Array(3))] }))
    expect(Array.from(wav.pcm)).toEqual(Array.from(MONO))
  })

  it('handles a data chunk that appears before fmt', () => {
    const wav = parseWav(buildWav(MONO, { dataFirst: true }))
    expect(Array.from(wav.pcm)).toEqual(Array.from(MONO))
  })
})

describe('parseWav — malformed files', () => {
  it('clamps a data size of 0xFFFFFFFF to what the file actually holds', () => {
    const wav = parseWav(buildWav(MONO, { dataSizeOverride: 0xffffffff }))
    expect(Array.from(wav.pcm)).toEqual(Array.from(MONO))
  })

  it('clamps a data size that runs past the end of the file', () => {
    const wav = parseWav(buildWav(MONO, { dataSizeOverride: MONO.length * 2 + 4096 }))
    expect(Array.from(wav.pcm)).toEqual(Array.from(MONO))
  })

  it('drops a trailing partial frame when the file is truncated mid-frame', () => {
    // Full file is 12 (RIFF) + 24 (fmt) + 24 (data) = 60 bytes, so the data
    // payload starts at 44. Cutting to 59 leaves 15 payload bytes: seven whole
    // int16 frames and one orphan byte, which must be dropped rather than read
    // as half a sample.
    const wav = parseWav(buildWav(MONO, { truncateTo: 59 }))
    expect(Array.from(wav.pcm)).toEqual(Array.from(MONO.slice(0, 7)))
  })

  it('drops a partial stereo frame rather than desynchronising the channels', () => {
    const stereo = new Int16Array([100, 200, 300, 400, 500, 600])
    const wav = parseWav(buildWav(stereo, { channels: 2, truncateTo: 12 + 24 + 8 + 10 }))
    expect(Array.from(wav.pcm)).toEqual([150, 350])
  })

  it('rejects a file that is not RIFF at all', () => {
    expectWavError(() => parseWav(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer), 'not-riff')
    expectWavError(() => parseWav(buildRiff({ chunks: [fmtChunk()], riffId: 'RIFX' })), 'not-riff')
  })

  it('rejects a RIFF container that is not WAVE', () => {
    expectWavError(
      () => parseWav(buildRiff({ chunks: [fmtChunk()], riffType: 'AVI ' })),
      'not-riff',
    )
  })

  it('rejects a file with no fmt chunk', () => {
    expectWavError(
      () => parseWav(buildRiff({ chunks: [chunk('data', pcm16Bytes(MONO))] })),
      'missing-fmt',
    )
  })

  it('rejects a file with no data chunk', () => {
    expectWavError(() => parseWav(buildRiff({ chunks: [fmtChunk()] })), 'missing-data')
  })

  it('rejects a data chunk holding less than one frame', () => {
    expectWavError(() => parseWav(buildWav(new Int16Array(0))), 'no-frames')
  })

  it('rejects a fmt chunk too small to hold the format fields', () => {
    expectWavError(
      () =>
        parseWav(
          buildRiff({ chunks: [chunk('fmt ', new Uint8Array(8)), chunk('data', pcm16Bytes(MONO))] }),
        ),
      'missing-fmt',
    )
  })
})

describe('parseWav — unsupported encodings get a typed error, never a guess', () => {
  it('rejects 8-bit PCM', () => {
    expectWavError(() => parseWav(buildWav(MONO, { bitsPerSample: 8 })), 'unsupported-bit-depth')
  })

  it('rejects 24-bit PCM', () => {
    expectWavError(() => parseWav(buildWav(MONO, { bitsPerSample: 24 })), 'unsupported-bit-depth')
  })

  it('rejects 32-bit PCM', () => {
    expectWavError(() => parseWav(buildWav(MONO, { bitsPerSample: 32 })), 'unsupported-bit-depth')
  })

  it('rejects IEEE float WAV', () => {
    expectWavError(
      () => parseWav(buildWav(MONO, { audioFormat: 3, bitsPerSample: 32 })),
      'unsupported-format',
    )
  })

  it('rejects A-law and other compressed WAVs', () => {
    expectWavError(
      () => parseWav(buildWav(MONO, { audioFormat: 6, bitsPerSample: 8 })),
      'unsupported-format',
    )
  })

  it('rejects EXTENSIBLE carrying a non-PCM subformat GUID', () => {
    expectWavError(
      () =>
        parseWav(
          buildWav(MONO, {
            audioFormat: 0xfffe,
            bitsPerSample: 32,
            subFormatGuid: FLOAT_SUBFORMAT_GUID,
          }),
        ),
      'unsupported-format',
    )
  })

  it('names the actual bit depth in the message so the user can act on it', () => {
    expect(() => parseWav(buildWav(MONO, { bitsPerSample: 24 }))).toThrow(/24/)
  })

  it('rejects a file declaring zero channels', () => {
    expectWavError(() => parseWav(buildWav(MONO, { channels: 0 })), 'unsupported-format')
  })
})

describe('isRiffWave', () => {
  it('recognises a WAVE container', () => {
    expect(isRiffWave(buildWav(MONO))).toBe(true)
  })

  it('rejects anything else, including buffers too short to check', () => {
    expect(isRiffWave(new ArrayBuffer(4))).toBe(false)
    expect(isRiffWave(buildRiff({ chunks: [fmtChunk()], riffType: 'AVI ' }))).toBe(false)
    expect(isRiffWave(new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]).buffer)).toBe(
      false,
    )
  })
})
