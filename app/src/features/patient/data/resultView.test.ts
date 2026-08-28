import { describe, expect, it } from 'vitest'
import { RESULT_VERDICTS } from '../../../components'
import {
  AI_STATUS,
  CLASSIFICATION_CODES,
  LOCATION_CODES,
  REVIEW_STATUSES,
  type AiStatus,
} from '../../../db/codes'
import type { Assessment, Recording } from '../../../db/types'
import {
  patientResultState,
  summariseAssessment,
  toPatientRecordingView,
  viewRendersANumber,
} from './resultView'

function recording(overrides: Partial<Recording> = {}): Recording {
  return {
    id: 'rec-1',
    assessmentId: 'as-1',
    patientId: 'pt-1',
    locationCode: LOCATION_CODES.R_UPPER,
    audioBlobId: 'blob-1',
    audioSource: 'DEMO_FICTIONAL',
    importedSampleRate: 16000,
    bitDepth: 16,
    channels: 1,
    durationSec: 12,
    quality: null,
    aiStatus: AI_STATUS.ANALYZED,
    isDemo: 1,
    createdAt: '2026-08-01T01:30:00.000Z',
    ...overrides,
  }
}

function assessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: 'as-1',
    patientId: 'pt-1',
    assessorId: 'DEMO-STAFF-HW1',
    date: '2026-08-01T01:30:00.000Z',
    symptoms: [],
    vitals: [],
    reviewStatus: REVIEW_STATUSES.PENDING_REVIEW,
    interfaceLanguage: 'en',
    questionnaireLanguage: 'en',
    questionnaireVersion: 'v1',
    aiSeverity: {
      score: null,
      category: null,
      modelVersion: null,
      calculatedAt: null,
      thresholdConfigVersion: 1,
      status: 'MODEL_NOT_CONNECTED',
    },
    isDemo: 1,
    createdAt: '2026-08-01T01:30:00.000Z',
    ...overrides,
  }
}

describe('patientResultState', () => {
  it('names a condition only when the model analysed and classified one', () => {
    const view = toPatientRecordingView(
      recording({ aiClassification: CLASSIFICATION_CODES.ASTHMA, aiConfidence: 0.81 }),
    )
    expect(view.state).toBe('suggestive')
    expect(view.verdict).toBe(RESULT_VERDICTS.SUGGESTIVE)
    expect(view.conditionCode).toBe(CLASSIFICATION_CODES.ASTHMA)
    expect(view.confidencePercent).toBe(81)
  })

  it('treats a HEALTHY classification as "nothing unusual", never as a clean bill', () => {
    const view = toPatientRecordingView(
      recording({ aiClassification: CLASSIFICATION_CODES.HEALTHY, aiConfidence: 0.9 }),
    )
    expect(view.state).toBe('no-abnormality')
    expect(view.verdict).toBe(RESULT_VERDICTS.NO_ABNORMALITY_DETECTED)
    // The row stores a mean Healthy probability for research. Showing it would
    // read as "the app is 90% sure you are well", which nothing supports.
    expect(view.confidencePercent).toBeUndefined()
    expect(viewRendersANumber(view)).toBe(false)
  })

  it('reads an analysed-but-unnamed recording as uncertain', () => {
    expect(patientResultState(recording({ aiClassification: undefined }))).toBe('uncertain')
  })

  it('maps an unknown future ai status to error rather than guessing', () => {
    expect(patientResultState(recording({ aiStatus: 'SOMETHING_NEW' as AiStatus }))).toBe('error')
  })
})

describe('the no-number rule', () => {
  /**
   * The hard project rule, asserted at its enforcement point.
   *
   * Each case deliberately carries a confidence AND a classification on the
   * row — the shape a buggy writer, an older app version or a corrupted import
   * could plausibly produce — so the test proves the view withholds the number
   * rather than merely proving the fixture lacked one.
   */
  const degraded: { name: string; row: Recording }[] = [
    {
      name: 'model not connected',
      row: recording({
        aiStatus: AI_STATUS.MODEL_NOT_CONNECTED,
        aiClassification: CLASSIFICATION_CODES.ASTHMA,
        aiConfidence: 0.88,
      }),
    },
    {
      name: 'insufficient quality',
      row: recording({
        aiStatus: AI_STATUS.INSUFFICIENT_QUALITY,
        aiClassification: CLASSIFICATION_CODES.PNEUMONIA,
        aiConfidence: 0.77,
      }),
    },
    {
      name: 'uncertain',
      row: recording({
        uncertainFlag: true,
        aiClassification: CLASSIFICATION_CODES.ASTHMA,
        aiConfidence: 0.66,
      }),
    },
    {
      name: 'pending',
      row: recording({ aiStatus: AI_STATUS.PENDING, aiConfidence: 0.5 }),
    },
    {
      name: 'error',
      row: recording({ aiStatus: AI_STATUS.ERROR, aiConfidence: 0.5 }),
    },
  ]

  it.each(degraded)('$name renders no number and names no condition', ({ row }) => {
    const view = toPatientRecordingView(row)
    expect(view.confidencePercent).toBeUndefined()
    expect(view.conditionCode).toBeUndefined()
    expect(viewRendersANumber(view)).toBe(false)
  })

  it('withholds a confidence that is not a probability', () => {
    for (const bad of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const view = toPatientRecordingView(
        recording({ aiClassification: CLASSIFICATION_CODES.ASTHMA, aiConfidence: bad }),
      )
      expect(view.state).toBe('suggestive')
      expect(view.confidencePercent).toBeUndefined()
    }
  })

  it('claims no model version where no model ran', () => {
    for (const status of [
      AI_STATUS.MODEL_NOT_CONNECTED,
      AI_STATUS.INSUFFICIENT_QUALITY,
      AI_STATUS.PENDING,
    ]) {
      const view = toPatientRecordingView(recording({ aiStatus: status, modelVersion: 'v9' }))
      expect(view.modelVersion).toBeUndefined()
    }
  })
})

describe('summariseAssessment', () => {
  it('leads with the finding worth acting on, not the most common one', () => {
    const summary = summariseAssessment(assessment(), [
      recording({ id: 'a', aiClassification: CLASSIFICATION_CODES.HEALTHY, aiConfidence: 0.9 }),
      recording({ id: 'b', aiClassification: CLASSIFICATION_CODES.HEALTHY, aiConfidence: 0.9 }),
      recording({ id: 'c', aiClassification: CLASSIFICATION_CODES.HEALTHY, aiConfidence: 0.9 }),
      recording({ id: 'd', aiClassification: CLASSIFICATION_CODES.ASTHMA, aiConfidence: 0.7 }),
    ])
    expect(summary.dominantState).toBe('suggestive')
    expect(summary.counts['no-abnormality']).toBe(3)
    expect(summary.counts.suggestive).toBe(1)
  })

  it('does not summarise a mostly-unusable visit as "nothing unusual"', () => {
    const summary = summariseAssessment(assessment(), [
      recording({ id: 'a', aiClassification: CLASSIFICATION_CODES.HEALTHY, aiConfidence: 0.9 }),
      recording({ id: 'b', aiStatus: AI_STATUS.INSUFFICIENT_QUALITY }),
      recording({ id: 'c', aiStatus: AI_STATUS.INSUFFICIENT_QUALITY }),
    ])
    expect(summary.dominantState).toBe('insufficient-quality')
    expect(summary.usableCount).toBe(1)
    expect(summary.recordedCount).toBe(3)
  })

  it('reports no practitioner review while the visit is only pending one', () => {
    const pending = summariseAssessment(
      assessment({ reviewStatus: REVIEW_STATUSES.PENDING_REVIEW }),
      [recording()],
    )
    expect(pending.hasPractitionerReview).toBe(false)

    const reviewed = summariseAssessment(
      assessment({
        reviewStatus: REVIEW_STATUSES.APPROVED,
        practitionerSeverity: {
          interpretation: 'CONFIRMED',
          notes: 'Agreed.',
          reviewedAt: '2026-08-02T01:30:00.000Z',
        },
      }),
      [recording()],
    )
    expect(reviewed.hasPractitionerReview).toBe(true)
  })

  it('carries no severity of any kind', () => {
    const summary = summariseAssessment(
      assessment({
        aiSeverity: {
          score: 68,
          category: 'HIGH',
          modelVersion: 'x@1',
          calculatedAt: '2026-08-01T01:30:00.000Z',
          thresholdConfigVersion: 1,
          status: 'CALCULATED',
        },
      }),
      [recording()],
    )
    expect(JSON.stringify(summary)).not.toContain('68')
    expect(JSON.stringify(summary)).not.toContain('HIGH')
  })

  it('handles a visit with no recordings without inventing an outcome', () => {
    const summary = summariseAssessment(assessment(), [])
    expect(summary.dominantState).toBeNull()
    expect(summary.dominantVerdict).toBeNull()
    expect(summary.recordedCount).toBe(0)
  })
})
