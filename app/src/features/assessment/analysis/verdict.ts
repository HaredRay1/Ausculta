import type { AnalysisResult } from '../../../audio'
import type { ClassificationCode } from '../../../db/codes'
import { MODEL_NOT_CONNECTED_MESSAGE_KEY, classificationCodeForLabel, modelVersionOf } from '../data/mapping'

/**
 * One analysis result -> everything the result screen is allowed to show.
 *
 * The screen renders this object and nothing else. That is the whole point:
 * the rule "a missing model, a failed quality check or an uncertain result
 * renders no number anywhere" is enforced here, once, in plain data that a
 * test can assert on — rather than in five branches of JSX where a stray
 * `{confidence}` could survive review.
 */

/** The five states the result screen renders, plus a genuine failure. */
export type ResultState =
  | 'suggestive'
  | 'no-abnormality'
  | 'uncertain'
  | 'insufficient-quality'
  | 'model-not-connected'
  | 'error'

/**
 * Every `messageKey` the audio module puts on a verdict.
 *
 * Mirrors the keys in `audio/aggregate.ts` (`decideVerdict`) and
 * `audio/notConnected.ts`. A key outside this list — from a future version of
 * that module — resolves to VERDICT_FALLBACK_KEY rather than being handed to
 * `t()`, because i18next echoes an unknown key back and a clinician would be
 * shown the literal string "verdict.somethingNew".
 */
export const VERDICT_MESSAGE_KEYS = [
  'verdict.suggestive',
  'verdict.noAbnormality',
  'verdict.uncertain',
  'verdict.tooFewWindows',
  'verdict.insufficientQuality',
  MODEL_NOT_CONNECTED_MESSAGE_KEY,
] as const

export const VERDICT_FALLBACK_KEY = 'verdict.fallback'

export interface ResultView {
  state: ResultState
  /** i18n key for the primary sentence, guaranteed to exist in the bundle. */
  messageKey: string
  /**
   * The condition to name in that sentence, as a CODE. Present only for
   * `suggestive` — the only verdict that names a condition at all.
   */
  conditionCode?: ClassificationCode
  /**
   * Whole percent, present only for `suggestive`.
   *
   * Whole numbers because the model is roughly 71 % accurate: a decimal place
   * would be false precision dressed up as measurement.
   */
  confidencePercent?: number
  /** Which model produced this, or undefined when none ran. */
  modelVersion?: string
  /** Whether re-recording this position could plausibly give a better result. */
  showRecordAgain: boolean
}

function knownMessageKey(key: string): string {
  return (VERDICT_MESSAGE_KEYS as readonly string[]).includes(key) ? key : VERDICT_FALLBACK_KEY
}

export function toResultView(result: AnalysisResult): ResultView {
  const { verdict } = result

  // Before the kind, as in the persistence mapping: the no-model path reports
  // itself as `uncertain`, and treating it as one would imply an analysis ran.
  if (verdict.messageKey === MODEL_NOT_CONNECTED_MESSAGE_KEY) {
    return {
      state: 'model-not-connected',
      messageKey: MODEL_NOT_CONNECTED_MESSAGE_KEY,
      // No model version: none ran. Re-recording cannot install one, so the
      // screen offers no Record again either.
      showRecordAgain: false,
    }
  }

  switch (verdict.kind) {
    case 'insufficient-quality':
      return {
        state: 'insufficient-quality',
        messageKey: knownMessageKey(verdict.messageKey),
        showRecordAgain: true,
      }

    case 'uncertain':
      return {
        state: 'uncertain',
        messageKey: knownMessageKey(verdict.messageKey),
        modelVersion: modelVersionOf(result.model),
        showRecordAgain: true,
      }

    case 'no-abnormality':
      return {
        state: 'no-abnormality',
        messageKey: knownMessageKey(verdict.messageKey),
        // Deliberately no confidencePercent. The mean Healthy probability is
        // stored for research, but showing it beside "no abnormal sound
        // pattern" would read as confidence that the patient is well, which
        // this model cannot support.
        modelVersion: modelVersionOf(result.model),
        showRecordAgain: false,
      }

    case 'suggestive': {
      const code = classificationCodeForLabel(verdict.label)
      const confidence = verdict.confidence
      if (code === null || typeof confidence !== 'number') {
        return {
          state: 'error',
          messageKey: VERDICT_FALLBACK_KEY,
          modelVersion: modelVersionOf(result.model),
          showRecordAgain: true,
        }
      }
      return {
        state: 'suggestive',
        messageKey: knownMessageKey(verdict.messageKey),
        conditionCode: code,
        confidencePercent: Math.round(confidence * 100),
        modelVersion: modelVersionOf(result.model),
        showRecordAgain: false,
      }
    }
  }
}
