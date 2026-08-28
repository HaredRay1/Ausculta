import { describe, expect, it, beforeEach } from 'vitest'
import { AuscultaDB } from './db'
import { LOCATION_CODES, AI_STATUS, AUDIO_SOURCES } from './codes'
import type { Recording } from './types'

const TABLE_NAMES = [
  'users',
  'patients',
  'assessments',
  'recordings',
  'audioBlobs',
  'clinicalReviews',
  'monitoringPlans',
  'rehabPlans',
  'rehabCompletions',
  'alerts',
  'researchLabels',
  'auditLogs',
  'missingTranslations',
  'changeLog',
  'appMeta',
]

describe('AuscultaDB', () => {
  let db: AuscultaDB

  beforeEach(() => {
    // A fresh, uniquely named database per test avoids fake-indexeddb state
    // leaking between tests.
    db = new AuscultaDB(`ausculta-test-${crypto.randomUUID()}`)
  })

  it('opens', async () => {
    await expect(db.open()).resolves.toBeDefined()
  })

  it('has all 15 tables by name', () => {
    expect(db.tables).toHaveLength(15)
    const actualNames = db.tables.map((t) => t.name).sort()
    expect(actualNames).toEqual([...TABLE_NAMES].sort())
  })

  it('round-trips appMeta put/get', async () => {
    await db.appMeta.put({ key: 'schemaVersion', value: 1 })
    const entry = await db.appMeta.get('schemaVersion')
    expect(entry).toEqual({ key: 'schemaVersion', value: 1 })
  })

  it('round-trips a recordings row via the [patientId+locationCode] compound index', async () => {
    const recording: Recording = {
      id: 'rec-1',
      assessmentId: 'assess-1',
      patientId: 'patient-1',
      locationCode: LOCATION_CODES.R_UPPER,
      audioBlobId: 'blob-1',
      audioSource: AUDIO_SOURCES.DEVICE_WAV_IMPORT,
      importedSampleRate: 16000,
      bitDepth: 16,
      channels: 1,
      durationSec: 12.5,
      quality: null,
      aiStatus: AI_STATUS.PENDING,
      isDemo: 0,
      createdAt: new Date().toISOString(),
    }
    await db.recordings.add(recording)

    const found = await db.recordings
      .where('[patientId+locationCode]')
      .equals(['patient-1', LOCATION_CODES.R_UPPER])
      .toArray()

    expect(found).toHaveLength(1)
    expect(found[0]).toEqual(recording)
  })
})
