import { describe, expect, it } from 'vitest'
import { RESULT_VERDICTS } from '../../components'
import { AI_STATUS, AUDIO_SOURCES, CLASSIFICATION_CODES, LOCATION_CODES } from '../../db/codes'
import type { Recording } from '../../db/types'
import { aiFindingFor } from './aiFinding'

function recording(overrides: Partial<Recording> = {}): Recording {
  return {
    id: 'rec-1',
    assessmentId: 'asm-1',
    patientId: 'PT-0001-0001',
    locationCode: LOCATION_CODES.R_UPPER,
    audioBlobId: 'blob-1',
    audioSource: AUDIO_SOURCES.DEVICE_WAV_IMPORT,
    importedSampleRate: 16000,
    bitDepth: 16,
    channels: 1,
    durationSec: 20,
    quality: null,
    aiStatus: AI_STATUS.ANALYZED,
    aiClassification: CLASSIFICATION_CODES.ASTHMA,
    aiConfidence: 0.82,
    uncertainFlag: false,
    modelVersion: 'impulse-1-v5',
    isDemo: 0,
    createdAt: '2026-08-20T09:00:00.000Z',
    ...overrides,
  }
}

describe('a decided finding', () => {
  it('names the pattern and shows the confidence', () => {
    const finding = aiFindingFor(recording())
    expect(finding.state).toBe('suggestive')
    expect(finding.verdict).toBe(RESULT_VERDICTS.SUGGESTIVE)
    expect(finding.classificationCode).toBe(CLASSIFICATION_CODES.ASTHMA)
    expect(finding.confidencePercent).toBe(82)
    expect(finding.modelVersion).toBe('impulse-1-v5')
  })

  it('treats HEALTHY as no abnormality and names nothing', () => {
    const finding = aiFindingFor(recording({ aiClassification: CLASSIFICATION_CODES.HEALTHY }))
    expect(finding.state).toBe('no-abnormality')
    expect(finding.verdict).toBe(RESULT_VERDICTS.NO_ABNORMALITY_DETECTED)
    expect(finding.classificationCode).toBeUndefined()
  })

  it('still shows a confidence for a clear result', () => {
    // The clinician-facing difference from the patient view: a clinician told
    // the model was 54% sure of a clear result learns something real.
    const finding = aiFindingFor(
      recording({ aiClassification: CLASSIFICATION_CODES.HEALTHY, aiConfidence: 0.54 }),
    )
    expect(finding.confidencePercent).toBe(54)
  })

  it('rounds to whole percent, never a decimal', () => {
    expect(aiFindingFor(recording({ aiConfidence: 0.7149 })).confidencePercent).toBe(71)
  })

  it('clamps a confidence outside 0..1 rather than rendering nonsense', () => {
    expect(aiFindingFor(recording({ aiConfidence: 1.4 })).confidencePercent).toBe(100)
    expect(aiFindingFor(recording({ aiConfidence: -0.2 })).confidencePercent).toBe(0)
  })
})

describe('states where nothing was decided', () => {
  const degraded: Array<[string, Partial<Recording>]> = [
    ['insufficient quality', { aiStatus: AI_STATUS.INSUFFICIENT_QUALITY }],
    ['model not connected', { aiStatus: AI_STATUS.MODEL_NOT_CONNECTED }],
    ['error', { aiStatus: AI_STATUS.ERROR }],
    ['pending', { aiStatus: AI_STATUS.PENDING }],
    ['analysed but no classification', { aiClassification: undefined }],
    ['flagged uncertain by the model', { uncertainFlag: true }],
  ]

  it.each(degraded)('names no condition and shows no number: %s', (_label, overrides) => {
    // A number in a degraded state is the failure this module exists to
    // prevent: it reads as a measurement when nothing was measured.
    const finding = aiFindingFor(recording(overrides))
    expect(finding.classificationCode).toBeUndefined()
    expect(finding.confidencePercent).toBeUndefined()
  })

  it('gives insufficient quality its own verdict, not uncertainty', () => {
    const finding = aiFindingFor(recording({ aiStatus: AI_STATUS.INSUFFICIENT_QUALITY }))
    expect(finding.state).toBe('insufficient-quality')
    expect(finding.verdict).toBe(RESULT_VERDICTS.INSUFFICIENT_QUALITY)
  })

  it('has no verdict at all for the three non-verdict states', () => {
    for (const status of [AI_STATUS.MODEL_NOT_CONNECTED, AI_STATUS.ERROR, AI_STATUS.PENDING]) {
      expect(aiFindingFor(recording({ aiStatus: status })).verdict).toBeNull()
    }
  })

  it('treats an unrecognised status from an older build as not analysed', () => {
    const finding = aiFindingFor(recording({ aiStatus: 'SOMETHING_NEW' as never }))
    expect(finding.state).toBe('not-analysed')
    expect(finding.verdict).toBeNull()
    expect(finding.confidencePercent).toBeUndefined()
  })

  it('withholds a number when the stored confidence is not a number', () => {
    expect(aiFindingFor(recording({ aiConfidence: NaN })).confidencePercent).toBeUndefined()
    expect(
      aiFindingFor(recording({ aiConfidence: undefined })).confidencePercent,
    ).toBeUndefined()
  })
})
