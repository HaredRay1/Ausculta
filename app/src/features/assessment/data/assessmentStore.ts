import { encodeWav, type AnalysisResult } from '../../../audio'
import { logAction } from '../../../audit/audit'
import { AUDIO_SOURCES, REVIEW_STATUSES } from '../../../db/codes'
import type { AudioSource, LocationCode } from '../../../db/codes'
import { db as defaultDb, type AuscultaDB } from '../../../db/db'
import type { Assessment, DemoFlag, Patient, Recording } from '../../../db/types'
import { ASSESSMENT_AUDIT_ACTIONS } from './auditActions'
import { toAiOutcome } from './mapping'

/**
 * Persistence for one assessment and its recordings.
 *
 * Everything the wizard writes goes through here, so that "the row is saved
 * before the next screen is shown" is a property of one module rather than a
 * habit each step has to remember. Closing the app mid-assessment therefore
 * loses at most the position currently being recorded.
 *
 * Built as a factory over an injected `AuscultaDB` — the same shape as
 * `auth/authService.ts` — so tests run against a throwaway database instead of
 * the app singleton.
 */

/**
 * The questionnaire has not been asked at this point in the app's life: the
 * symptom and vitals screens are a later phase. Recording a version string of
 * "not-asked" keeps the field honest rather than claiming a version of a form
 * nobody filled in.
 */
export const NO_QUESTIONNAIRE_VERSION = 'not-asked'

/**
 * Severity scoring is a later phase and no threshold configuration exists yet,
 * so a new assessment carries the empty, explicitly-not-calculated severity
 * rather than a zero that could be read as a score.
 */
const UNCALCULATED_SEVERITY = {
  score: null,
  category: null,
  modelVersion: null,
  calculatedAt: null,
  thresholdConfigVersion: 0,
  status: 'MODEL_NOT_CONNECTED',
} as const

/**
 * Import metadata the audio module does not report.
 *
 * `Recording.bitDepth` and `Recording.channels` are required columns, but the
 * public `AnalysisResult`/`CaptureMeta` contract carries neither: it exposes
 * `originalSampleRate` and nothing else about the source format. Rather than
 * assume the device's 16-bit mono — which would be a fabricated fact about a
 * file that may have come from anywhere — an unreported value is stored as 0.
 * No real audio file has zero bits per sample or zero channels, so 0 is
 * unambiguously "not reported" and can be backfilled once the audio module
 * surfaces the values its WAV parser already reads.
 */
export const UNKNOWN_AUDIO_METADATA = { bitDepth: 0, channels: 0 } as const

export interface CreateDraftInput {
  patientId: string
  assessorId: string
  interfaceLanguage: string
  isDemo: DemoFlag
}

export interface SaveRecordingInput {
  assessmentId: string
  patientId: string
  locationCode: LocationCode
  /** The signed-in user, for the audit trail. */
  actorId: string
  /**
   * The imported file, stored byte for byte. Null when the app produced the
   * audio itself, in which case the analysed buffer is encoded with the audio
   * module's `encodeWav` rather than re-wrapped by hand.
   */
  originalFile: File | null
  result: AnalysisResult
  /** Defaults to a device WAV import, the only capture path in this phase. */
  audioSource?: AudioSource
  bitDepth: number
  channels: number
  isDemo: DemoFlag
}

/** An assessment plus enough of its recordings to resume the wizard. */
export interface LoadedAssessment {
  assessment: Assessment
  recordings: Recording[]
  recordedLocations: LocationCode[]
}

export interface AssessmentStore {
  createDraft(input: CreateDraftInput): Promise<Assessment>
  load(assessmentId: string): Promise<LoadedAssessment | null>
  saveRecording(input: SaveRecordingInput): Promise<Recording>
  readAudio(audioBlobId: string): Promise<Blob | null>
  /** The patient this assessment is about, for the confirmation screen. */
  loadPatient(patientId: string): Promise<Patient | null>
  submit(assessmentId: string, actorId: string): Promise<Assessment>
}

/**
 * The audio that gets stored for one recording.
 *
 * An imported file is stored as it arrived — the SAME object, not a copy and
 * not a re-encode. What a practitioner listens to has to be what came off the
 * memory card, byte for byte, or the recording stops being evidence. Only
 * audio the app produced itself is encoded here, and then through the audio
 * module's own `encodeWav` rather than a hand-rolled container.
 *
 * Split out so the choice can be asserted directly: IndexedDB round trips are
 * not a place to check bytes (see the note in assessmentStore.test.ts).
 */
export function audioBlobFor(input: Pick<SaveRecordingInput, 'originalFile' | 'result'>): Blob {
  return input.originalFile ?? encodeWav(input.result.audio.pcm16k)
}

export class AssessmentStoreError extends Error {
  readonly code: 'not-found' | 'no-recordings'
  constructor(code: 'not-found' | 'no-recordings', message: string) {
    super(message)
    this.name = 'AssessmentStoreError'
    this.code = code
  }
}

export function createAssessmentStore(database: AuscultaDB = defaultDb): AssessmentStore {
  async function createDraft(input: CreateDraftInput): Promise<Assessment> {
    const assessment: Assessment = {
      id: crypto.randomUUID(),
      patientId: input.patientId,
      assessorId: input.assessorId,
      date: new Date().toISOString(),
      symptoms: [],
      vitals: [],
      reviewStatus: REVIEW_STATUSES.DRAFT,
      interfaceLanguage: input.interfaceLanguage,
      questionnaireLanguage: input.interfaceLanguage,
      questionnaireVersion: NO_QUESTIONNAIRE_VERSION,
      aiSeverity: { ...UNCALCULATED_SEVERITY },
      isDemo: input.isDemo,
      createdAt: new Date().toISOString(),
    }

    await database.assessments.add(assessment)
    await logAction(
      {
        userId: input.assessorId,
        actionCode: ASSESSMENT_AUDIT_ACTIONS.ASSESSMENT_STARTED,
        entityType: 'assessment',
        entityId: assessment.id,
        patientId: input.patientId,
      },
      database,
    )
    return assessment
  }

  async function load(assessmentId: string): Promise<LoadedAssessment | null> {
    const assessment = await database.assessments.get(assessmentId)
    if (assessment === undefined) return null

    const recordings = await database.recordings.where({ assessmentId }).toArray()
    return {
      assessment,
      recordings,
      recordedLocations: recordings.map((recording) => recording.locationCode),
    }
  }

  async function saveRecording(input: SaveRecordingInput): Promise<Recording> {
    const blob = audioBlobFor(input)
    const recordingId = crypto.randomUUID()
    const audioBlobId = crypto.randomUUID()

    const recording: Recording = {
      id: recordingId,
      assessmentId: input.assessmentId,
      patientId: input.patientId,
      locationCode: input.locationCode,
      audioBlobId,
      audioSource: input.audioSource ?? AUDIO_SOURCES.DEVICE_WAV_IMPORT,
      ...(input.originalFile !== null && { originalFileName: input.originalFile.name }),
      importedSampleRate: input.result.meta.originalSampleRate ?? input.result.audio.sampleRate,
      bitDepth: input.bitDepth,
      channels: input.channels,
      durationSec: input.result.audio.durationMs / 1000,
      quality: input.result.quality,
      // Every clinical field on the row comes from here and from nowhere else.
      ...toAiOutcome(input.result),
      isDemo: input.isDemo,
      createdAt: new Date().toISOString(),
    }

    // One transaction: a recording row that outlived its audio, or audio with
    // no row pointing at it, would both be corruption of the record.
    const replacedId = await database.transaction(
      'rw',
      database.recordings,
      database.audioBlobs,
      async () => {
        const existing = await database.recordings
          .where({ assessmentId: input.assessmentId })
          .filter((row) => row.locationCode === input.locationCode)
          .toArray()

        for (const row of existing) {
          await database.audioBlobs.delete(row.audioBlobId)
          await database.recordings.delete(row.id)
        }

        await database.audioBlobs.add({ id: audioBlobId, blob })
        await database.recordings.add(recording)
        return existing[0]?.id ?? null
      },
    )

    await logAction(
      {
        userId: input.actorId,
        actionCode:
          replacedId === null
            ? ASSESSMENT_AUDIT_ACTIONS.RECORDING_SAVED
            : ASSESSMENT_AUDIT_ACTIONS.RECORDING_REPLACED,
        entityType: 'recording',
        entityId: recordingId,
        patientId: input.patientId,
        detail: {
          assessmentId: input.assessmentId,
          locationCode: input.locationCode,
          aiStatus: recording.aiStatus,
          ...(replacedId !== null && { replacedRecordingId: replacedId }),
        },
      },
      database,
    )

    return recording
  }

  async function submit(assessmentId: string, actorId: string): Promise<Assessment> {
    const assessment = await database.assessments.get(assessmentId)
    if (assessment === undefined) {
      throw new AssessmentStoreError('not-found', `No assessment "${assessmentId}" on this device`)
    }

    const recordingCount = await database.recordings.where({ assessmentId }).count()
    if (recordingCount === 0) {
      // Nothing to review. Sending an empty assessment would put a practitioner
      // in a queue of records with nothing in them.
      throw new AssessmentStoreError(
        'no-recordings',
        'An assessment needs at least one recording before it can be reviewed',
      )
    }

    const submitted: Assessment = {
      ...assessment,
      reviewStatus: REVIEW_STATUSES.PENDING_REVIEW,
    }
    await database.assessments.put(submitted)
    await logAction(
      {
        userId: actorId,
        actionCode: ASSESSMENT_AUDIT_ACTIONS.ASSESSMENT_SUBMITTED,
        entityType: 'assessment',
        entityId: assessmentId,
        patientId: assessment.patientId,
        detail: { recordingCount },
      },
      database,
    )
    return submitted
  }

  async function readAudio(audioBlobId: string): Promise<Blob | null> {
    return (await database.audioBlobs.get(audioBlobId))?.blob ?? null
  }

  /**
   * Read-only. This feature does not create or list patients — another owns
   * that — but an id alone cannot confirm a person, and recording against the
   * wrong patient is the one mistake in this flow nothing downstream undoes.
   */
  async function loadPatient(patientId: string): Promise<Patient | null> {
    return (await database.patients.get(patientId)) ?? null
  }

  return { createDraft, load, saveRecording, readAudio, loadPatient, submit }
}

/** The store bound to the app's real database. */
export const assessmentStore = createAssessmentStore()
