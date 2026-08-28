import { describe, expect, it } from 'vitest'
import { DecodeError, decodeFromBuffer, decodeToPcm16k, scaleUnitFloatsToInt16Range } from '../decode/decode'
import { parseWav } from '../decode/wav'
import { encodeWav, encodeWavBuffer, toInt16 } from '../dsp/wavEncode'
import { INT16_FULL_SCALE, TUNABLES } from '../constants'
import { SR, quantizeToInt16, shapedNoise } from './signals'
import { buildWav } from './wavBuilder'

const wavBlob = (samples: Int16Array, options?: Parameters<typeof buildWav>[1]): Blob =>
  new Blob([buildWav(samples, options)], { type: 'audio/wav' })

describe('scaling invariant — ×32768 happens in exactly one place', () => {
  it('turns Web Audio floats into the same values the int16 WAV path produces', () => {
    const int16 = quantizeToInt16(shapedNoise(4096))

    // Path A: the file path — wav.ts emits raw int16 values, unscaled.
    const fromWav = parseWav(buildWav(int16)).pcm

    // Path B: what decodeAudioData would hand us for the same signal, put
    // through the module's single scaling function.
    const asUnitFloats = Float32Array.from(int16, (v) => v / INT16_FULL_SCALE)
    const fromFloats = scaleUnitFloatsToInt16Range(asUnitFloats)

    expect(fromFloats.length).toBe(fromWav.length)
    for (let i = 0; i < fromWav.length; i++) {
      // Bit-for-bit: ÷ and × by the same power of two are exact in float32.
      expect(fromFloats[i]).toBe(fromWav[i])
    }
  })

  it('maps the unit extremes onto the int16 rails exactly', () => {
    const scaled = scaleUnitFloatsToInt16Range(new Float32Array([-1, 0, 0.5, 32767 / 32768]))
    expect(Array.from(scaled)).toEqual([-32768, 0, 16384, 32767])
  })

  it('agrees with the int16 path after a stereo mixdown', () => {
    const stereo = new Int16Array([100, 200, -300, -100, 32767, -32768])
    const fromWav = parseWav(buildWav(stereo, { channels: 2 })).pcm

    const left = [100, -300, 32767].map((v) => v / INT16_FULL_SCALE)
    const right = [200, -100, -32768].map((v) => v / INT16_FULL_SCALE)
    const mixed = Float32Array.from(left, (v, i) => (v + right[i]) / 2)
    const fromFloats = scaleUnitFloatsToInt16Range(mixed)

    for (let i = 0; i < fromWav.length; i++) expect(fromFloats[i]).toBe(fromWav[i])
  })
})

describe('decodeToPcm16k', () => {
  it('decodes a 16 kHz device WAV without resampling and without rescaling', async () => {
    const samples = quantizeToInt16(shapedNoise(3 * SR))
    const decoded = await decodeToPcm16k(wavBlob(samples))
    expect(decoded.originalSampleRate).toBe(16000)
    expect(decoded.durationMs).toBeCloseTo(3000, 6)
    expect(Array.from(decoded.pcm16k)).toEqual(Array.from(samples))
  })

  it('rejects an empty file with a typed error', async () => {
    await expect(decodeToPcm16k(new Blob([]))).rejects.toMatchObject({
      name: 'DecodeError',
      code: 'empty',
    })
  })

  it('rejects a recording longer than MAX_DURATION_S with a typed error', async () => {
    const tooLong = new Int16Array((TUNABLES.MAX_DURATION_S + 1) * SR)
    await expect(decodeToPcm16k(wavBlob(tooLong))).rejects.toMatchObject({
      name: 'DecodeError',
      code: 'too-long',
    })
  })

  it('surfaces the WAV parser’s diagnosis when no browser codec can help', async () => {
    // jsdom has no Web Audio, so the fallback cannot rescue a 24-bit file —
    // the user must be told the bit depth, not "decode failed".
    const samples = quantizeToInt16(shapedNoise(1000))
    await expect(decodeToPcm16k(wavBlob(samples, { bitsPerSample: 24 }))).rejects.toMatchObject({
      name: 'WavParseError',
      code: 'unsupported-bit-depth',
    })
  })

  it('reports a typed failure for a non-WAV file it cannot decode', async () => {
    const notAudio = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])])
    await expect(decodeToPcm16k(notAudio)).rejects.toMatchObject({
      name: 'DecodeError',
      code: 'decode-failed',
    })
  })
})

describe('decodeFromBuffer', () => {
  it('passes 16 kHz audio straight through', async () => {
    const pcm = shapedNoise(2 * SR)
    const decoded = await decodeFromBuffer(pcm, 16000)
    expect(decoded.originalSampleRate).toBe(16000)
    expect(decoded.durationMs).toBeCloseTo(2000, 6)
    expect(decoded.pcm16k).toBe(pcm)
  })

  it('rejects an empty buffer and an over-long one', async () => {
    await expect(decodeFromBuffer(new Float32Array(0), 16000)).rejects.toMatchObject({
      code: 'empty',
    })
    await expect(
      decodeFromBuffer(new Float32Array((TUNABLES.MAX_DURATION_S + 1) * SR), 16000),
    ).rejects.toMatchObject({ code: 'too-long' })
  })
})

describe('encodeWav', () => {
  it('round-trips through the parser unchanged', () => {
    const samples = quantizeToInt16(shapedNoise(1024))
    const parsed = parseWav(encodeWavBuffer(samples))
    expect(parsed.sampleRate).toBe(16000)
    expect(parsed.channels).toBe(1)
    expect(parsed.bitDepth).toBe(16)
    expect(Array.from(parsed.pcm)).toEqual(Array.from(samples))
  })

  it('preserves the int16 rails', () => {
    const samples = new Int16Array([-32768, 32767, 0, -1, 1])
    expect(Array.from(parseWav(encodeWavBuffer(samples)).pcm)).toEqual(Array.from(samples))
  })

  it('writes a 44-byte header', () => {
    expect(encodeWavBuffer(new Int16Array(10)).byteLength).toBe(44 + 20)
  })

  it('produces an audio/wav Blob', () => {
    const blob = encodeWav(new Int16Array(10))
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(64)
  })

  it('is the inverse of toInt16 for already-integral data', () => {
    const source = shapedNoise(256)
    const round = toInt16(source)
    expect(Array.from(parseWav(encodeWavBuffer(round)).pcm)).toEqual(Array.from(round))
  })

  it('clamps out-of-range floats rather than wrapping them', () => {
    expect(Array.from(toInt16(new Float32Array([40000, -40000, 32766.6])))).toEqual([
      32767, -32768, 32767,
    ])
  })
})
