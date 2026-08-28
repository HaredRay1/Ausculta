import type { HistoryEntry } from '../../../db/types'

/**
 * Splitting a stored history into what a patient may be shown.
 *
 * `HistoryEntry` carries three states, not two. An entry absent from the array
 * means **the question was never asked**, which is clinically different from
 * `present: false`, meaning it was asked and answered no. Rendering the absent
 * ones as "No" would put answers in a patient's mouth that nobody ever got —
 * and would show a clinician a negative history that was never taken.
 *
 * So the three go in three separate buckets and the screen labels them
 * separately. `notAsked` is not filler: on a screen a pulmonologist scores for
 * information clarity, "we have not asked you this" is a real and useful thing
 * to say.
 */

export interface SplitHistory<TCode extends string> {
  /** Asked, answered yes. */
  yes: TCode[]
  /** Asked, answered no. */
  no: TCode[]
  /** Never asked. Must never render as a negative. */
  notAsked: TCode[]
}

/**
 * @param codes every question in this section, in the order it is presented
 * @param entries what was actually recorded for this patient
 */
export function splitHistory<TCode extends string>(
  codes: readonly TCode[],
  entries: readonly HistoryEntry<TCode>[],
): SplitHistory<TCode> {
  const byCode = new Map<TCode, HistoryEntry<TCode>>()
  for (const entry of entries) byCode.set(entry.code, entry)

  const split: SplitHistory<TCode> = { yes: [], no: [], notAsked: [] }
  for (const code of codes) {
    const entry = byCode.get(code)
    if (entry === undefined) split.notAsked.push(code)
    else if (entry.present) split.yes.push(code)
    else split.no.push(code)
  }
  return split
}

/** Notes recorded against a question, keyed by code. */
export function notesByCode<TCode extends string>(
  entries: readonly HistoryEntry<TCode>[],
): Record<string, string> {
  const notes: Record<string, string> = {}
  for (const entry of entries) {
    if (entry.notes !== undefined && entry.notes.trim() !== '') notes[entry.code] = entry.notes
  }
  return notes
}
