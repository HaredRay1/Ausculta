/**
 * Audio for seeded recordings: an obviously synthetic test tone, never a
 * fabricated lung sound.
 *
 * This is the single most dangerous thing in the demo dataset to get wrong. A
 * pulmonologist evaluating this prototype will press play on a recording and
 * form a clinical judgement about what they hear. If that audio were plausible
 * breath sounds — even synthesised ones — their judgement would be about
 * fiction, and their score would be worthless. Worse, a convincing fake could
 * escape the demo dataset and end up cited as a real auscultation.
 *
 * So the audio is a two-tone alternating sine: a laboratory test signal that
 * cannot be mistaken for a body. It is unambiguous within about half a second
 * of playback, which is the property that matters. Every seeded recording also
 * carries `audioSource: DEMO_FICTIONAL` and an `originalFileName` that says so
 * in words, so the file declares itself three ways over.
 *
 * There is a deliberate choice here not to leave the blob out altogether. The
 * validation protocol has people navigating the prototype unaided, and a play
 * button that does nothing is scored as a broken feature rather than an absent
 * one. A tone that plays and is obviously a tone keeps the path walkable while
 * telling the truth.
 *
 * The WAV writer below is local rather than `src/audio`'s `encodeWav`. That
 * module's exports carry invariants about analysis audio — the int16-range
 * Float32 convention, quality gate ordering — that this signal has no business
 * participating in, and seeding fictional data should not drag the inference
 * pipeline into its import graph.
 */

/** 8 kHz mono: ample for a tone, and keeps the seeded blobs small. */
export const DEMO_AUDIO_SAMPLE_RATE = 8000
export const DEMO_AUDIO_BIT_DEPTH = 16
export const DEMO_AUDIO_CHANNELS = 1
export const DEMO_AUDIO_DURATION_SEC = 4

/** Names itself, in the one field a file browser would show. */
export const DEMO_AUDIO_FILE_NAME = 'demo-synthetic-tone-not-a-lung-sound.wav'

/**
 * Four variants, cycled across recordings.
 *
 * One shared blob would be cheaper, but every waveform in the app would then
 * be identical and read as a rendering bug to the engineers scoring
 * functionality. Four is enough to look alive and still obviously synthetic.
 */
export const DEMO_AUDIO_VARIANTS = [
  { id: 'DEMO-AB-TONE-1', lowHz: 330, highHz: 495, alternateSec: 0.5 },
  { id: 'DEMO-AB-TONE-2', lowHz: 440, highHz: 660, alternateSec: 0.4 },
  { id: 'DEMO-AB-TONE-3', lowHz: 392, highHz: 588, alternateSec: 0.65 },
  { id: 'DEMO-AB-TONE-4', lowHz: 494, highHz: 741, alternateSec: 0.35 },
] as const

export type DemoAudioVariant = (typeof DEMO_AUDIO_VARIANTS)[number]

/** The blob id for recording number `index`, cycling through the variants. */
export function demoAudioBlobIdFor(index: number): string {
  const variant = DEMO_AUDIO_VARIANTS[index % DEMO_AUDIO_VARIANTS.length]
  return variant.id
}

const PEAK = 0.25 * 32767
/** Fade at each tone edge, in seconds — long enough to kill the click. */
const EDGE_FADE_SEC = 0.01

/**
 * Alternating two-tone sine as 16-bit PCM.
 *
 * The envelope fades each tone in and out so the alternation does not click,
 * which would add broadband transients — the one way a pure tone could start
 * to resemble a crackle.
 */
export function synthesiseTonePcm(
  variant: DemoAudioVariant,
  sampleRate = DEMO_AUDIO_SAMPLE_RATE,
  durationSec = DEMO_AUDIO_DURATION_SEC,
): Int16Array {
  const total = Math.round(sampleRate * durationSec)
  const period = Math.max(1, Math.round(variant.alternateSec * sampleRate))
  const fade = Math.max(1, Math.round(EDGE_FADE_SEC * sampleRate))
  const pcm = new Int16Array(total)

  let phase = 0
  for (let i = 0; i < total; i++) {
    const positionInTone = i % period
    const high = Math.floor(i / period) % 2 === 1
    const freq = high ? variant.highHz : variant.lowHz

    // Continuous phase accumulation, so the frequency can change without a
    // discontinuity in the waveform itself.
    phase += (2 * Math.PI * freq) / sampleRate
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI

    const edge = Math.min(positionInTone, period - 1 - positionInTone)
    const envelope = edge >= fade ? 1 : edge / fade

    pcm[i] = Math.round(Math.sin(phase) * PEAK * envelope)
  }
  return pcm
}

/** Minimal canonical 44-byte-header PCM WAV. */
export function encodeDemoWav(pcm: Int16Array, sampleRate = DEMO_AUDIO_SAMPLE_RATE): ArrayBuffer {
  const bytesPerSample = DEMO_AUDIO_BIT_DEPTH / 8
  const dataBytes = pcm.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk size
  view.setUint16(20, 1, true) // format 1 = PCM
  view.setUint16(22, DEMO_AUDIO_CHANNELS, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * DEMO_AUDIO_CHANNELS * bytesPerSample, true) // byte rate
  view.setUint16(32, DEMO_AUDIO_CHANNELS * bytesPerSample, true) // block align
  view.setUint16(34, DEMO_AUDIO_BIT_DEPTH, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(44 + i * bytesPerSample, pcm[i], true)
  }
  return buffer
}

export interface DemoAudioBlob {
  id: string
  blob: Blob
}

/** The four tone blobs, ready to write to `audioBlobs`. */
export function buildDemoAudioBlobs(): DemoAudioBlob[] {
  return DEMO_AUDIO_VARIANTS.map((variant) => ({
    id: variant.id,
    blob: new Blob([encodeDemoWav(synthesiseTonePcm(variant))], { type: 'audio/wav' }),
  }))
}
