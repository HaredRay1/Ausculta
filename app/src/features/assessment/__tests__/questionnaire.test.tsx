import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeWav } from '../../../audio'
import { LOCATION_CODES, MEASUREMENT_CODES, MEASUREMENT_SOURCES, REVIEW_STATUSES } from '../../../db/codes'
import { AuscultaDB } from '../../../db/db'
import type { Measurement } from '../../../db/types'
import { createAssessmentStore, type AssessmentStore } from '../data/assessmentStore'
import { SymptomsStep } from '../steps/SymptomsStep'
import { VitalsStep } from '../steps/VitalsStep'
import { toSymptomEntries, emptySymptomDraft } from '../symptoms'
import { emptyVitalsDraft, toMeasurements, validateVitals } from '../vitals'
import { useAssessmentWizard, type WizardInput } from '../useAssessmentWizard'
import { suggestiveResult } from './fixtures'
import '../i18n'

/**
 * The two rules a validator would notice being broken, and the ones that
 * corrupt the research record silently if they are:
 *
 * - a symptom nobody asked about is ABSENT, never `present: false`;
 * - an assessment with no vitals at all is complete and submits.
 */

const PATIENT = 'PT-4K7M-92XQ'
const ACTOR = 'user-1'

let db: AuscultaDB
let store: AssessmentStore

afterEach(cleanup)

beforeEach(() => {
  db = new AuscultaDB(`ausculta-questionnaire-${crypto.randomUUID()}`)
  store = createAssessmentStore(db)
})

function symptomGroup(name: string) {
  return within(screen.getByRole('group', { name }))
}

describe('symptom answers, as data', () => {
  it('leaves a question nobody asked out of the array entirely', () => {
    const draft = emptySymptomDraft()
    draft.COUGH = { ...draft.COUGH, present: true }
    draft.FEVER = { ...draft.FEVER, present: false }

    const entries = toSymptomEntries(draft)

    // Two answers out of twelve questions. The other ten are not "no".
    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.code)).toEqual(['COUGH', 'FEVER'])
    expect(entries.find((entry) => entry.code === 'PHLEGM')).toBeUndefined()
  })

  it('never invents a present: false for an untouched question', () => {
    expect(toSymptomEntries(emptySymptomDraft())).toEqual([])
  })

  it('keeps detail on a yes and drops it from a no', () => {
    const draft = emptySymptomDraft()
    draft.COUGH = {
      present: true,
      severityCode: 'MODERATE',
      durationDays: '4',
      frequencyCode: 'PERSISTENT',
      notes: 'worse at night',
    }
    // Detail typed before the answer was switched to "no" must not survive: a
    // severity on a denied symptom reads as a contradiction to a reviewer.
    draft.FEVER = {
      present: false,
      severityCode: 'SEVERE',
      durationDays: '9',
      frequencyCode: 'OCCASIONAL',
      notes: '',
    }

    const [cough, fever] = toSymptomEntries(draft)
    expect(cough).toEqual({
      code: 'COUGH',
      present: true,
      severityCode: 'MODERATE',
      durationDays: 4,
      frequencyCode: 'PERSISTENT',
      notes: 'worse at night',
    })
    expect(fever).toEqual({ code: 'FEVER', present: false })
  })
})

describe('the symptoms screen', () => {
  it('stores only the questions that were answered', () => {
    const onContinue = vi.fn()
    render(
      <SymptomsStep value={[]} busy={false} errorKey={null} onContinue={onContinue} onSkip={vi.fn()} />,
    )

    fireEvent.click(symptomGroup('Cough').getByRole('radio', { name: 'Yes' }))
    fireEvent.click(symptomGroup('Fever').getByRole('radio', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))

    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(onContinue.mock.calls[0][0]).toEqual([
      { code: 'COUGH', present: true },
      { code: 'FEVER', present: false },
    ])
  })

  it('asks all twelve symptoms', () => {
    render(<SymptomsStep value={[]} busy={false} errorKey={null} onContinue={vi.fn()} onSkip={vi.fn()} />)

    expect(screen.getAllByRole('radio', { name: 'Yes' })).toHaveLength(12)
    expect(screen.getByRole('group', { name: 'Coughing up blood' })).toBeInTheDocument()
  })

  it('says plainly that it is not a diagnosis', () => {
    render(<SymptomsStep value={[]} busy={false} errorKey={null} onContinue={vi.fn()} onSkip={vi.fn()} />)

    expect(screen.getByText(/never a diagnosis/i)).toBeInTheDocument()
  })

  it('can be skipped without storing anything', () => {
    const onContinue = vi.fn()
    const onSkip = vi.fn()
    render(
      <SymptomsStep value={[]} busy={false} errorKey={null} onContinue={onContinue} onSkip={onSkip} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /skip the symptom questions/i }))

    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onContinue).not.toHaveBeenCalled()
  })

  it('refuses a duration that is not a number, beneath that field', () => {
    const onContinue = vi.fn()
    render(
      <SymptomsStep value={[]} busy={false} errorKey={null} onContinue={onContinue} onSkip={vi.fn()} />,
    )

    fireEvent.click(symptomGroup('Cough').getByRole('radio', { name: 'Yes' }))
    fireEvent.change(screen.getByLabelText(/how many days/i), { target: { value: 'a while' } })
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))

    expect(onContinue).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/whole number/i)
  })

  it('shows the answers again when the step is revisited', () => {
    render(
      <SymptomsStep
        value={[{ code: 'FEVER', present: true, severityCode: 'MILD' }]}
        busy={false}
        errorKey={null}
        onContinue={vi.fn()}
        onSkip={vi.fn()}
      />,
    )

    expect(symptomGroup('Fever').getByRole('radio', { name: 'Yes' })).toBeChecked()
    expect(symptomGroup('Cough').getByRole('radio', { name: 'Yes' })).not.toBeChecked()
    expect(symptomGroup('Cough').getByRole('radio', { name: 'No' })).not.toBeChecked()
  })
})

describe('vital-sign validation', () => {
  it('accepts the readings of a patient in distress', () => {
    const draft = {
      ...emptyVitalsDraft(),
      SPO2: '78',
      RESP_RATE_MANUAL: '38',
      HEART_RATE: '148',
      TEMP: '39.8',
      BP_SYS: '86',
      BP_DIA: '52',
    }

    expect(validateVitals(draft)).toEqual({})
    expect(toMeasurements(draft, { enteredBy: ACTOR, enteredAt: 'now' })).toHaveLength(6)
  })

  it('refuses the impossible', () => {
    const errors = validateVitals({
      ...emptyVitalsDraft(),
      TEMP: '200',
      HEART_RATE: '900',
      SPO2: '140',
    })

    expect(errors.TEMP?.key).toBe('vitals.error.range')
    expect(errors.HEART_RATE?.key).toBe('vitals.error.range')
    expect(errors.SPO2?.key).toBe('vitals.error.range')
  })

  it('treats an empty form as valid and stores nothing', () => {
    const draft = emptyVitalsDraft()
    expect(validateVitals(draft)).toEqual({})
    expect(toMeasurements(draft, { enteredBy: ACTOR, enteredAt: 'now' })).toEqual([])
  })

  it('refuses half a blood pressure, and a diastolic above the systolic', () => {
    expect(validateVitals({ ...emptyVitalsDraft(), BP_SYS: '120' }).BP_DIA?.key).toBe(
      'vitals.error.bpNeedsDiastolic',
    )
    expect(validateVitals({ ...emptyVitalsDraft(), BP_DIA: '80' }).BP_SYS?.key).toBe(
      'vitals.error.bpNeedsSystolic',
    )
    expect(validateVitals({ ...emptyVitalsDraft(), BP_SYS: '80', BP_DIA: '120' }).BP_DIA?.key).toBe(
      'vitals.error.bpOrder',
    )
  })

  it('writes every reading as a manual entry, with who and when', () => {
    const measurements = toMeasurements(
      { ...emptyVitalsDraft(), SPO2: '95' },
      { enteredBy: ACTOR, enteredAt: '2026-01-01T00:00:00.000Z' },
    )

    expect(measurements[0]).toEqual({
      code: MEASUREMENT_CODES.SPO2,
      value: 95,
      unit: '%',
      source: MEASUREMENT_SOURCES.MANUAL_ENTRY,
      enteredBy: ACTOR,
      enteredAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('never produces an auscultation-derived respiratory rate', () => {
    const measurements = toMeasurements(
      { ...emptyVitalsDraft(), RESP_RATE_MANUAL: '22' },
      { enteredBy: ACTOR, enteredAt: 'now' },
    )

    expect(measurements.map((measurement) => measurement.code)).toEqual([
      MEASUREMENT_CODES.RESP_RATE_MANUAL,
    ])
    expect(
      measurements.some((measurement) => measurement.code === MEASUREMENT_CODES.RESP_RATE_AUSC_DERIVED),
    ).toBe(false)
    expect(measurements.every((m) => m.source === MEASUREMENT_SOURCES.MANUAL_ENTRY)).toBe(true)
  })
})

describe('the vitals screen', () => {
  function renderVitals() {
    const onContinue = vi.fn()
    const onSkip = vi.fn()
    render(
      <VitalsStep
        value={[]}
        enteredBy={ACTOR}
        busy={false}
        errorKey={null}
        onContinue={onContinue}
        onSkip={onSkip}
      />,
    )
    return { onContinue, onSkip }
  }

  it('saves an assessment with no vitals at all', () => {
    const props = renderVitals()

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))

    expect(props.onContinue).toHaveBeenCalledWith([])
  })

  it('can be skipped outright', () => {
    const props = renderVitals()

    fireEvent.click(screen.getByRole('button', { name: /skip the vital signs/i }))

    expect(props.onSkip).toHaveBeenCalledTimes(1)
    expect(props.onContinue).not.toHaveBeenCalled()
  })

  it('names the problem beneath the field for an impossible temperature', () => {
    const props = renderVitals()

    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))

    expect(props.onContinue).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/between 25 and 45/i)
  })

  it('accepts an abnormal but real reading without arguing', () => {
    const props = renderVitals()

    fireEvent.change(screen.getByLabelText(/oxygen saturation/i), { target: { value: '78' } })
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))

    expect(props.onContinue).toHaveBeenCalledTimes(1)
    expect(props.onContinue.mock.calls[0][0][0]).toMatchObject({
      code: 'SPO2',
      value: 78,
      source: 'MANUAL_ENTRY',
      enteredBy: ACTOR,
    })
  })

  it('shows where an entered value came from', () => {
    renderVitals()

    // The SourceBadge wording, so a reviewer never has to guess whether a
    // person measured the number or the device produced it.
    expect(screen.queryByText(/typed in by a person/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/oxygen saturation/i), { target: { value: '95' } })
    expect(screen.getByText(/typed in by a person/i)).toBeInTheDocument()
  })

  it('offers no box for an auscultation-derived respiratory rate', () => {
    renderVitals()

    expect(screen.getByLabelText(/respiratory rate \(manual\)/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/auscultation-derived/i)).not.toBeInTheDocument()
  })
})

describe('storing the questionnaire', () => {
  async function draft() {
    return store.createDraft({
      patientId: PATIENT,
      assessorId: ACTOR,
      interfaceLanguage: 'en',
      isDemo: 0,
    })
  }

  it('stores the answers given and nothing for the questions skipped', async () => {
    const assessment = await draft()
    await store.saveSymptoms(
      assessment.id,
      [
        { code: 'COUGH', present: true, severityCode: 'MILD' },
        { code: 'FEVER', present: false },
      ],
      ACTOR,
    )

    const stored = await db.assessments.get(assessment.id)
    expect(stored?.symptoms).toHaveLength(2)
    expect(stored?.symptoms.map((symptom) => symptom.code)).toEqual(['COUGH', 'FEVER'])
    // And the version of the question set that produced them.
    expect(stored?.questionnaireVersion).toBe('symptoms-v1')
  })

  it('leaves an auscultation-derived measurement untouched when manual vitals are saved', async () => {
    const assessment = await draft()
    const derived: Measurement = {
      code: MEASUREMENT_CODES.RESP_RATE_AUSC_DERIVED,
      value: 19,
      unit: 'breaths/min',
      source: MEASUREMENT_SOURCES.AUSCULTATION_DERIVED,
      enteredBy: 'device',
      enteredAt: '2026-01-01T00:00:00.000Z',
    }
    await db.assessments.put({ ...assessment, vitals: [derived] })

    await store.saveVitals(
      assessment.id,
      [
        {
          code: MEASUREMENT_CODES.RESP_RATE_MANUAL,
          value: 30,
          unit: 'breaths/min',
          source: MEASUREMENT_SOURCES.MANUAL_ENTRY,
          enteredBy: ACTOR,
          enteredAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      ACTOR,
    )

    const stored = await db.assessments.get(assessment.id)
    // Two separate measurements. Neither replaced the other.
    expect(stored?.vitals).toHaveLength(2)
    expect(stored?.vitals.find((v) => v.code === MEASUREMENT_CODES.RESP_RATE_AUSC_DERIVED)).toEqual(
      derived,
    )
    expect(stored?.vitals.find((v) => v.code === MEASUREMENT_CODES.RESP_RATE_MANUAL)?.value).toBe(30)
  })

  it('refuses to let a derived source in through the manual form', async () => {
    const assessment = await draft()
    await store.saveVitals(
      assessment.id,
      [
        {
          code: MEASUREMENT_CODES.RESP_RATE_AUSC_DERIVED,
          value: 40,
          unit: 'breaths/min',
          source: MEASUREMENT_SOURCES.AUSCULTATION_DERIVED,
          enteredBy: ACTOR,
          enteredAt: 'now',
        },
      ],
      ACTOR,
    )

    expect((await db.assessments.get(assessment.id))?.vitals).toEqual([])
  })
})

describe('the flow with neither symptoms nor vitals', () => {
  function wavFile(): File {
    const pcm = new Int16Array(16000 * 4)
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i / 7) * 4000)
    return new File([encodeWav(pcm)], 'REC0001.WAV', { type: 'audio/wav' })
  }

  function setup(overrides: Partial<WizardInput> = {}) {
    return renderHook(() =>
      useAssessmentWizard({
        patientId: PATIENT,
        assessmentId: null,
        actorId: ACTOR,
        interfaceLanguage: 'en',
        isDemo: 0,
        store,
        audio: { precheck: vi.fn(async () => suggestiveResult()), analyze: vi.fn(async () => suggestiveResult()) },
        readSkipGuide: async () => true,
        writeSkipGuide: async () => {},
        ...overrides,
      }),
    )
  }

  it('submits an assessment where both steps were skipped', async () => {
    const hook = setup()
    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
    await act(async () => hook.result.current.start())

    act(() => hook.result.current.skipSymptoms())
    act(() => hook.result.current.skipVitals())
    expect(hook.result.current.state.step).toBe('location')

    act(() => hook.result.current.chooseLocation(LOCATION_CODES.R_UPPER))
    act(() => hook.result.current.confirmPlacement())
    await act(async () => hook.result.current.chooseFile(wavFile()))
    await act(async () => hook.result.current.acceptQuality())
    act(() => hook.result.current.continueFromResult())
    await act(async () => hook.result.current.submit())

    expect(hook.result.current.state.step).toBe('submitted')
    const stored = await db.assessments.get(hook.result.current.state.assessmentId as string)
    expect(stored?.reviewStatus).toBe(REVIEW_STATUSES.PENDING_REVIEW)
    expect(stored?.symptoms).toEqual([])
    expect(stored?.vitals).toEqual([])
    // Nothing was asked, so the questionnaire version stays honest.
    expect(stored?.questionnaireVersion).toBe('not-asked')
  })

  it('carries answers through to the stored assessment when they are given', async () => {
    const hook = setup()
    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
    await act(async () => hook.result.current.start())

    await act(async () =>
      hook.result.current.saveSymptoms([{ code: 'COUGH', present: true, durationDays: 3 }]),
    )
    expect(hook.result.current.state.step).toBe('vitals')

    await act(async () =>
      hook.result.current.saveVitals([
        {
          code: MEASUREMENT_CODES.SPO2,
          value: 88,
          unit: '%',
          source: MEASUREMENT_SOURCES.MANUAL_ENTRY,
          enteredBy: ACTOR,
          enteredAt: '2026-02-01T00:00:00.000Z',
        },
      ]),
    )
    expect(hook.result.current.state.step).toBe('location')

    const stored = await db.assessments.get(hook.result.current.state.assessmentId as string)
    expect(stored?.symptoms).toEqual([{ code: 'COUGH', present: true, durationDays: 3 }])
    expect(stored?.vitals[0]?.value).toBe(88)
    expect(stored?.vitals[0]?.source).toBe(MEASUREMENT_SOURCES.MANUAL_ENTRY)
  })
})
