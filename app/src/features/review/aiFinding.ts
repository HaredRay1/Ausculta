/**
 * One stored recording -> what the MODEL said about it, for a clinician.
 *
 * This is the practitioner-facing sibling of `features/patient/data/resultView.ts`,
 * and the difference between them is deliberate. That module withholds numbers,
 * because a percentage beside a health result reads to a patient as a
 * probability of being ill. This one shows them: a clinician reading a
 * screening aid needs to know how confident the model was, and withholding it
 * would leave them judging a verdict with no idea how thin the evidence was.
 *
 * What both share is the rule that a degraded state names nothing. If the model
 * did not analyse the audio, there is no classification and no number — not a
 * zero, not a placeholder. "Nothing was decided" has to stay distinguishable
 * from "decided, and it was fine".
 *
 * Everything here describes the MACHINE's output. The practitioner's own
 * judgement never passes through this module; keeping the two apart in the data
 * is what lets the screen keep them apart on the page.
 */

import { RESULT_VERDICTS, type ResultVerdict } from '../../components'
import {
  AI_STATUS,
  CLASSIFICATION_CODES,
  type ClassificationCode,
  type LocationCode,
} from '../../db/codes'
import type { Recording } from '../../db/types'

export type AiFindingState =
  | 'suggestive'
  | 'no-abnormality'
  | 'uncertain'
  | 'insufficient-quality'
  | 'not-analysed'
  | 'model-not-connected'
  | 'error'

/** The states that are a verdict about the recording. The rest decided nothing. */
const STATE_VERDICT: Readonly<Partial<Record<AiFindingState, ResultVerdict>>> = {
  suggestive: RESULT_VERDICTS.SUGGESTIVE,
  'no-abnormality': RESULT_VERDICTS.NO_ABNORMALITY_DETECTED,
  uncertain: RESULT_VERDICTS.UNCERTAIN,
  'insufficient-quality': RESULT_VERDICTS.INSUFFICIENT_QUALITY,
}

export interface AiFinding {
  recordingId: string
  locationCode: LocationCode
  state: AiFindingState
  /** Null where nothing was decided, so no ResultCard is rendered. */
  verdict: ResultVerdict | null
  /** The pattern the model named. Absent unless it named one. */
  classificationCode?: ClassificationCode
  /**
   * Whole percent. Present whenever the model actually produced a confidence,
   * including for "no abnormality" — a clinician reading that a model was 54%
   * sure of a clear result is being told something useful, which is not true
   * of the same number shown to a patient.
   *
   * Whole numbers because the model is roughly 71% accurate overall; a decimal
   * place would be false precision.
   */
  confidencePercent?: number
  modelVersion?: string
  /** The model flagged its own output as unreliable. */
  uncertain: boolean
}

function stateFor(recording: Recording): AiFindingState {
  switch (recording.aiStatus) {
    case AI_STATUS.INSUFFICIENT_QUALITY:
      return 'insufficient-quality'
    case AI_STATUS.MODEL_NOT_CONNECTED:
      return 'model-not-connected'
    case AI_STATUS.ERROR:
      return 'error'
    case AI_STATUS.PENDING:
      return 'not-analysed'
    case AI_STATUS.ANALYZED:
      break
    default:
      // An unrecognised status from an older build decided nothing.
      return 'not-analysed'
  }

  if (recording.uncertainFlag === true) return 'uncertain'
  if (recording.aiClassification === undefined) return 'not-analysed'
  if (recording.aiClassification === CLASSIFICATION_CODES.HEALTHY) return 'no-abnormality'
  return 'suggestive'
}

/**
 * Reads a stored row into what the model said.
 *
 * Treats every field as untrusted: the row may have been written weeks ago by a
 * different build, so a number is only carried through when the state has
 * positively earned one.
 */
export function aiFindingFor(recording: Recording): AiFinding {
  const state = stateFor(recording)
  const decided = state === 'suggestive' || state === 'no-abnormality'

  const confidence =
    decided && typeof recording.aiConfidence === 'number' && Number.isFinite(recording.aiConfidence)
      ? Math.round(Math.min(Math.max(recording.aiConfidence, 0), 1) * 100)
      : undefined

  return {
    recordingId: recording.id,
    locationCode: recording.locationCode,
    state,
    verdict: STATE_VERDICT[state] ?? null,
    ...(state === 'suggestive' &&
      recording.aiClassification !== undefined && {
        classificationCode: recording.aiClassification,
      }),
    ...(confidence !== undefined && { confidencePercent: confidence }),
    ...(recording.modelVersion !== undefined && { modelVersion: recording.modelVersion }),
    uncertain: recording.uncertainFlag === true,
  }
}
