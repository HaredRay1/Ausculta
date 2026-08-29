import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisResult } from '../../audio'
import type { LocationCode } from '../../db/codes'
import type { Measurement, SymptomEntry } from '../../db/types'
import { DEVICE_IMPORT_META, defaultAudioPort, type AudioPort } from './analysis/audioPort'
import { importErrorKey } from './analysis/importErrors'
import { runAnalysis } from './analysis/runAnalysis'
import {
  UNKNOWN_AUDIO_METADATA,
  assessmentStore as defaultStore,
  type AssessmentStore,
} from './data/assessmentStore'
import { getSkipDeviceGuide, setSkipDeviceGuide } from './data/preferences'

/**
 * The assessment wizard's state machine.
 *
 * Kept out of the screens entirely: each step component renders one screen and
 * calls back into here, so the sequence — and the rule that every step is
 * persisted before the next one appears — can be read and tested in one place.
 *
 * What is persisted, and when:
 * - the draft assessment when the flow starts, so `/assessment/:id` can resume;
 * - the recording when its analysis finishes, before the result is shown.
 * Closing the app therefore loses at most the position being imported right
 * now, never a completed one.
 */

export type WizardStep =
  | 'loading'
  | 'patient'
  | 'symptoms'
  | 'vitals'
  | 'deviceGuide'
  | 'location'
  | 'placement'
  | 'capture'
  | 'quality'
  | 'analysis'
  | 'result'
  | 'next'
  | 'submitted'

export interface WizardDeps {
  store?: AssessmentStore
  audio?: AudioPort
  /** Injectable for tests; defaults to the appMeta-backed preference. */
  readSkipGuide?: () => Promise<boolean>
  writeSkipGuide?: (value: boolean) => Promise<void>
}

export interface WizardInput extends WizardDeps {
  /** Chosen upstream. Required to start a new assessment. */
  patientId: string | null
  /** Present when resuming an existing assessment. */
  assessmentId: string | null
  actorId: string
  interfaceLanguage: string
  isDemo: 0 | 1
}

export interface WizardState {
  step: WizardStep
  assessmentId: string | null
  patientId: string | null
  locationCode: LocationCode | null
  fileName: string | null
  /** Decoded audio plus its quality report — set once the import succeeds. */
  precheck: AnalysisResult | null
  /** The analysed result the result screen renders. */
  analysis: AnalysisResult | null
  recordedLocations: LocationCode[]
  /**
   * The symptom answers as stored. An empty array means nothing has been
   * recorded — either the step was skipped or no question was put to the
   * patient. A code absent from it was never asked; see `../symptoms.ts`.
   */
  symptoms: SymptomEntry[]
  /** The vitals as stored. Empty is normal: the clinic may have no equipment. */
  vitals: Measurement[]
  /** The patient's name, once read. Null while unknown or not on this device. */
  patientName: string | null
  /** i18n key of the import failure, if the chosen file could not be read. */
  importErrorKey: string | null
  /** i18n key of a failure in this app rather than in the recording. */
  errorKey: string | null
  busy: boolean
  skipDeviceGuide: boolean
}

const INITIAL: WizardState = {
  step: 'loading',
  assessmentId: null,
  patientId: null,
  locationCode: null,
  fileName: null,
  precheck: null,
  analysis: null,
  recordedLocations: [],
  symptoms: [],
  vitals: [],
  patientName: null,
  importErrorKey: null,
  errorKey: null,
  busy: false,
  skipDeviceGuide: false,
}

export interface WizardApi {
  state: WizardState
  /**
   * The audio behind the current result, for playback.
   *
   * Read from the ref rather than the state (a File is a handle, not data), so
   * it is only meaningful on the screens that follow a successful import.
   */
  importedAudio: Blob | null
  start(): Promise<void>
  /**
   * Stores the symptom answers and moves on. An empty array is a legitimate
   * result — nothing about this step is required.
   */
  saveSymptoms(entries: SymptomEntry[]): Promise<void>
  /** Moves on without writing anything: the questions were not asked. */
  skipSymptoms(): void
  saveVitals(measurements: Measurement[]): Promise<void>
  skipVitals(): void
  finishDeviceGuide(dontShowAgain: boolean): Promise<void>
  chooseLocation(code: LocationCode): void
  confirmPlacement(): void
  chooseFile(file: File): Promise<void>
  clearFile(): void
  acceptQuality(): Promise<void>
  recordAgain(): void
  continueFromResult(): void
  recordAnother(): void
  submit(): Promise<void>
  goBack(): void
}

/** Where "Back" leads from each step. Null means the step has no way back. */
const BACK_TO: Partial<Record<WizardStep, WizardStep>> = {
  symptoms: 'patient',
  vitals: 'symptoms',
  deviceGuide: 'vitals',
  // Resuming lands straight here, so back leads to the questionnaire rather
  // than to the patient screen: symptoms and vitals can still be filled in on
  // a second visit to a half-finished assessment.
  location: 'vitals',
  placement: 'location',
  capture: 'placement',
  quality: 'capture',
  next: 'location',
}

export function useAssessmentWizard(input: WizardInput): WizardApi {
  const {
    store = defaultStore,
    audio = defaultAudioPort,
    readSkipGuide = getSkipDeviceGuide,
    writeSkipGuide = setSkipDeviceGuide,
    patientId,
    assessmentId,
    actorId,
    interfaceLanguage,
    isDemo,
  } = input

  /**
   * The injected collaborators, held in a ref and refreshed every render.
   *
   * They must NOT be effect or callback dependencies. A caller that passes an
   * inline `store={...}` or `readSkipGuide={async () => …}` creates a new
   * identity on every render, and the opening effect below would then re-run
   * forever — a render loop that a unit test surfaces as a hang and a phone
   * surfaces as a flat battery. Reading them through a ref keeps the effect
   * keyed on the only things that should reopen the flow: which assessment and
   * which patient.
   */
  const deps = useRef({ store, audio, readSkipGuide, writeSkipGuide })
  deps.current = { store, audio, readSkipGuide, writeSkipGuide }

  const [state, setState] = useState<WizardState>(INITIAL)
  /**
   * The chosen File itself.
   *
   * A `File` is a handle to bytes the browser owns, not serialisable state, but
   * the store must persist those exact bytes rather than a re-encode. Holding
   * it in a ref beside the state keeps `WizardState` a plain data object a test
   * can compare, without making the file a global.
   */
  const importedFile = useRef<File | null>(null)
  const patch = useCallback((next: Partial<WizardState>) => {
    setState((current) => ({ ...current, ...next }))
  }, [])

  // Open the flow: resume an existing assessment, or wait on the patient step
  // for a new one. Runs once per assessment id.
  useEffect(() => {
    let cancelled = false

    async function open() {
      const skipDeviceGuide = await deps.current.readSkipGuide()
      if (assessmentId === null) {
        if (cancelled) return
        patch({ step: 'patient', patientId, skipDeviceGuide })
        if (patientId !== null) {
          const patient = await deps.current.store.loadPatient(patientId)
          if (!cancelled) patch({ patientName: patient?.name ?? null })
        }
        return
      }

      const loaded = await deps.current.store.load(assessmentId)
      if (cancelled) return
      if (loaded === null) {
        patch({ step: 'patient', errorKey: 'error.notFound', skipDeviceGuide })
        return
      }
      // Resuming lands on the position picker with the completed positions
      // already marked, which is the only place the health worker can pick up.
      patch({
        step: 'location',
        assessmentId: loaded.assessment.id,
        patientId: loaded.assessment.patientId,
        recordedLocations: loaded.recordedLocations,
        // Carried through so stepping back into the questionnaire shows what
        // was already answered rather than a blank form.
        symptoms: loaded.assessment.symptoms,
        vitals: loaded.assessment.vitals,
        skipDeviceGuide,
      })
      const patient = await deps.current.store.loadPatient(loaded.assessment.patientId)
      if (!cancelled) patch({ patientName: patient?.name ?? null })
    }

    void open()
    return () => {
      cancelled = true
    }
  }, [assessmentId, patientId, patch])

  const start = useCallback(async () => {
    if (patientId === null) return

    // Backing out to this screen and pressing Start again is ordinary
    // navigation, not a request for a second assessment. Creating one here
    // would strand every recording already attached to the first — and leave
    // the wizard pointing at an empty draft that cannot be submitted, while
    // the position picker still showed those positions as recorded.
    if (state.assessmentId !== null) {
      patch({ step: 'symptoms', errorKey: null })
      return
    }

    patch({ busy: true, errorKey: null })
    try {
      const assessment = await deps.current.store.createDraft({
        patientId,
        assessorId: actorId,
        interfaceLanguage,
        isDemo,
      })
      // The interview comes before the stethoscope: a health worker asks what
      // is wrong, then listens. Both questionnaire steps are skippable.
      patch({ assessmentId: assessment.id, step: 'symptoms', busy: false })
    } catch {
      patch({ busy: false, errorKey: 'error.saveFailed' })
    }
  }, [actorId, interfaceLanguage, isDemo, patch, patientId, state.assessmentId])

  /** Where the flow goes once the questionnaire is behind it. */
  const afterQuestionnaire = useCallback(
    () => (state.skipDeviceGuide ? 'location' : 'deviceGuide'),
    [state.skipDeviceGuide],
  )

  const saveSymptoms = useCallback(
    async (entries: SymptomEntry[]) => {
      const currentAssessmentId = state.assessmentId
      if (currentAssessmentId === null) return
      patch({ busy: true, errorKey: null })
      try {
        await deps.current.store.saveSymptoms(currentAssessmentId, entries, actorId)
        patch({ busy: false, symptoms: entries, step: 'vitals' })
      } catch {
        // Stay put with the answers still on screen. Moving on would silently
        // lose an interview the health worker has just conducted.
        patch({ busy: false, errorKey: 'error.saveFailed' })
      }
    },
    [actorId, patch, state.assessmentId],
  )

  const skipSymptoms = useCallback(() => patch({ step: 'vitals', errorKey: null }), [patch])

  const saveVitals = useCallback(
    async (measurements: Measurement[]) => {
      const currentAssessmentId = state.assessmentId
      if (currentAssessmentId === null) return
      patch({ busy: true, errorKey: null })
      try {
        await deps.current.store.saveVitals(currentAssessmentId, measurements, actorId)
        patch({ busy: false, vitals: measurements, step: afterQuestionnaire() })
      } catch {
        patch({ busy: false, errorKey: 'error.saveFailed' })
      }
    },
    [actorId, afterQuestionnaire, patch, state.assessmentId],
  )

  const skipVitals = useCallback(
    () => patch({ step: afterQuestionnaire(), errorKey: null }),
    [afterQuestionnaire, patch],
  )

  const finishDeviceGuide = useCallback(
    async (dontShowAgain: boolean) => {
      if (dontShowAgain) await deps.current.writeSkipGuide(true)
      patch({ step: 'location', skipDeviceGuide: dontShowAgain || state.skipDeviceGuide })
    },
    [patch, state.skipDeviceGuide],
  )

  const chooseLocation = useCallback(
    (code: LocationCode) => {
      importedFile.current = null
      patch({
        step: 'placement',
        locationCode: code,
        // A new position starts clean: nothing from the last one may leak into
        // the next recording's screens.
        fileName: null,
        precheck: null,
        analysis: null,
        importErrorKey: null,
      })
    },
    [patch],
  )

  const confirmPlacement = useCallback(() => patch({ step: 'capture' }), [patch])

  const chooseFile = useCallback(
    async (file: File) => {
      patch({ busy: true, importErrorKey: null, fileName: file.name })
      try {
        const precheck = await deps.current.audio.precheck(file, {
          ...DEVICE_IMPORT_META,
          originalMime: file.type || DEVICE_IMPORT_META.originalMime,
        })
        importedFile.current = file
        patch({ busy: false, precheck, step: 'quality' })
      } catch (error) {
        importedFile.current = null
        patch({ busy: false, importErrorKey: importErrorKey(error), precheck: null })
      }
    },
    [patch],
  )

  const clearFile = useCallback(() => {
    importedFile.current = null
    patch({ fileName: null, precheck: null, importErrorKey: null })
  }, [patch])

  const acceptQuality = useCallback(async () => {
    const precheck = state.precheck
    const locationCode = state.locationCode
    const currentAssessmentId = state.assessmentId
    if (precheck === null || locationCode === null || currentAssessmentId === null) return

    patch({ step: 'analysis', busy: true, errorKey: null })
    const analysis = await runAnalysis(precheck, deps.current.audio)

    try {
      await deps.current.store.saveRecording({
        assessmentId: currentAssessmentId,
        patientId: state.patientId ?? '',
        locationCode,
        actorId,
        originalFile: importedFile.current,
        result: analysis,
        ...UNKNOWN_AUDIO_METADATA,
        isDemo,
      })
    } catch {
      patch({ step: 'quality', busy: false, errorKey: 'error.saveFailed' })
      return
    }

    setState((current) => ({
      ...current,
      step: 'result',
      busy: false,
      analysis,
      recordedLocations: current.recordedLocations.includes(locationCode)
        ? current.recordedLocations
        : [...current.recordedLocations, locationCode],
    }))
  }, [actorId, isDemo, patch, state])

  const recordAgain = useCallback(() => {
    importedFile.current = null
    patch({
      step: 'capture',
      fileName: null,
      precheck: null,
      analysis: null,
      importErrorKey: null,
    })
  }, [patch])

  const continueFromResult = useCallback(() => patch({ step: 'next' }), [patch])

  const recordAnother = useCallback(() => {
    importedFile.current = null
    patch({
      step: 'location',
      locationCode: null,
      fileName: null,
      precheck: null,
      analysis: null,
      importErrorKey: null,
      errorKey: null,
    })
  }, [patch])

  const submit = useCallback(async () => {
    if (state.assessmentId === null) return
    patch({ busy: true, errorKey: null })
    try {
      await deps.current.store.submit(state.assessmentId, actorId)
      patch({ step: 'submitted', busy: false })
    } catch {
      patch({ busy: false, errorKey: 'error.submitFailed' })
    }
  }, [actorId, patch, state.assessmentId])

  const goBack = useCallback(() => {
    const target = BACK_TO[state.step]
    if (target !== undefined) patch({ step: target, errorKey: null })
  }, [patch, state.step])

  return useMemo(
    () => ({
      state,
      importedAudio: importedFile.current,
      start,
      saveSymptoms,
      skipSymptoms,
      saveVitals,
      skipVitals,
      finishDeviceGuide,
      chooseLocation,
      confirmPlacement,
      chooseFile,
      clearFile,
      acceptQuality,
      recordAgain,
      continueFromResult,
      recordAnother,
      submit,
      goBack,
    }),
    [
      acceptQuality,
      chooseFile,
      chooseLocation,
      clearFile,
      confirmPlacement,
      continueFromResult,
      finishDeviceGuide,
      goBack,
      recordAgain,
      recordAnother,
      saveSymptoms,
      saveVitals,
      skipSymptoms,
      skipVitals,
      start,
      state,
      submit,
    ],
  )
}
