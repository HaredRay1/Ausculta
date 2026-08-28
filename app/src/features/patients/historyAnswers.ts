/**
 * Turning a checklist into history entries.
 *
 * `HistoryEntry` carries three states, not two: an entry absent from the array
 * means the question was never asked, which is clinically different from
 * `present: false`, meaning it was asked and answered no. A plain checklist
 * only expresses two, so the form pairs it with one "I asked every question on
 * this list" control per section:
 *
 *   ticked                  -> present: true
 *   unticked + askedAll     -> present: false   (asked, answered no)
 *   unticked + not askedAll -> omitted          (never asked)
 *
 * The alternative — a Yes/No radio group per question — would express the same
 * three states but means 21 controls on a phone form, which in a clinic queue
 * gets filled in carelessly or not at all. One extra checkbox per section
 * keeps the distinction honest at a cost people will actually pay.
 */

import type { HistoryEntry } from '../../db/types'

export interface HistoryAnswerState {
  /** Codes the health worker ticked. */
  ticked: readonly string[]
  /** Whether the whole list was gone through with the patient. */
  askedAll: boolean
}

export const EMPTY_HISTORY_ANSWERS: HistoryAnswerState = { ticked: [], askedAll: false }

export function toggleTicked(state: HistoryAnswerState, code: string): HistoryAnswerState {
  const ticked = state.ticked.includes(code)
    ? state.ticked.filter((c) => c !== code)
    : [...state.ticked, code]
  return { ...state, ticked }
}

/**
 * Builds the entries to store, in the order the codes are presented, so the
 * record reads the same way the form did.
 */
export function toHistoryEntries<TCode extends string>(
  codes: readonly TCode[],
  state: HistoryAnswerState,
): HistoryEntry<TCode>[] {
  const ticked = new Set(state.ticked)
  const entries: HistoryEntry<TCode>[] = []

  for (const code of codes) {
    if (ticked.has(code)) entries.push({ code, present: true })
    else if (state.askedAll) entries.push({ code, present: false })
  }
  return entries
}

/** The inverse, for re-opening a saved record in the form. */
export function fromHistoryEntries<TCode extends string>(
  codes: readonly TCode[],
  entries: readonly HistoryEntry<TCode>[],
): HistoryAnswerState {
  const answered = new Set(entries.map((e) => e.code))
  return {
    ticked: entries.filter((e) => e.present).map((e) => e.code),
    // Every question having an entry is what "the whole list was asked" means.
    askedAll: entries.length > 0 && codes.every((code) => answered.has(code)),
  }
}
