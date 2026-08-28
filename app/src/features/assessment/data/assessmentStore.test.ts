import { beforeEach, describe, expect, it } from 'vitest'
import { encodeWav } from '../../../audio'
import { AuscultaDB } from '../../../db/db'
import {
  AI_STATUS,
  AUDIO_SOURCES,
  CLASSIFICATION_CODES,
  LOCATION_CODES,
  REVIEW_STATUSES,
} from '../../../db/codes'
import { ASSESSMENT_AUDIT_ACTIONS } from './auditActions'
import {
  UNKNOWN_AUDIO_METADATA,
  audioBlobFor,
  createAssessmentStore,
  type AssessmentStore,
} from './assessmentStore'
import {
  insufficientQualityResult,
  noAbnormalityResult,
  notConnectedResult,
  suggestiveResult,
  uncertainResult,
} from '../__tests__/fixtures'

let db: AuscultaDB
let store: AssessmentStore

const ASSESSOR = 'user-health-worker-1'
const PATIENT = 'PT-4K7M-92XQ'

beforeEach(() => {
  db = new AuscultaDB(`ausculta-assessment-test-${crypto.randomUUID()}`)
  store = createAssessmentStore(db)
})

/** A real 16-bit mono WAV, built by the audio module's own encoder. */
function wavFile(samples = 16000 * 4, name = 'REC0001.WAV'): File {
  const pcm = new Int16Array(samples)
  for (let i = 0; i < samples; i++) pcm[i] = Math.round(Math.sin(i / 7) * 4000)
  return new File([encodeWav(pcm)], name, { type: 'audio/wav' })
}

/**
 * jsdom's Blob has no `arrayBuffer()` — the same gap the audio module's decoder
 * works around for older Android WebViews — so read it the long way.
 *
 * NOTE ON WHERE BYTES ARE ASSERTED: `fake-indexeddb`'s structured clone does
 * not preserve Blobs — a stored Blob comes back as `{}`. Real IndexedDB stores
 * them faithfully, so this is a limitation of the test environment and not of
 * the app. The bytes are therefore asserted on what `audioBlobFor` produces,
 * which is the value the store writes, and the round trip below asserts that
 * the row exists and is reachable by the id on the recording.
 */
async function bytesOf(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('could not read blob'))
    reader.readAsArrayBuffer(blob)
  })
  return new Uint8Array(buffer)
}

async function startDraft() {
  return store.createDraft({
    patientId: PATIENT,
    assessorId: ASSESSOR,
    interfaceLanguage: 'en',
    isDemo: 0,
  })
}

async function saveAt(
  assessmentId: string,
  locationCode = LOCATION_CODES.R_UPPER,
  result = suggestiveResult(),
  file: File | null = wavFile(),
) {
  return store.saveRecording({
    assessmentId,
    patientId: PATIENT,
    locationCode,
    actorId: ASSESSOR,
    originalFile: file,
    result,
    ...UNKNOWN_AUDIO_METADATA,
    isDemo: 0,
  })
}

async function actionCodes(): Promise<string[]> {
  const rows = await db.auditLogs.orderBy('seq').toArray()
  return rows.map((row) => row.actionCode)
}

describe('createDraft', () => {
  it('opens an assessment as a DRAFT with nothing claimed about severity', async () => {
    const assessment = await startDraft()

    const stored = await db.assessments.get(assessment.id)
    expect(stored?.reviewStatus).toBe(REVIEW_STATUSES.DRAFT)
    expect(stored?.patientId).toBe(PATIENT)
    expect(stored?.assessorId).toBe(ASSESSOR)
    expect(stored?.aiSeverity).toMatchObject({
      score: null,
      category: null,
      modelVersion: null,
      calculatedAt: null,
      status: 'MODEL_NOT_CONNECTED',
    })
  })

  it('writes the audit trail', async () => {
    await startDraft()
    expect(await actionCodes()).toEqual([ASSESSMENT_AUDIT_ACTIONS.ASSESSMENT_STARTED])
  })
})

describe('saveRecording', () => {
  it('round-trips the recording and keeps its audio reachable by id', async () => {
    const assessment = await startDraft()
    const file = wavFile()
    const recording = await saveAt(assessment.id, LOCATION_CODES.R_UPPER, suggestiveResult(), file)

    const stored = await db.recordings.get(recording.id)
    expect(stored?.locationCode).toBe(LOCATION_CODES.R_UPPER)
    expect(stored?.audioSource).toBe(AUDIO_SOURCES.DEVICE_WAV_IMPORT)
    expect(stored?.originalFileName).toBe('REC0001.WAV')
    expect(await db.audioBlobs.get(stored!.audioBlobId)).toBeDefined()
    expect(await store.readAudio(stored!.audioBlobId)).not.toBeNull()
  })

  it('stores the imported file itself, not a re-encoded copy', async () => {
    const file = wavFile()
    const blob = audioBlobFor({ originalFile: file, result: suggestiveResult() })

    // Identity, not equality: what a practitioner plays back has to be exactly
    // what came off the memory card.
    expect(blob).toBe(file)
    expect(await bytesOf(blob)).toEqual(await bytesOf(file))
  })

  it('encodes app-produced audio as a playable 16-bit mono WAV', async () => {
    const result = suggestiveResult()
    const blob = audioBlobFor({ originalFile: null, result })
    const bytes = await bytesOf(blob)
    const text = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4))
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    expect(blob.type).toBe('audio/wav')
    expect(text(0)).toBe('RIFF')
    expect(text(8)).toBe('WAVE')
    expect(text(12)).toBe('fmt ')
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(16000) // 16 kHz
    expect(view.getUint16(34, true)).toBe(16) // 16-bit
    expect(text(36)).toBe('data')
    expect(view.getUint32(40, true)).toBe(result.audio.pcm16k.length * 2)
  })

  it('keeps no file name when there was no imported file', async () => {
    const assessment = await startDraft()
    const recording = await saveAt(assessment.id, LOCATION_CODES.L_UPPER, suggestiveResult(), null)

    expect((await db.recordings.get(recording.id))?.originalFileName).toBeUndefined()
  })

  it('records the quality report and the capture metadata', async () => {
    const assessment = await startDraft()
    const recording = await saveAt(assessment.id)

    const stored = await db.recordings.get(recording.id)
    expect(stored?.importedSampleRate).toBe(16000)
    expect(stored?.durationSec).toBeCloseTo(6, 3)
    expect(stored?.quality).toMatchObject({ ok: true })
  })

  it('stores the classification code and confidence for a suggestive finding', async () => {
    const assessment = await startDraft()
    const recording = await saveAt(
      assessment.id,
      LOCATION_CODES.R_MIDDLE,
      suggestiveResult('Asthma', 0.71),
    )

    const stored = await db.recordings.get(recording.id)
    expect(stored?.aiStatus).toBe(AI_STATUS.ANALYZED)
    expect(stored?.aiClassification).toBe(CLASSIFICATION_CODES.ASTHMA)
    expect(stored?.aiConfidence).toBeCloseTo(0.71, 6)
    expect(stored?.modelVersion).toBe('ei-disease-v5@5')
    expect(stored?.perWindowResults).toBeDefined()
  })

  it('stores HEALTHY for a negative result', async () => {
    const assessment = await startDraft()
    const recording = await saveAt(assessment.id, LOCATION_CODES.L_MIDDLE, noAbnormalityResult())

    const stored = await db.recordings.get(recording.id)
    expect(stored?.aiClassification).toBe(CLASSIFICATION_CODES.HEALTHY)
  })

  it('never persists a classification for an unusable recording', async () => {
    const assessment = await startDraft()
    const recording = await saveAt(
      assessment.id,
      LOCATION_CODES.R_LOWER,
      insufficientQualityResult(),
    )

    const stored = await db.recordings.get(recording.id)
    expect(stored?.aiStatus).toBe(AI_STATUS.INSUFFICIENT_QUALITY)
    expect(stored?.aiClassification).toBeUndefined()
    expect(stored?.aiConfidence).toBeUndefined()
    // The audio is still kept: a rejected recording is research data too.
    expect(await db.audioBlobs.get(stored!.audioBlobId)).toBeDefined()
  })

  it('never persists a classification for an uncertain result', async () => {
    const assessment = await startDraft()
    const recording = await saveAt(assessment.id, LOCATION_CODES.L_LOWER, uncertainResult())

    const stored = await db.recordings.get(recording.id)
    expect(stored?.aiStatus).toBe(AI_STATUS.ANALYZED)
    expect(stored?.uncertainFlag).toBe(true)
    expect(stored?.aiClassification).toBeUndefined()
    expect(stored?.aiConfidence).toBeUndefined()
  })

  it('never persists a classification when there was no model', async () => {
    const assessment = await startDraft()
    const recording = await saveAt(assessment.id, LOCATION_CODES.R_UPPER, notConnectedResult())

    const stored = await db.recordings.get(recording.id)
    expect(stored?.aiStatus).toBe(AI_STATUS.MODEL_NOT_CONNECTED)
    expect(stored?.aiClassification).toBeUndefined()
    expect(stored?.aiConfidence).toBeUndefined()
    expect(stored?.modelVersion).toBeUndefined()
  })

  it('reports unknown import metadata as unknown rather than assuming 16-bit mono', () => {
    expect(UNKNOWN_AUDIO_METADATA).toEqual({ bitDepth: 0, channels: 0 })
  })

  it('replaces the recording when a position is recorded again, blob and all', async () => {
    const assessment = await startDraft()
    const first = await saveAt(assessment.id, LOCATION_CODES.R_UPPER)
    const second = await saveAt(assessment.id, LOCATION_CODES.R_UPPER)

    expect(await db.recordings.where({ assessmentId: assessment.id }).count()).toBe(1)
    expect(await db.recordings.get(first.id)).toBeUndefined()
    expect(await db.audioBlobs.get(first.audioBlobId)).toBeUndefined()
    expect(await db.audioBlobs.get(second.audioBlobId)).toBeDefined()
    expect(await actionCodes()).toEqual([
      ASSESSMENT_AUDIT_ACTIONS.ASSESSMENT_STARTED,
      ASSESSMENT_AUDIT_ACTIONS.RECORDING_SAVED,
      ASSESSMENT_AUDIT_ACTIONS.RECORDING_REPLACED,
    ])
  })
})

describe('resuming', () => {
  it('restores which positions have already been recorded', async () => {
    const assessment = await startDraft()
    await saveAt(assessment.id, LOCATION_CODES.R_UPPER)
    await saveAt(assessment.id, LOCATION_CODES.L_MIDDLE)

    const resumed = await store.load(assessment.id)
    expect(resumed?.assessment.id).toBe(assessment.id)
    expect(resumed?.recordedLocations.sort()).toEqual(
      [LOCATION_CODES.L_MIDDLE, LOCATION_CODES.R_UPPER].sort(),
    )
  })

  it('does not see the recordings of a different assessment', async () => {
    const mine = await startDraft()
    const theirs = await startDraft()
    await saveAt(theirs.id, LOCATION_CODES.R_LOWER)

    expect((await store.load(mine.id))?.recordedLocations).toEqual([])
  })

  it('returns null for an assessment that is not on this device', async () => {
    expect(await store.load('no-such-assessment')).toBeNull()
  })
})

describe('submit', () => {
  it('moves the assessment to PENDING_REVIEW and audits it', async () => {
    const assessment = await startDraft()
    await saveAt(assessment.id)

    const submitted = await store.submit(assessment.id, ASSESSOR)

    expect(submitted.reviewStatus).toBe(REVIEW_STATUSES.PENDING_REVIEW)
    expect((await db.assessments.get(assessment.id))?.reviewStatus).toBe(
      REVIEW_STATUSES.PENDING_REVIEW,
    )
    expect(await actionCodes()).toContain(ASSESSMENT_AUDIT_ACTIONS.ASSESSMENT_SUBMITTED)
  })

  it('refuses to submit an assessment with no recordings at all', async () => {
    const assessment = await startDraft()

    await expect(store.submit(assessment.id, ASSESSOR)).rejects.toThrow()
    expect((await db.assessments.get(assessment.id))?.reviewStatus).toBe(REVIEW_STATUSES.DRAFT)
  })
})
