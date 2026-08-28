/**
 * Every clinical / DSP number the audio module reasons about lives here.
 *
 * Rule for this module: logic files (quality.ts, segment.ts, aggregate.ts,
 * decode/*) must not contain bare numeric literals that a clinician or
 * reviewer would want to argue about. If a number encodes a judgement, it
 * belongs in TUNABLES; if it encodes a fact about the exported model, it
 * belongs in MODEL_REGISTRY; if it encodes a fact about the PCM format, it is
 * one of the format constants below.
 */

/**
 * 0 dBFS reference for 16-bit PCM. NOT a tunable — it is the definition of
 * the sample format. The whole module carries audio as Float32Array holding
 * *int16-range* values (-32768..32767), never Web Audio's -1..1.
 */
export const INT16_FULL_SCALE = 32768

/** Lowest dBFS value any metric will report, so a digital-silence buffer
 *  yields a finite, JSON-safe number instead of -Infinity. */
export const DBFS_FLOOR = -120

/** The one non-disease label. Used by the verdict decision table. */
export const HEALTHY_LABEL = 'Healthy'

export interface ModelRegistryEntry {
  readonly name: string
  readonly deployVersion: number
  readonly labelSchemaId: string
  readonly labels: readonly string[]
  readonly frequencyHz: number
  readonly windowSamples: number
  readonly sliceSamples: number
  readonly baseUrl: string
}

/**
 * Ground truth for the exported Edge Impulse deployment. `initClassifier`
 * cross-checks the running WASM against this; a mismatch is a hard failure,
 * because a silently re-exported model with different labels or a different
 * sample rate would produce confident nonsense.
 */
export const MODEL_REGISTRY: Readonly<Record<string, ModelRegistryEntry>> = {
  'ei-disease-v5': {
    name: 'SmartStethoscope',
    deployVersion: 5,
    labelSchemaId: 'disease-v1',
    labels: ['Asthma', 'Bronchiolitis', 'Healthy', 'Pneumonia'],
    frequencyHz: 16000,
    windowSamples: 16000,
    sliceSamples: 4000,
    baseUrl: '/models/ei-disease-v5/',
  },
}

export const DEFAULT_MODEL_ID = 'ei-disease-v5'

/** URL of the classic (non-module) worker asset. Served from public/, never
 *  imported through Vite — see classifier/client.ts for why. */
export const CLASSIFIER_WORKER_URL = '/audio/classifier.worker.js'

export const TUNABLES = {
  /** Bumped whenever any value below changes, so stored results stay
   *  interpretable against the thresholds that produced them. */
  tunablesVersion: 1,

  // --- Windowing ---------------------------------------------------------
  /** Hop between analysis windows. 500 ms = 50 % overlap on a 1 s window:
   *  enough votes from a short clip without doubling inference cost again. */
  STRIDE_MS: 500,
  /** A window quieter than this is classified but does not vote — the model
   *  has no "nothing here" class and scores near-silence arbitrarily. */
  WINDOW_SILENCE_DBFS: -55,
  /** Fewer voting windows than this and the clip cannot support any verdict. */
  MIN_VALID_WINDOWS: 3,

  // --- Verdict thresholds ------------------------------------------------
  /** Mean probability a disease label must reach to be called "suggestive". */
  CONFIDENCE_MEAN_MIN: 0.6,
  /** Mean probability Healthy must reach before we say "no abnormality". */
  HEALTHY_MEAN_MIN: 0.6,
  /** Fraction of voting windows that must agree with the aggregate winner. */
  AGREEMENT_MIN: 0.5,
  /** Gap between the winning and runner-up mean probability. Guards against
   *  a two-way split that averages into a spurious winner. */
  MARGIN_MIN: 0.15,

  // --- Quality gate: time domain ----------------------------------------
  /** Below this there are too few windows for the aggregate to mean anything. */
  MIN_DURATION_S: 3.0,
  /** Ceiling on clip length; longer imports are refused rather than decoded. */
  MAX_DURATION_S: 120,
  /** Whole-clip RMS below this is effectively silence (nothing on the bell). */
  SILENCE_RMS_DBFS: -50,
  /** |sample| at or above this counts as clipped (int16 rail is 32767). */
  CLIP_LEVEL_ABS: 32700,
  /** Clipped fraction at or above this destroys the spectrum — reject. */
  CLIP_FRACTION_REJECT: 0.01,
  /** Clipped fraction at or above this is audible but salvageable — warn. */
  CLIP_FRACTION_WARN: 0.002,
  /** |mean| / full scale above this indicates a DC-biased capture chain. */
  DC_OFFSET_WARN: 0.02,

  // --- Quality gate: spectral -------------------------------------------
  /** Spectral flatness above this is broadband noise, not auscultation. */
  FLATNESS_MAX: 0.45,
  /** Energy fraction in the dominant bin ± TONAL_BIN_HALF_WIDTH above this is
   *  a tone, not a lung. This is the flag that stops the pure-sine input the
   *  model scores as Asthma at 0.996. */
  TONALITY_MAX: 0.55,
  /** Half-width, in bins, of the dominant-peak neighbourhood used above.
   *  ±3 bins covers the Hann main lobe plus first sidelobes. */
  TONAL_BIN_HALF_WIDTH: 3,
  /** Energy fraction above HF_CUTOFF_HZ beyond this is hiss/handling noise. */
  HF_RATIO_WARN: 0.6,
  /** Lung sounds live well below this; energy above it is not diagnostic. */
  HF_CUTOFF_HZ: 4000,
  /** Analysis FFT length (128 ms at 16 kHz). */
  FFT_SIZE: 2048,
  /** Number of evenly spaced FFT frames averaged into one spectrum. */
  FFT_FRAMES: 8,
} as const

export type Tunables = typeof TUNABLES
