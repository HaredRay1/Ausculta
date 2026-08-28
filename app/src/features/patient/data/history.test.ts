import { describe, expect, it } from 'vitest'
import { RESPIRATORY_HISTORY_CODES, type RespiratoryHistoryCode } from '../../../db/codes'
import type { HistoryEntry } from '../../../db/types'
import { notesByCode, splitHistory } from './history'

const CODES = [
  RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED,
  RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT,
  RESPIRATORY_HISTORY_CODES.TUBERCULOSIS_PAST,
] as const

describe('splitHistory', () => {
  it('keeps "never asked" apart from "asked and answered no"', () => {
    const entries: HistoryEntry<RespiratoryHistoryCode>[] = [
      { code: RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, present: true },
      { code: RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT, present: false },
      // TUBERCULOSIS_PAST is absent: nobody asked.
    ]

    const split = splitHistory(CODES, entries)
    expect(split.yes).toEqual([RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED])
    expect(split.no).toEqual([RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT])
    expect(split.notAsked).toEqual([RESPIRATORY_HISTORY_CODES.TUBERCULOSIS_PAST])

    // The distinction that matters: an unasked question is never a negative.
    expect(split.no).not.toContain(RESPIRATORY_HISTORY_CODES.TUBERCULOSIS_PAST)
  })

  it('puts every question in "not asked" when nothing was recorded', () => {
    const split = splitHistory(CODES, [])
    expect(split.notAsked).toEqual([...CODES])
    expect(split.yes).toEqual([])
    expect(split.no).toEqual([])
  })

  it('preserves the presentation order within each group', () => {
    const split = splitHistory(CODES, [
      { code: RESPIRATORY_HISTORY_CODES.TUBERCULOSIS_PAST, present: true },
      { code: RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, present: true },
    ])
    expect(split.yes).toEqual([
      RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED,
      RESPIRATORY_HISTORY_CODES.TUBERCULOSIS_PAST,
    ])
  })

  it('ignores a stored code that is not part of this section', () => {
    const split = splitHistory(CODES, [
      { code: RESPIRATORY_HISTORY_CODES.ALLERGIES, present: true },
    ])
    expect(split.yes).toEqual([])
    expect(split.notAsked).toEqual([...CODES])
  })
})

describe('notesByCode', () => {
  it('keeps only notes with something in them', () => {
    const notes = notesByCode<RespiratoryHistoryCode>([
      { code: RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, present: true, notes: 'Since childhood' },
      { code: RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT, present: false, notes: '   ' },
      { code: RESPIRATORY_HISTORY_CODES.ALLERGIES, present: true },
    ])
    expect(notes).toEqual({ ASTHMA_DIAGNOSED: 'Since childhood' })
  })
})
