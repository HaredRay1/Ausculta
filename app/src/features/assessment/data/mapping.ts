import type { AggregateStats, AnalysisResult, ModelInfo, WindowResult } from '../../../audio'
import { AI_STATUS, CLASSIFICATION_CODES } from '../../../db/codes'
import type { AiStatus, ClassificationCode } from '../../../db/codes'

/**
 * One analysis result -> the AI columns of a `recordings` row.
 *
 * This is the single point where the audio module's verdict becomes stored
 * clinical data, and it is deliberately pure and total: no I/O, no throwing,
 * every branch returning a complete outcome. The rule it exists to enforce is
 * that a result the model could not support NEVER acquires a classification or
 * a confidence on the way into the database — because anything stored here is
 * later rendered to a clinician, and a number attached to an inconclusive
 * result reads as certainty the model does not have.
 */

/**
 * The message key `notConnectedAnalyze*` stamps on its verdict.
 *
 * Necessary because that path returns `kind: 'uncertain'` — the audio module
 * has no separate verdict kind for "there was no model" — so the kind alone
 * cannot tell an inconclusive analysis from an analysis that never ran. The
 * key is part of the audio module's public `Verdict`, and `mapping.test.ts`
 * pins this constant against the real module so the two cannot drift.
 */
export const MODEL_NOT_CONNECTED_MESSAGE_KEY = 'verdict.modelNotConnected'

/**
 * Everything from an analysis that is worth keeping beside the recording:
 * the per-window votes, the aggregate they were reduced to, and the version
 * of the thresholds that reduction used. Without the thresholds the windows
 * cannot be re-interpreted, so they are stored together or not at all.
 */
export interface PerWindowResults {
  windows: WindowResult[]
  aggregate: AggregateStats | null
  tunablesVersion: number
}

/** The AI-related fields of a `Recording`, ready to spread onto the row. */
export interface AiOutcome {
  aiStatus: AiStatus
  aiClassification?: ClassificationCode
  aiConfidence?: number
  uncertainFlag?: boolean
  /** Present only when the model actually ran — see `toAiOutcome`. */
  modelVersion?: string
  perWindowResults?: PerWindowResults
}

/**
 * A model label (`"Asthma"`) -> the stored code (`ASTHMA`), or null.
 *
 * Null rather than a guess: the registry pins the model's label set, so an
 * unknown label means the running model is not the one this app was calibrated
 * against, and coding it to the nearest match would silently mislabel data.
 */
export function classificationCodeForLabel(label: string | undefined): ClassificationCode | null {
  if (label === undefined) return null
  const candidate = label.trim().toUpperCase()
  return candidate in CLASSIFICATION_CODES
    ? CLASSIFICATION_CODES[candidate as keyof typeof CLASSIFICATION_CODES]
    : null
}

/**
 * Stored model identity: id plus deploy version.
 *
 * Both halves are needed. The id changes when a differently-shaped model is
 * registered; the deploy version changes when the same impulse is re-exported
 * from Edge Impulse Studio after a retrain. A row carrying only one of them
 * could not be excluded from a comparison against a later model.
 */
export function modelVersionOf(model: ModelInfo): string {
  return `${model.id}@${model.deployVersion}`
}

/** The model's own name for the one non-disease class, whatever its casing. */
function healthyLabelOf(model: ModelInfo): string | undefined {
  return model.labels.find(
    (label) => classificationCodeForLabel(label) === CLASSIFICATION_CODES.HEALTHY,
  )
}

function perWindowResultsOf(result: AnalysisResult): PerWindowResults | undefined {
  if (result.windows.length === 0) return undefined
  return {
    windows: result.windows,
    aggregate: result.aggregate,
    tunablesVersion: result.tunablesVersion,
  }
}

/** The ANALYZED shell: model identity and window detail, no clinical claim. */
function analyzed(result: AnalysisResult): AiOutcome {
  return {
    aiStatus: AI_STATUS.ANALYZED,
    modelVersion: modelVersionOf(result.model),
    ...(perWindowResultsOf(result) !== undefined && {
      perWindowResults: perWindowResultsOf(result),
    }),
  }
}

export function toAiOutcome(result: AnalysisResult): AiOutcome {
  // First, before any look at `kind`: the no-model path reports itself as
  // `uncertain`, and mapping it to ANALYZED would record an analysis that
  // never happened.
  if (result.verdict.messageKey === MODEL_NOT_CONNECTED_MESSAGE_KEY) {
    return { aiStatus: AI_STATUS.MODEL_NOT_CONNECTED }
  }

  switch (result.verdict.kind) {
    case 'insufficient-quality':
      // No model identity and no window detail: the gate rejected the
      // recording before inference, so there is nothing the model produced.
      return { aiStatus: AI_STATUS.INSUFFICIENT_QUALITY }

    case 'uncertain':
      return { ...analyzed(result), uncertainFlag: true }

    case 'no-abnormality': {
      const healthyLabel = healthyLabelOf(result.model)
      // The verdict itself carries no confidence for this branch (the audio
      // module withholds it so nothing renders a number beside a negative
      // result). The mean Healthy probability is a measured value and is kept
      // for research; the result screen still shows no number here.
      const mean =
        healthyLabel !== undefined
          ? result.aggregate?.meanProbabilities[healthyLabel]
          : undefined
      return {
        ...analyzed(result),
        aiClassification: CLASSIFICATION_CODES.HEALTHY,
        ...(typeof mean === 'number' && { aiConfidence: mean }),
      }
    }

    case 'suggestive': {
      const code = classificationCodeForLabel(result.verdict.label)
      const confidence = result.verdict.confidence
      if (code === null || typeof confidence !== 'number') {
        // A finding we cannot represent is a genuine failure of this app, not
        // a missing model and not a clinical result. Recording it as ERROR
        // keeps the row honest: something went wrong and nothing is claimed.
        return { aiStatus: AI_STATUS.ERROR, modelVersion: modelVersionOf(result.model) }
      }
      return { ...analyzed(result), aiClassification: code, aiConfidence: confidence }
    }
  }
}

/**
 * The outcome for an analysis that threw.
 *
 * Always MODEL_NOT_CONNECTED. Everything that can make `analyzeBuffer` reject
 * after the audio has already decoded and passed the quality gate is a failure
 * to load or run the impulse — a missing deployment, a worker that 404s, a
 * WASM fetch that times out, a runtime that does not match the registry — and
 * the project rule is that a missing model is never reported as ERROR.
 * Failures of this app's own code surface as ERROR from `toAiOutcome`.
 */
export function analysisFailureOutcome(_error?: unknown): AiOutcome {
  return { aiStatus: AI_STATUS.MODEL_NOT_CONNECTED }
}
