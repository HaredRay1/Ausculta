import { describe, expect, it } from 'vitest'
import { notConnectedAnalyzeBuffer } from '../../../audio'
import { AI_STATUS, CLASSIFICATION_CODES } from '../../../db/codes'
import {
  MODEL_NOT_CONNECTED_MESSAGE_KEY,
  analysisFailureOutcome,
  classificationCodeForLabel,
  modelVersionOf,
  toAiOutcome,
} from './mapping'
import {
  TEST_MODEL,
  analysisResult,
  insufficientQualityResult,
  noAbnormalityResult,
  notConnectedResult,
  suggestiveResult,
  uncertainResult,
} from '../__tests__/fixtures'

describe('classificationCodeForLabel', () => {
  it('maps every label the registered model can emit to a stored code', () => {
    expect(TEST_MODEL.labels.map(classificationCodeForLabel)).toEqual([
      CLASSIFICATION_CODES.ASTHMA,
      CLASSIFICATION_CODES.BRONCHIOLITIS,
      CLASSIFICATION_CODES.HEALTHY,
      CLASSIFICATION_CODES.PNEUMONIA,
    ])
  })

  it('returns null for a label it cannot code rather than inventing one', () => {
    expect(classificationCodeForLabel('Crackles')).toBeNull()
  })
})

describe('modelVersionOf', () => {
  it('carries the model id and deploy version so a retrain is distinguishable', () => {
    expect(modelVersionOf(TEST_MODEL)).toBe('ei-disease-v5@5')
    expect(modelVersionOf({ ...TEST_MODEL, deployVersion: 6 })).toBe('ei-disease-v5@6')
  })
})

describe('toAiOutcome — verdict to aiStatus', () => {
  it('suggestive becomes ANALYZED with the classification code and confidence', () => {
    const outcome = toAiOutcome(suggestiveResult('Pneumonia', 0.82))

    expect(outcome.aiStatus).toBe(AI_STATUS.ANALYZED)
    expect(outcome.aiClassification).toBe(CLASSIFICATION_CODES.PNEUMONIA)
    expect(outcome.aiConfidence).toBeCloseTo(0.82, 6)
    expect(outcome.uncertainFlag).toBeUndefined()
    expect(outcome.modelVersion).toBe('ei-disease-v5@5')
    expect(outcome.perWindowResults?.windows).toHaveLength(2)
  })

  it('stores the code, never the display sentence', () => {
    const outcome = toAiOutcome(suggestiveResult('Asthma', 0.7))
    expect(outcome.aiClassification).toBe('ASTHMA')
  })

  it('refuses to store a suggestive finding whose label has no code', () => {
    const result = analysisResult({
      verdict: { kind: 'suggestive', label: 'Crackles', confidence: 0.9, messageKey: 'x' },
    })
    const outcome = toAiOutcome(result)

    expect(outcome.aiStatus).toBe(AI_STATUS.ERROR)
    expect(outcome.aiClassification).toBeUndefined()
    expect(outcome.aiConfidence).toBeUndefined()
  })

  it('no-abnormality becomes ANALYZED classified HEALTHY with the measured mean', () => {
    const outcome = toAiOutcome(noAbnormalityResult(0.74))

    expect(outcome.aiStatus).toBe(AI_STATUS.ANALYZED)
    expect(outcome.aiClassification).toBe(CLASSIFICATION_CODES.HEALTHY)
    expect(outcome.aiConfidence).toBeCloseTo(0.74, 6)
    expect(outcome.uncertainFlag).toBeUndefined()
  })

  it('no-abnormality without an aggregate stores no confidence at all', () => {
    const outcome = toAiOutcome(
      analysisResult({
        verdict: { kind: 'no-abnormality', messageKey: 'verdict.noAbnormality' },
        aggregate: null,
      }),
    )

    expect(outcome.aiStatus).toBe(AI_STATUS.ANALYZED)
    expect(outcome.aiClassification).toBe(CLASSIFICATION_CODES.HEALTHY)
    expect(outcome.aiConfidence).toBeUndefined()
  })

  it('uncertain becomes ANALYZED, flagged, with no classification and no number', () => {
    const outcome = toAiOutcome(uncertainResult())

    expect(outcome.aiStatus).toBe(AI_STATUS.ANALYZED)
    expect(outcome.uncertainFlag).toBe(true)
    expect(outcome.aiClassification).toBeUndefined()
    expect(outcome.aiConfidence).toBeUndefined()
  })

  it('insufficient-quality becomes INSUFFICIENT_QUALITY with nothing clinical stored', () => {
    const outcome = toAiOutcome(insufficientQualityResult())

    expect(outcome.aiStatus).toBe(AI_STATUS.INSUFFICIENT_QUALITY)
    expect(outcome.aiClassification).toBeUndefined()
    expect(outcome.aiConfidence).toBeUndefined()
    expect(outcome.uncertainFlag).toBeUndefined()
    expect(outcome.modelVersion).toBeUndefined()
    expect(outcome.perWindowResults).toBeUndefined()
  })

  it('the model-not-connected verdict becomes MODEL_NOT_CONNECTED, not ANALYZED', () => {
    const outcome = toAiOutcome(notConnectedResult())

    expect(outcome.aiStatus).toBe(AI_STATUS.MODEL_NOT_CONNECTED)
    expect(outcome.uncertainFlag).toBeUndefined()
    expect(outcome.aiClassification).toBeUndefined()
    expect(outcome.aiConfidence).toBeUndefined()
    expect(outcome.modelVersion).toBeUndefined()
  })

  it('pins the not-connected message key against the real audio module', async () => {
    const pcm = new Float32Array(16000 * 4)
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i / 7) * 4000

    const result = await notConnectedAnalyzeBuffer(pcm, 16000, { source: 'file-import' })

    expect(result.verdict.messageKey).toBe(MODEL_NOT_CONNECTED_MESSAGE_KEY)
    expect(toAiOutcome(result).aiStatus).toBe(AI_STATUS.MODEL_NOT_CONNECTED)
  })
})

describe('analysisFailureOutcome', () => {
  it('reports a missing model as MODEL_NOT_CONNECTED, never ERROR', () => {
    const outcome = analysisFailureOutcome(new Error('Failed to fetch the classifier worker'))

    expect(outcome.aiStatus).toBe(AI_STATUS.MODEL_NOT_CONNECTED)
    expect(outcome.aiClassification).toBeUndefined()
    expect(outcome.aiConfidence).toBeUndefined()
    expect(outcome.modelVersion).toBeUndefined()
  })
})
