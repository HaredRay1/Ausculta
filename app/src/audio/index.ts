/**
 * Public API of the audio + AI module.
 *
 * This barrel is the ONLY import surface the rest of the app may use. Nothing
 * outside `src/audio/` should reach into `decode/`, `dsp/` or `classifier/`
 * directly: the int16-range PCM convention, the single ×32768 scaling site and
 * the "quality gate runs before inference" ordering are invariants of this
 * module, and they hold only when everything goes through the entry points
 * below.
 */

export type {
  AggregateStats,
  AnalysisResult,
  AudioSource,
  CaptureMeta,
  LiveEvent,
  LiveSession,
  ModelInfo,
  QualityFlag,
  QualityFlagCode,
  QualityMetrics,
  QualityReport,
  Verdict,
  VerdictKind,
  WindowResult,
} from './types'

export { analyzeBuffer, analyzeFile, disposeClassifier, initClassifier } from './analyze'
export { precheckQuality } from './dsp/quality'
export { encodeWav } from './dsp/wavEncode'

/**
 * MODEL_NOT_CONNECTED path — same result shape, no worker, no inference.
 * Exported here because index.ts is the platform's only import surface.
 */
export { notConnectedAnalyze, notConnectedAnalyzeBuffer } from './notConnected'

/**
 * Typed failures. The platform needs to tell "this file is 24-bit" from "this
 * file is longer than two minutes" from "we could not decode this at all" in
 * order to say anything useful to the user, and it cannot import them from
 * anywhere else.
 */
export { DecodeError, type DecodeErrorCode } from './decode/decode'
export { WavParseError, type WavErrorCode } from './decode/wav'
