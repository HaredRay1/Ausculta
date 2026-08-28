/**
 * Public types of the audio/AI module. Everything the rest of the app is
 * allowed to know about auscultation audio is declared here and re-exported
 * from index.ts.
 */

export interface ModelInfo {
  id: string
  name: string
  deployVersion: number
  labelSchemaId: string
  labels: readonly string[]
  frequencyHz: number
  windowSamples: number
  sliceSamples: number
}

/** Where the audio came from. Distinct from the DB's `AUDIO_SOURCES` codes:
 *  this describes the capture path, the DB code describes the record. */
export type AudioSource = 'device-wav' | 'file-import' | 'phone-mic'

export interface CaptureMeta {
  source: AudioSource
  originalMime?: string
  /** Filled in by the module after decoding — callers may leave it unset. */
  originalSampleRate?: number
  micSettings?: MediaTrackSettings
}

export type QualityFlagCode =
  | 'too-short'
  | 'silence'
  | 'clipping'
  | 'clipping-warn'
  | 'dc-offset'
  | 'noise-like'
  | 'tonal'
  | 'hf-dominant'

export interface QualityFlag {
  code: QualityFlagCode
  severity: 'reject' | 'warn'
  /** Measured value that triggered the flag, in the metric's own units. */
  value: number
  /** Threshold it was compared against (from TUNABLES). */
  threshold: number
}

export interface QualityMetrics {
  durationMs: number
  rmsDbfs: number
  clipFraction: number
  dcOffset: number
  spectralFlatness: number
  tonalityRatio: number
  hfEnergyRatio: number
}

export interface QualityReport {
  ok: boolean
  flags: QualityFlag[]
  metrics: QualityMetrics
}

export interface WindowResult {
  startMs: number
  endMs: number
  probabilities: Record<string, number>
  topLabel: string
  topScore: number
  rmsDbfs: number
  /** True when the window was too quiet to vote. It is still classified and
   *  reported, but excluded from the aggregate. */
  excluded: boolean
}

export type VerdictKind = 'suggestive' | 'no-abnormality' | 'uncertain' | 'insufficient-quality'

export interface Verdict {
  kind: VerdictKind
  label?: string
  confidence?: number
  /** i18n key, never user-facing prose — this module renders nothing. */
  messageKey: string
}

export interface AggregateStats {
  meanProbabilities: Record<string, number>
  agreement: number
  margin: number
  windowsUsed: number
  windowsTotal: number
}

export interface AnalysisResult {
  model: ModelInfo
  meta: CaptureMeta
  quality: QualityReport
  windows: WindowResult[]
  aggregate: AggregateStats | null
  verdict: Verdict
  audio: { pcm16k: Int16Array; sampleRate: 16000; durationMs: number }
  timings: { decodeMs: number; qualityMs: number; inferenceMs: number }
  analyzedAt: string
  tunablesVersion: number
}

// ---------------------------------------------------------------------------
// Live microphone mode — declared now, implemented in a later phase, so that
// the public API shape does not change under the platform when it lands.
// ---------------------------------------------------------------------------

export type LiveEvent =
  | { type: 'level'; rmsDbfs: number; atMs: number }
  | { type: 'window'; result: WindowResult }
  | { type: 'quality'; report: QualityReport }
  | { type: 'error'; message: string }
  | { type: 'stopped'; reason: 'user' | 'max-duration' | 'error' }

export interface LiveSession {
  stop(): Promise<AnalysisResult>
  cancel(): void
  subscribe(listener: (event: LiveEvent) => void): () => void
}
