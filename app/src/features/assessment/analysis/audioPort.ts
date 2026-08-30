import { analyzeBuffer, notConnectedAnalyze, type AnalysisResult, type CaptureMeta } from '../../../audio'

/**
 * The assessment flow's only door to the audio module.
 *
 * Two calls, in the order the wizard needs them, because the wizard shows the
 * recording check to a health worker BEFORE anything is analysed:
 *
 * 1. `precheck` decodes the imported file and runs the quality gate. It is the
 *    call that raises the typed `DecodeError`/`WavParseError` the import screen
 *    turns into an actionable sentence, and it never loads the model.
 * 2. `analyze` runs the full pipeline over the audio `precheck` already
 *    decoded, so the file is decoded once rather than twice.
 *
 * Injectable so the wizard can be tested without a 2.8 MB WASM download.
 */
export interface AudioPort {
  precheck(file: File, meta: CaptureMeta): Promise<AnalysisResult>
  analyze(pcm16k: Int16Array, meta: CaptureMeta): Promise<AnalysisResult>
}

/**
 * `notConnectedAnalyze` is the no-model entry point, and that is exactly what a
 * precheck is: decode the file, run the quality gate, spawn no worker. Its
 * verdict is always the model-not-connected one, which the caller ignores here
 * — except on the failure path, where it becomes the honest answer (see
 * `runAnalysis`).
 */
export const defaultAudioPort: AudioPort = {
  precheck: (file, meta) => notConnectedAnalyze(file, meta),
  analyze: (pcm16k, meta) =>
    // Int16Array -> the int16-RANGE float convention analyzeBuffer expects.
    // Already at 16 kHz, so the module's resampler short-circuits.
    analyzeBuffer(Float32Array.from(pcm16k), 16000, meta),
}

/** How the app describes an imported device recording to the audio module. */
export const DEVICE_IMPORT_META: CaptureMeta = {
  source: 'device-wav',
  originalMime: 'audio/wav',
}
