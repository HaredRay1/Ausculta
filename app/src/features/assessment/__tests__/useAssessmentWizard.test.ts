import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeWav, DecodeError, WavParseError, type AnalysisResult } from '../../../audio'
import { AI_STATUS, LOCATION_CODES, REVIEW_STATUSES } from '../../../db/codes'
import type { LocationCode } from '../../../db/codes'
import { AuscultaDB } from '../../../db/db'
import type { AudioPort } from '../analysis/audioPort'
import { createAssessmentStore, type AssessmentStore } from '../data/assessmentStore'
import { useAssessmentWizard, type WizardInput } from '../useAssessmentWizard'
import {
  insufficientQualityResult,
  notConnectedResult,
  suggestiveResult,
  uncertainResult,
} from './fixtures'

let db: AuscultaDB
let store: AssessmentStore

const PATIENT = 'PT-4K7M-92XQ'
const ACTOR = 'user-1'

beforeEach(() => {
  db = new AuscultaDB(`ausculta-wizard-test-${crypto.randomUUID()}`)
  store = createAssessmentStore(db)
})

function wavFile(name = 'REC0001.WAV'): File {
  const pcm = new Int16Array(16000 * 4)
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i / 7) * 4000)
  return new File([encodeWav(pcm)], name, { type: 'audio/wav' })
}

/**
 * A stand-in for the audio module.
 *
 * The impulse is an 8 MB WASM download and nothing in the wizard's sequencing
 * depends on what it says, only on the shape of the verdict — so the real
 * module is exercised in analysis/pipeline.test.ts against the sample files,
 * and the flow is exercised here against fixed results.
 */
function fakeAudio(
  analysis: AnalysisResult = suggestiveResult(),
  precheck: AnalysisResult = suggestiveResult(),
): AudioPort & { analyze: ReturnType<typeof vi.fn> } {
  return {
    precheck: vi.fn(async () => precheck),
    analyze: vi.fn(async () => analysis),
  }
}

function setup(overrides: Partial<WizardInput> = {}) {
  const audio = overrides.audio ?? fakeAudio()
  const hook = renderHook(() =>
    useAssessmentWizard({
      patientId: PATIENT,
      assessmentId: null,
      actorId: ACTOR,
      interfaceLanguage: 'en',
      isDemo: 0,
      store,
      audio,
      readSkipGuide: async () => false,
      writeSkipGuide: async () => {},
      ...overrides,
    }),
  )
  return { ...hook, audio }
}

/** Walk from the opening screen to the recording check for one position. */
async function toQualityCheck(
  hook: ReturnType<typeof setup>,
  location: LocationCode = LOCATION_CODES.R_UPPER,
  file = wavFile(),
) {
  await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
  await act(async () => hook.result.current.start())
  await act(async () => hook.result.current.finishDeviceGuide(false))
  act(() => hook.result.current.chooseLocation(location))
  act(() => hook.result.current.confirmPlacement())
  await act(async () => hook.result.current.chooseFile(file))
}

describe('the wizard sequence', () => {
  it('walks patient -> guide -> position -> placement -> import -> check', async () => {
    const hook = setup()

    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
    await act(async () => hook.result.current.start())
    expect(hook.result.current.state.step).toBe('deviceGuide')
    expect(hook.result.current.state.assessmentId).not.toBeNull()

    await act(async () => hook.result.current.finishDeviceGuide(false))
    expect(hook.result.current.state.step).toBe('location')

    act(() => hook.result.current.chooseLocation(LOCATION_CODES.L_MIDDLE))
    expect(hook.result.current.state.step).toBe('placement')

    act(() => hook.result.current.confirmPlacement())
    expect(hook.result.current.state.step).toBe('capture')
  })

  it('persists the draft assessment before any recording is made', async () => {
    const hook = setup()
    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
    await act(async () => hook.result.current.start())

    const id = hook.result.current.state.assessmentId as string
    expect((await db.assessments.get(id))?.reviewStatus).toBe(REVIEW_STATUSES.DRAFT)
  })

  it('reads the patient name so the screen can confirm a person, not an id', async () => {
    await db.patients.add({
      id: PATIENT,
      studyId: 'ST-0000000000000000',
      assignedPractitionerIds: [],
      assignedHealthWorkerIds: [],
      consent: null,
      respiratoryHistory: [],
      familyHistory: [],
      preferredLanguage: 'en',
      isDemo: 0,
      createdAt: new Date().toISOString(),
      name: 'Juan Dela Cruz',
      birthDate: '1990-01-01',
      sex: 'MALE',
    })
    const hook = setup()

    await waitFor(() => expect(hook.result.current.state.patientName).toBe('Juan Dela Cruz'))
  })

  it('leaves the name null rather than inventing one when the record is missing', async () => {
    const hook = setup()
    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))

    expect(hook.result.current.state.patientName).toBeNull()
  })

  it('reuses the draft when the flow is re-entered, rather than orphaning it', async () => {
    // Back out of the position picker to the opening screen and start again —
    // which is exactly what someone navigating unaided does. Creating a second
    // draft here would strand every recording already attached to the first.
    const hook = setup()
    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
    await act(async () => hook.result.current.start())
    const first = hook.result.current.state.assessmentId

    await act(async () => hook.result.current.finishDeviceGuide(false))
    act(() => hook.result.current.goBack())
    expect(hook.result.current.state.step).toBe('patient')
    await act(async () => hook.result.current.start())

    expect(hook.result.current.state.assessmentId).toBe(first)
    expect(await db.assessments.count()).toBe(1)
  })

  it('keeps the recordings already taken when the flow is re-entered', async () => {
    const hook = setup()
    await toQualityCheck(hook, LOCATION_CODES.R_UPPER)
    await act(async () => hook.result.current.acceptQuality())
    act(() => hook.result.current.recordAnother())
    act(() => hook.result.current.goBack())
    await act(async () => hook.result.current.start())

    expect(hook.result.current.state.recordedLocations).toEqual([LOCATION_CODES.R_UPPER])
    expect(await db.recordings.count()).toBe(1)
  })

  it('skips the device guide when the health worker has turned it off', async () => {
    const hook = setup({ readSkipGuide: async () => true })
    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
    await act(async () => hook.result.current.start())

    expect(hook.result.current.state.step).toBe('location')
  })

  it('remembers "don\'t show this again"', async () => {
    const writeSkipGuide = vi.fn(async () => {})
    const hook = setup({ writeSkipGuide })
    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
    await act(async () => hook.result.current.start())
    await act(async () => hook.result.current.finishDeviceGuide(true))

    expect(writeSkipGuide).toHaveBeenCalledWith(true)
  })
})

describe('importing a recording', () => {
  it('shows the recording check once the file decodes', async () => {
    const hook = setup()
    await toQualityCheck(hook)

    expect(hook.result.current.state.step).toBe('quality')
    expect(hook.result.current.state.precheck).not.toBeNull()
    expect(hook.result.current.state.fileName).toBe('REC0001.WAV')
  })

  it('stays on the import screen and names the problem when the file is refused', async () => {
    const audio: AudioPort = {
      precheck: vi.fn(async () => {
        throw new WavParseError('unsupported-bit-depth', '24-bit')
      }),
      analyze: vi.fn(async () => suggestiveResult()),
    }
    const hook = setup({ audio })
    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
    await act(async () => hook.result.current.start())
    await act(async () => hook.result.current.finishDeviceGuide(false))
    act(() => hook.result.current.chooseLocation(LOCATION_CODES.R_UPPER))
    act(() => hook.result.current.confirmPlacement())
    await act(async () => hook.result.current.chooseFile(wavFile()))

    expect(hook.result.current.state.step).toBe('capture')
    expect(hook.result.current.state.importErrorKey).toBe('import.error.unsupported-bit-depth')
    expect(hook.result.current.state.precheck).toBeNull()
  })

  it('tells a too-long recording apart from an unreadable one', async () => {
    const audio: AudioPort = {
      precheck: vi.fn(async () => {
        throw new DecodeError('too-long', 'three minutes')
      }),
      analyze: vi.fn(async () => suggestiveResult()),
    }
    const hook = setup({ audio })
    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
    await act(async () => hook.result.current.start())
    await act(async () => hook.result.current.finishDeviceGuide(false))
    act(() => hook.result.current.chooseLocation(LOCATION_CODES.R_UPPER))
    act(() => hook.result.current.confirmPlacement())
    await act(async () => hook.result.current.chooseFile(wavFile()))

    expect(hook.result.current.state.importErrorKey).toBe('import.error.too-long')
  })
})

describe('analysing and saving', () => {
  it('saves the recording before the result is shown', async () => {
    const hook = setup()
    await toQualityCheck(hook)
    await act(async () => hook.result.current.acceptQuality())

    expect(hook.result.current.state.step).toBe('result')

    const rows = await db.recordings.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].locationCode).toBe(LOCATION_CODES.R_UPPER)
    expect(rows[0].aiStatus).toBe(AI_STATUS.ANALYZED)
    expect(rows[0].aiClassification).toBe('PNEUMONIA')
    // The imported file itself was kept.
    expect(rows[0].originalFileName).toBe('REC0001.WAV')
  })

  it('marks the position as recorded so the picker shows it', async () => {
    const hook = setup()
    await toQualityCheck(hook, LOCATION_CODES.L_LOWER)
    await act(async () => hook.result.current.acceptQuality())

    expect(hook.result.current.state.recordedLocations).toEqual([LOCATION_CODES.L_LOWER])
  })

  it('stores no classification for an uncertain result', async () => {
    const hook = setup({ audio: fakeAudio(uncertainResult()) })
    await toQualityCheck(hook)
    await act(async () => hook.result.current.acceptQuality())

    const row = (await db.recordings.toArray())[0]
    expect(row.aiStatus).toBe(AI_STATUS.ANALYZED)
    expect(row.uncertainFlag).toBe(true)
    expect(row.aiClassification).toBeUndefined()
    expect(row.aiConfidence).toBeUndefined()
  })

  it('stores an unusable recording without a finding, keeping the audio', async () => {
    const hook = setup({ audio: fakeAudio(insufficientQualityResult(), insufficientQualityResult()) })
    await toQualityCheck(hook)
    await act(async () => hook.result.current.acceptQuality())

    const row = (await db.recordings.toArray())[0]
    expect(row.aiStatus).toBe(AI_STATUS.INSUFFICIENT_QUALITY)
    expect(row.aiClassification).toBeUndefined()
    expect(row.aiConfidence).toBeUndefined()
    expect(await db.audioBlobs.get(row.audioBlobId)).toBeDefined()
  })

  it('stores MODEL_NOT_CONNECTED when there is no model, never a finding', async () => {
    const hook = setup({ audio: fakeAudio(notConnectedResult()) })
    await toQualityCheck(hook)
    await act(async () => hook.result.current.acceptQuality())

    const row = (await db.recordings.toArray())[0]
    expect(row.aiStatus).toBe(AI_STATUS.MODEL_NOT_CONNECTED)
    expect(row.aiClassification).toBeUndefined()
    expect(row.aiConfidence).toBeUndefined()
    expect(row.modelVersion).toBeUndefined()
  })
})

describe('resuming a half-finished assessment', () => {
  it('restores the positions already recorded and lands on the picker', async () => {
    const first = setup()
    await toQualityCheck(first, LOCATION_CODES.R_UPPER)
    await act(async () => first.result.current.acceptQuality())
    act(() => first.result.current.recordAnother())
    await act(async () => first.result.current.chooseLocation(LOCATION_CODES.L_MIDDLE))
    act(() => first.result.current.confirmPlacement())
    await act(async () => first.result.current.chooseFile(wavFile('REC0002.WAV')))
    await act(async () => first.result.current.acceptQuality())

    const assessmentId = first.result.current.state.assessmentId as string
    first.unmount()

    // A fresh mount, as if the app had been closed and reopened.
    const resumed = setup({ patientId: null, assessmentId })
    await waitFor(() => expect(resumed.result.current.state.step).toBe('location'))

    expect([...resumed.result.current.state.recordedLocations].sort()).toEqual(
      [LOCATION_CODES.L_MIDDLE, LOCATION_CODES.R_UPPER].sort(),
    )
    expect(resumed.result.current.state.patientId).toBe(PATIENT)
  })

  it('says so when the assessment is not on this device', async () => {
    const hook = setup({ patientId: null, assessmentId: 'no-such-assessment' })

    await waitFor(() => expect(hook.result.current.state.errorKey).toBe('error.notFound'))
    expect(hook.result.current.state.step).toBe('patient')
  })
})

describe('submitting', () => {
  it('sends the assessment for review', async () => {
    const hook = setup()
    await toQualityCheck(hook)
    await act(async () => hook.result.current.acceptQuality())
    act(() => hook.result.current.continueFromResult())
    await act(async () => hook.result.current.submit())

    expect(hook.result.current.state.step).toBe('submitted')
    const id = hook.result.current.state.assessmentId as string
    expect((await db.assessments.get(id))?.reviewStatus).toBe(REVIEW_STATUSES.PENDING_REVIEW)
  })

  it('reports a refused submission instead of pretending it worked', async () => {
    const hook = setup()
    await waitFor(() => expect(hook.result.current.state.step).toBe('patient'))
    await act(async () => hook.result.current.start())
    await act(async () => hook.result.current.finishDeviceGuide(false))
    // No recordings at all — the store refuses.
    await act(async () => hook.result.current.submit())

    expect(hook.result.current.state.step).not.toBe('submitted')
    expect(hook.result.current.state.errorKey).toBe('error.submitFailed')
  })
})
