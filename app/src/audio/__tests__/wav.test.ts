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

describe('parseWav — real ESP32 device files', () => {
  /**
   * The exact 44 bytes the firmware writes, transcribed from a verified
   * device-produced 1.000 s recording. Pinned literally rather than rebuilt by
   * the test helper so that a change in either writer or parser has to be
   * noticed here.
   */
  const DEVICE_HEADER = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x7d, 0x00, 0x00, // "RIFF", riffSize 32036
    0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20, // "WAVE", "fmt "
    0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, // fmtSize 16, PCM, 1 channel
    0x80, 0x3e, 0x00, 0x00, 0x00, 0x7d, 0x00, 0x00, // 16000 Hz, 32000 byte/s
    0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, // blockAlign 2, 16-bit, "data"
    0x00, 0x7d, 0x00, 0x00, //                         dataSize 32000
  ])

  /** One second of device audio: 16000 frames, i * 16 as the firmware's gain. */
  const deviceSamples = Int16Array.from({ length: 16000 }, (_, i) => ((i % 2048) - 1024) * 16)

  function buildDeviceFile(dataSizeOverride?: number): ArrayBuffer {
    const file = new Uint8Array(DEVICE_HEADER.length + deviceSamples.length * 2)
    file.set(DEVICE_HEADER, 0)
    const view = new DataView(file.buffer)
    for (let i = 0; i < deviceSamples.length; i++) {
      view.setInt16(DEVICE_HEADER.length + i * 2, deviceSamples[i], true)
    }
    if (dataSizeOverride !== undefined) view.setUint32(40, dataSizeOverride, true)
    return file.buffer
  }

  it('reads the canonical device header exactly as written', () => {
    const file = buildDeviceFile()
    expect(file.byteLength).toBe(32044)

    const wav = parseWav(file)

    expect(wav.sampleRate).toBe(16000)
    expect(wav.channels).toBe(1)
    expect(wav.bitDepth).toBe(16)
    expect(wav.pcm.length).toBe(16000)
    expect(Array.from(wav.pcm)).toEqual(Array.from(deviceSamples))
  })

  it('is recognised as a WAVE container by the decode dispatcher', () => {
    expect(isRiffWave(buildDeviceFile())).toBe(true)
  })

  it('honours a declared size SMALLER than the file and drops the unflushed tail', () => {
    // Power-loss case: the firmware patches the size fields once a second, so
    // an interrupted recording declares less data than is physically present.
    // The declared size is the last synced, known-good point — everything past
    // it was never flushed and must not be treated as audio.
    const file = buildDeviceFile(8000) // 4000 frames = 0.25 s
    expect(file.byteLength).toBe(32044)

    const wav = parseWav(file)

    expect(wav.pcm.length).toBe(4000)
    expect(Array.from(wav.pcm)).toEqual(Array.from(deviceSamples.slice(0, 4000)))
  })

  it('ignores anything in the unreferenced tail that looks like another chunk', () => {
    const file = buildDeviceFile(8000)
    const bytes = new Uint8Array(file)
    const view = new DataView(file)
    // Plant a bogus second "data" chunk header exactly where the walker will
    // look next (44 + 8000), claiming the rest of the universe.
    bytes.set([0x64, 0x61, 0x74, 0x61], 8044) // "data"
    view.setUint32(8048, 0xffffffff, true)

    const wav = parseWav(file)

    expect(wav.pcm.length).toBe(4000)
  })
})

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
