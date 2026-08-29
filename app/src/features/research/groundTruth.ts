import type { ClassificationCode } from '../../db/codes'
import type { ResearchLabel } from '../../db/types'

/**
 * Ground-truth label vocabulary.
 *
 * `ResearchLabel.groundTruthStatus` is typed as a bare `string` and there is no
 * corresponding list in `db/codes.ts` — unlike every other clinical vocabulary
 * in the app. The registry is a frozen contract owned elsewhere, so this list
 * lives here rather than being bolted onto it. That is a gap worth closing
 * upstream: a research variable that leaves the device in an export belongs in
 * the same registry as `CONSENT_STATUSES`, and being defined in a feature
 * module means the i18n exhaustiveness test does not police it.
 *
 * The five statuses are deliberately non-overlapping on one axis: **does this
 * row supply a true class the model can be scored against?**
 *
 * - `CORRECT` — the reference agrees with the model. `labelCode` is stored
 *   anyway, copied from the prediction, so the row can be scored without
 *   having to re-read what the model said at labelling time.
 * - `MODIFIED` — the reference disagrees and the researcher names the true
 *   class. `labelCode` required.
 * - `INCORRECT` — the reference disagrees but the researcher will not commit to
 *   what it actually was ("not asthma, but I cannot say what"). No `labelCode`.
 *   Real information, and genuinely unusable for a confusion matrix, which has
 *   no cell for "something else".
 * - `UNCERTAIN` — the recording cannot be judged.
 * - `NO_REFERENCE_AVAILABLE` — no gold standard exists for this patient: no
 *   chest film, no spirometry, nothing to be right or wrong against. Distinct
 *   from `UNCERTAIN`, which is about the recording rather than the evidence.
 *
 * Only `CORRECT` and `MODIFIED` carry a true class, so only those two reach the
 * performance screen. The other three are counted and shown, never silently
 * dropped — a labelled recording that vanished from the denominator with no
 * explanation is how a performance figure quietly becomes a lie.
 */
export const GROUND_TRUTH_STATUSES = {
  CORRECT: 'CORRECT',
  MODIFIED: 'MODIFIED',
  INCORRECT: 'INCORRECT',
  UNCERTAIN: 'UNCERTAIN',
  NO_REFERENCE_AVAILABLE: 'NO_REFERENCE_AVAILABLE',
} as const

export type GroundTruthStatus = (typeof GROUND_TRUTH_STATUSES)[keyof typeof GROUND_TRUTH_STATUSES]

export const GROUND_TRUTH_STATUS_LIST: readonly GroundTruthStatus[] =
  Object.values(GROUND_TRUTH_STATUSES)

/** The statuses that require the researcher to name a class. */
export const STATUSES_REQUIRING_LABEL: readonly GroundTruthStatus[] = [
  GROUND_TRUTH_STATUSES.CORRECT,
  GROUND_TRUTH_STATUSES.MODIFIED,
]

/** The statuses that must NOT carry a class, mirroring the AI disclosure rule. */
export const STATUSES_FORBIDDING_LABEL: readonly GroundTruthStatus[] = [
  GROUND_TRUTH_STATUSES.INCORRECT,
  GROUND_TRUTH_STATUSES.UNCERTAIN,
  GROUND_TRUTH_STATUSES.NO_REFERENCE_AVAILABLE,
]

export function isGroundTruthStatus(value: string): value is GroundTruthStatus {
  return (GROUND_TRUTH_STATUS_LIST as readonly string[]).includes(value)
}

/** `true` when this label supplies a true class the model can be scored against. */
export function suppliesTrueClass(label: Pick<ResearchLabel, 'groundTruthStatus' | 'labelCode'>): boolean {
  return (
    (STATUSES_REQUIRING_LABEL as readonly string[]).includes(label.groundTruthStatus) &&
    label.labelCode !== undefined
  )
}

/**
 * Why this label is malformed, or `null`.
 *
 * The same shape of rule as `aiDisclosureViolation` in the demo feature, and
 * for the same reason: a class attached to a status that cannot support one
 * reads as knowledge nobody has, and here it would go on to move a published
 * accuracy figure.
 */
export function labelViolation(
  label: Pick<ResearchLabel, 'groundTruthStatus' | 'labelCode'>,
): string | null {
  if (!isGroundTruthStatus(label.groundTruthStatus)) {
    return `unknown ground-truth status "${label.groundTruthStatus}"`
  }
  const requires = (STATUSES_REQUIRING_LABEL as readonly string[]).includes(label.groundTruthStatus)
  if (requires && label.labelCode === undefined) {
    return `${label.groundTruthStatus} must name the true class`
  }
  if (!requires && label.labelCode !== undefined) {
    return `${label.groundTruthStatus} must not name a class`
  }
  return null
}

/**
 * The status implied by comparing a reference class to the model's prediction.
 *
 * Used to keep the labelling form honest: a researcher who picks the class the
 * model already chose is recording agreement, and the stored status should say
 * so rather than depending on which button they happened to press.
 */
export function statusForReference(
  predicted: ClassificationCode | undefined,
  reference: ClassificationCode,
): GroundTruthStatus {
  if (predicted === undefined) return GROUND_TRUTH_STATUSES.MODIFIED
  return predicted === reference
    ? GROUND_TRUTH_STATUSES.CORRECT
    : GROUND_TRUTH_STATUSES.MODIFIED
}
