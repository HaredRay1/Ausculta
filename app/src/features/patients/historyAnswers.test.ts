import { describe, expect, it } from 'vitest'
import { RESPIRATORY_HISTORY_CODES, type RespiratoryHistoryCode } from '../../db/codes'
import {
  EMPTY_HISTORY_ANSWERS,
  fromHistoryEntries,
  toHistoryEntries,
  toggleTicked,
} from './historyAnswers'

const CODES: RespiratoryHistoryCode[] = [
  RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED,
  RESPIRATORY_HISTORY_CODES.TUBERCULOSIS_PAST,
  RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT,
]

describe('toHistoryEntries', () => {
  it('records nothing when the form was not touched', () => {
    // Not "everything is false" — nothing was asked.
    expect(toHistoryEntries(CODES, EMPTY_HISTORY_ANSWERS)).toEqual([])
  })

  it('records only what was ticked when the list was not fully asked', () => {
    const entries = toHistoryEntries(CODES, {
      ticked: [RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED],
      askedAll: false,
    })
    expect(entries).toEqual([
      { code: RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, present: true },
    ])
  })

  it('records the unticked ones as answered no once the list was fully asked', () => {
    const entries = toHistoryEntries(CODES, {
      ticked: [RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED],
      askedAll: true,
    })
    expect(entries).toEqual([
      { code: RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, present: true },
      { code: RESPIRATORY_HISTORY_CODES.TUBERCULOSIS_PAST, present: false },
      { code: RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT, present: false },
    ])
  })

  it('distinguishes "all asked, all no" from "nothing asked"', () => {
    // The distinction the whole design exists to protect.
    const allNo = toHistoryEntries(CODES, { ticked: [], askedAll: true })
    const nothingAsked = toHistoryEntries(CODES, { ticked: [], askedAll: false })

    expect(allNo).toHaveLength(3)
    expect(allNo.every((e) => e.present === false)).toBe(true)
    expect(nothingAsked).toEqual([])
  })

  it('keeps the order the questions were presented in', () => {
    const entries = toHistoryEntries(CODES, {
      ticked: [RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT],
      askedAll: true,
    })
    expect(entries.map((e) => e.code)).toEqual(CODES)
  })

  it('ignores a ticked code that is not on the list', () => {
    const entries = toHistoryEntries(CODES, { ticked: ['NOT_A_CODE'], askedAll: false })
    expect(entries).toEqual([])
  })
})

describe('toggleTicked', () => {
  it('adds then removes', () => {
    const once = toggleTicked(EMPTY_HISTORY_ANSWERS, 'A')
    expect(once.ticked).toEqual(['A'])
    expect(toggleTicked(once, 'A').ticked).toEqual([])
  })

  it('leaves askedAll alone', () => {
    const state = { ticked: [], askedAll: true }
    expect(toggleTicked(state, 'A').askedAll).toBe(true)
  })
})

describe('fromHistoryEntries', () => {
  it('round-trips a partially asked list', () => {
    const state = { ticked: [RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED], askedAll: false }
    expect(fromHistoryEntries(CODES, toHistoryEntries(CODES, state))).toEqual(state)
  })

  it('round-trips a fully asked list', () => {
    const state = { ticked: [RESPIRATORY_HISTORY_CODES.TUBERCULOSIS_PAST], askedAll: true }
    expect(fromHistoryEntries(CODES, toHistoryEntries(CODES, state))).toEqual(state)
  })

  it('round-trips an empty record', () => {
    expect(fromHistoryEntries(CODES, [])).toEqual(EMPTY_HISTORY_ANSWERS)
  })

  it('round-trips all-asked-all-no', () => {
    const state = { ticked: [], askedAll: true }
    expect(fromHistoryEntries(CODES, toHistoryEntries(CODES, state))).toEqual(state)
  })
})
