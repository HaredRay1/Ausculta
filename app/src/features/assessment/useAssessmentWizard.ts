import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisResult } from '../../audio'
import type { LocationCode } from '../../db/codes'
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
  deviceGuide: 'patient',
  location: 'patient',
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
      const skipDeviceGuide = await readSkipGuide()
      if (assessmentId === null) {
        if (!cancelled) patch({ step: 'patient', patientId, skipDeviceGuide })
        return
      }

      const loaded = await store.load(assessmentId)
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
        skipDeviceGuide,
      })
    }

    void open()
    return () => {
      cancelled = true
    }
  }, [assessmentId, patientId, patch, readSkipGuide, store])

  const start = useCallback(async () => {
    if (patientId === null) return
    patch({ busy: true, errorKey: null })
    try {
      const assessment = await store.createDraft({
        patientId,
        assessorId: actorId,
        interfaceLanguage,
        isDemo,
      })
      patch({
        assessmentId: assessment.id,
        step: state.skipDeviceGuide ? 'location' : 'deviceGuide',
        busy: false,
      })
    } catch {
      patch({ busy: false, errorKey: 'error.saveFailed' })
    }
  }, [actorId, interfaceLanguage, isDemo, patch, patientId, state.skipDeviceGuide, store])

  const finishDeviceGuide = useCallback(
    async (dontShowAgain: boolean) => {
      if (dontShowAgain) await writeSkipGuide(true)
      patch({ step: 'location', skipDeviceGuide: dontShowAgain || state.skipDeviceGuide })
    },
    [patch, state.skipDeviceGuide, writeSkipGuide],
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
        const precheck = await audio.precheck(file, {
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
    [audio, patch],
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
    const analysis = await runAnalysis(precheck, audio)

    try {
      await store.saveRecording({
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
  }, [actorId, audio, isDemo, patch, state, store])

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
      await store.submit(state.assessmentId, actorId)
      patch({ step: 'submitted', busy: false })
    } catch {
      patch({ busy: false, errorKey: 'error.submitFailed' })
    }
  }, [actorId, patch, state.assessmentId, store])

  const goBack = useCallback(() => {
    const target = BACK_TO[state.step]
    if (target !== undefined) patch({ step: target, errorKey: null })
  }, [patch, state.step])

  return useMemo(
    () => ({
      state,
      importedAudio: importedFile.current,
      start,
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
      start,
      state,
      submit,
    ],
  )
}
