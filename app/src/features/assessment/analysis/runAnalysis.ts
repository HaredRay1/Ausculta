import type { AnalysisResult } from '../../../audio'
import { defaultAudioPort, type AudioPort } from './audioPort'

/**
 * Run the model over audio the import step already decoded.
 *
 * The failure path is the whole reason this is a function rather than a call
 * site. When the impulse cannot be loaded — no deployment in the build, a
 * worker that 404s, a WASM fetch that times out on a clinic connection — the
 * result handed back is the PRECHECK result, whose verdict the audio module
 * has already stamped as model-not-connected. So the app degrades to "this was
 * not analysed" carrying the real quality report and the real audio, rather
 * than to an error screen or, far worse, to a fabricated finding.
 *
 * A recording the quality gate rejected still goes through `analyze`. That is
 * deliberate: the audio module returns the insufficient-quality verdict WITHOUT
 * loading the model (the gate runs before inference inside the pipeline), so
 * letting it decide keeps every verdict in the module that owns the thresholds
 * — this layer never second-guesses the gate, it only displays what it said.
 */
export async function runAnalysis(
  precheck: AnalysisResult,
  port: AudioPort = defaultAudioPort,
): Promise<AnalysisResult> {
  try {
    return await port.analyze(precheck.audio.pcm16k, precheck.meta)
  } catch {
    return precheck
  }
}
