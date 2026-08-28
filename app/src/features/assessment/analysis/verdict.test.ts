import { describe, expect, it } from 'vitest'
import enAssessment from '../../../i18n/locales/en/assessment.json'
import { CLASSIFICATION_CODES } from '../../../db/codes'
import {
  VERDICT_FALLBACK_KEY,
  VERDICT_MESSAGE_KEYS,
  toResultView,
} from './verdict'
import {
  analysisResult,
  insufficientQualityResult,
  noAbnormalityResult,
  notConnectedResult,
  suggestiveResult,
  uncertainResult,
} from '../__tests__/fixtures'

describe('verdict copy', () => {
  it('has English copy for every message key the audio module can emit', () => {
    const bundle = enAssessment as unknown as Record<string, Record<string, unknown>>
    for (const key of [...VERDICT_MESSAGE_KEYS, VERDICT_FALLBACK_KEY]) {
      const [namespace, name] = key.split('.')
      expect(typeof bundle[namespace]?.[name], `missing copy for ${key}`).toBe('string')
    }
  })

  it('never uses the word "diagnosis" in any verdict copy', () => {
    const copy = JSON.stringify(enAssessment).toLowerCase()
    // "not a diagnosis" is the one permitted use: the standing disclaimer.
    const uses = copy.split('diagnosis').length - 1
    const disclaimed = copy.split('never a diagnosis').length - 1
    expect(uses).toBe(disclaimed)
  })
})

describe('toResultView', () => {
  it('shows a suggestive finding as a condition code and a whole-percent number', () => {
    const view = toResultView(suggestiveResult('Pneumonia', 0.824))

    expect(view.state).toBe('suggestive')
    expect(view.messageKey).toBe('verdict.suggestive')
    expect(view.conditionCode).toBe(CLASSIFICATION_CODES.PNEUMONIA)
    expect(view.confidencePercent).toBe(82)
    expect(view.showRecordAgain).toBe(false)
  })

  it('shows no abnormality without any number', () => {
    const view = toResultView(noAbnormalityResult(0.74))

    expect(view.state).toBe('no-abnormality')
    expect(view.messageKey).toBe('verdict.noAbnormality')
    expect(view.confidencePercent).toBeUndefined()
    expect(view.conditionCode).toBeUndefined()
  })

  it('keeps the two uncertain reasons apart so the screen can explain why', () => {
    expect(toResultView(uncertainResult('verdict.uncertain')).messageKey).toBe('verdict.uncertain')
    expect(toResultView(uncertainResult('verdict.tooFewWindows')).messageKey).toBe(
      'verdict.tooFewWindows',
    )
  })

  it('offers Record again for uncertain and unusable recordings', () => {
    expect(toResultView(uncertainResult()).showRecordAgain).toBe(true)
    expect(toResultView(insufficientQualityResult()).showRecordAgain).toBe(true)
  })

  it('carries no number for an unusable recording', () => {
    const view = toResultView(insufficientQualityResult())

    expect(view.state).toBe('insufficient-quality')
    expect(view.confidencePercent).toBeUndefined()
    expect(view.conditionCode).toBeUndefined()
  })

  it('carries no number and no model identity when there was no model', () => {
    const view = toResultView(notConnectedResult())

    expect(view.state).toBe('model-not-connected')
    expect(view.messageKey).toBe('verdict.modelNotConnected')
    expect(view.confidencePercent).toBeUndefined()
    expect(view.conditionCode).toBeUndefined()
    expect(view.modelVersion).toBeUndefined()
    expect(view.showRecordAgain).toBe(false)
  })

  it('reports a finding it cannot code as an error, with nothing claimed', () => {
    const view = toResultView(
      analysisResult({
        verdict: { kind: 'suggestive', label: 'Crackles', confidence: 0.9, messageKey: 'x' },
      }),
    )

    expect(view.state).toBe('error')
    expect(view.confidencePercent).toBeUndefined()
    expect(view.conditionCode).toBeUndefined()
  })

  it('falls back to honest copy for a message key it does not know', () => {
    const view = toResultView(uncertainResult('verdict.somethingNewInAFutureModel'))
    expect(view.messageKey).toBe(VERDICT_FALLBACK_KEY)
  })
})
