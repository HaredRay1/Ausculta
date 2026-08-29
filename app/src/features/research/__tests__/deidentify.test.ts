import { beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../../../db/db'
import type { Patient } from '../../../db/types'
import { DEMO_PATIENTS } from '../../demo/dataset'
import { seedDemoData } from '../../demo/seed'
import {
  EXPORT_COLUMNS,
  FORBIDDEN_PATIENT_FIELDS,
  ageYearsAt,
  buildExportRows,
  csvField,
  exportFileName,
  projectExportRows,
  toCsv,
  toJson,
} from '../deidentify'

let db: AuscultaDB
const NOW = Date.parse('2026-08-29T06:00:00.000Z')

beforeEach(() => {
  db = new AuscultaDB(`ausculta-research-export-${crypto.randomUUID()}`)
})

/**
 * Every identifying value that exists in the seeded dataset.
 *
 * Collected from the source data rather than hardcoded, so a patient added to
 * the fictional clinic later is covered by this test automatically instead of
 * quietly slipping past it.
 */
function identifyingValues(): string[] {
  const values: string[] = []
  for (const patient of DEMO_PATIENTS) {
    values.push(patient.name, patient.birthDate, patient.address)
    if (patient.contact !== undefined) values.push(patient.contact)
    // Surname and given name separately: a partial leak is still a leak.
    values.push(...patient.name.split(' '))
  }
  return values.filter((value) => value.length > 2)
}

describe('the export contains no identifying field', () => {
  it('no patient name, birth date, address or contact appears in the CSV', async () => {
    await seedDemoData(db, { now: NOW })
    const csv = toCsv(await buildExportRows(db, true))

    const leaked = identifyingValues().filter((value) => csv.includes(value))
    expect(leaked).toEqual([])
  })

  it('no patient name, birth date, address or contact appears in the JSON', async () => {
    await seedDemoData(db, { now: NOW })
    const json = toJson(await buildExportRows(db, true))

    const leaked = identifyingValues().filter((value) => json.includes(value))
    expect(leaked).toEqual([])
  })

  it('no clinic-facing patient id or internal row id appears', async () => {
    await seedDemoData(db, { now: NOW })
    const rows = await buildExportRows(db, true)
    const csv = toCsv(rows)

    for (const patient of await db.patients.toArray()) {
      expect(csv).not.toContain(patient.id)
    }
    for (const assessment of await db.assessments.toArray()) {
      expect(csv).not.toContain(assessment.id)
    }
    for (const recording of await db.recordings.toArray()) {
      expect(csv).not.toContain(recording.id)
    }
  })

  it('carries no staff account identifier', async () => {
    await seedDemoData(db, { now: NOW })
    const csv = toCsv(await buildExportRows(db, true))

    for (const assessment of await db.assessments.toArray()) {
      expect(csv).not.toContain(assessment.assessorId)
      if (assessment.practitionerReviewerId !== undefined) {
        expect(csv).not.toContain(assessment.practitionerReviewerId)
      }
    }
  })

  it('names no forbidden field in the column list', () => {
    const identifying = FORBIDDEN_PATIENT_FIELDS as readonly string[]
    for (const column of EXPORT_COLUMNS) {
      expect(identifying).not.toContain(column)
    }
  })

  it('does carry the study id, which is what makes a row usable at all', async () => {
    await seedDemoData(db, { now: NOW })
    const csv = toCsv(await buildExportRows(db, true))

    for (const patient of await db.patients.toArray()) {
      expect(csv).toContain(patient.studyId)
    }
  })
})

describe('what the export does carry', () => {
  it('exports language study variables and the questionnaire version', async () => {
    await seedDemoData(db, { now: NOW })
    const rows = await buildExportRows(db, true)

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.interfaceLanguage).toBeTruthy()
      expect(row.questionnaireLanguage).toBeTruthy()
      expect(row.questionnaireVersion).toBeTruthy()
      expect(row.consentLanguage).toBeTruthy()
      expect(row.consentTextVersion).toBeTruthy()
    }
    // The fictional clinic runs in both languages; both must survive.
    expect(new Set(rows.map((row) => row.questionnaireLanguage)).size).toBeGreaterThan(1)
  })

  it('exports clinical values as codes, not translated display strings', async () => {
    await seedDemoData(db, { now: NOW })
    const rows = await buildExportRows(db, true)

    const classifications = new Set(rows.map((row) => row.aiClassification).filter(Boolean))
    for (const value of classifications) {
      expect(value).toMatch(/^[A-Z_]+$/)
    }
    const statuses = new Set(rows.map((row) => row.aiStatus))
    for (const value of statuses) expect(value).toMatch(/^[A-Z_]+$/)

    const csv = toCsv(rows)
    // Display wording for these codes, in either language, must not appear.
    for (const word of ['Asthma', 'Hika', 'Healthy', 'Malusog', 'Pneumonia']) {
      expect(csv).not.toContain(word)
    }
  })

  it('replaces the birth date with an age and the calendar with a day offset', async () => {
    await seedDemoData(db, { now: NOW })
    const rows = await buildExportRows(db, true)

    expect(rows.every((row) => typeof row.ageYears === 'number')).toBe(true)
    // A child and an older adult both survive the projection.
    const ages = rows.map((row) => row.ageYears as number)
    expect(Math.min(...ages)).toBeLessThan(13)
    expect(Math.max(...ages)).toBeGreaterThan(65)

    // Every patient's first assessment is day 0, and later ones are positive.
    const offsets = rows.map((row) => row.daysSinceFirstAssessment)
    expect(Math.min(...offsets)).toBe(0)
    expect(Math.max(...offsets)).toBeGreaterThan(0)
  })

  it('marks seeded rows so fictional data cannot be mistaken inside the file', async () => {
    await seedDemoData(db, { now: NOW })
    const rows = await buildExportRows(db, true)

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.isDemo === 1)).toBe(true)
    expect(EXPORT_COLUMNS).toContain('isDemo')
  })

  it('excludes seeded rows entirely when demo mode is off', async () => {
    await seedDemoData(db, { now: NOW })
    expect(await buildExportRows(db, false)).toEqual([])
  })
})

describe('projection details', () => {
  it('drops a recording whose patient is out of scope rather than exporting blanks', () => {
    const rows = projectExportRows({
      patients: [],
      assessments: [
        {
          id: 'A1',
          patientId: 'P1',
          assessorId: 'u1',
          date: '2026-08-01T00:00:00.000Z',
          symptoms: [],
          vitals: [],
          reviewStatus: 'APPROVED',
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
          isDemo: 0,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      recordings: [
        {
          id: 'R1',
          assessmentId: 'A1',
          patientId: 'P1',
          locationCode: 'R_UPPER',
          audioBlobId: 'B1',
          audioSource: 'DEVICE_WAV_IMPORT',
          importedSampleRate: 16000,
          bitDepth: 16,
          channels: 1,
          durationSec: 8,
          quality: null,
          aiStatus: 'PENDING',
          isDemo: 0,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      labels: [],
    })
    expect(rows).toEqual([])
  })

  it('is deterministic, so two exports of the same data are identical', async () => {
    await seedDemoData(db, { now: NOW })
    const first = toCsv(await buildExportRows(db, true))
    const second = toCsv(await buildExportRows(db, true))
    expect(first).toBe(second)
  })

  it('ageYearsAt handles a birthday that has not happened yet this year', () => {
    expect(ageYearsAt('1992-03-14', '2026-03-13T00:00:00.000Z')).toBe(33)
    expect(ageYearsAt('1992-03-14', '2026-03-14T00:00:00.000Z')).toBe(34)
    expect(ageYearsAt('not a date', '2026-01-01T00:00:00.000Z')).toBe('')
    expect(ageYearsAt('2030-01-01', '2026-01-01T00:00:00.000Z')).toBe('')
  })
})

describe('serialisation', () => {
  it('quotes CSV fields containing a comma, quote or newline', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line\nbreak')).toBe('"line\nbreak"')
    expect(csvField(42)).toBe('42')
  })

  it('CSV header matches the declared column order', async () => {
    await seedDemoData(db, { now: NOW })
    const csv = toCsv(await buildExportRows(db, true))
    expect(csv.split('\r\n')[0]).toBe(EXPORT_COLUMNS.join(','))
  })

  it('every CSV row has exactly as many fields as there are columns', async () => {
    await seedDemoData(db, { now: NOW })
    const csv = toCsv(await buildExportRows(db, true))
    for (const line of csv.trim().split('\r\n')) {
      // No seeded value contains a comma, so a plain split is a valid check here.
      expect(line.split(',')).toHaveLength(EXPORT_COLUMNS.length)
    }
  })

  it('JSON and CSV present the same fields in the same order', async () => {
    await seedDemoData(db, { now: NOW })
    const rows = await buildExportRows(db, true)
    const parsed = JSON.parse(toJson(rows)) as Record<string, unknown>[]
    expect(Object.keys(parsed[0])).toEqual([...EXPORT_COLUMNS])
  })

  it('names the file by date and extension', () => {
    expect(exportFileName('csv', NOW)).toBe('ausculta-export-2026-08-29.csv')
    expect(exportFileName('json', NOW)).toBe('ausculta-export-2026-08-29.json')
  })

  it('produces a header-only file rather than nothing when there is no data', () => {
    const csv = toCsv([])
    expect(csv.trim()).toBe(EXPORT_COLUMNS.join(','))
    expect(toJson([])).toBe('[]')
  })
})

describe('an empty patient record does not break the projection', () => {
  it('exports blanks for absent optional data', () => {
    const patient: Patient = {
      id: 'P1',
      studyId: 'ST-AAAA0000AAAA0000',
      name: 'Someone',
      birthDate: '1980-01-01',
      sex: 'UNDISCLOSED',
      assignedPractitionerIds: [],
      assignedHealthWorkerIds: [],
      consent: null,
      respiratoryHistory: [],
      familyHistory: [],
      preferredLanguage: 'en',
      isDemo: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
    }
    const rows = projectExportRows({
      patients: [patient],
      assessments: [
        {
          id: 'A1',
          patientId: 'P1',
          assessorId: 'u1',
          date: '2026-08-01T00:00:00.000Z',
          symptoms: [],
          vitals: [],
          reviewStatus: 'DRAFT',
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
          isDemo: 0,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      recordings: [
        {
          id: 'R1',
          assessmentId: 'A1',
          patientId: 'P1',
          locationCode: 'R_UPPER',
          audioBlobId: 'B1',
          audioSource: 'DEVICE_WAV_IMPORT',
          importedSampleRate: 16000,
          bitDepth: 16,
          channels: 1,
          durationSec: 8,
          quality: null,
          aiStatus: 'PENDING',
          isDemo: 0,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      labels: [],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].consentStatus).toBe('')
    expect(rows[0].aiClassification).toBe('')
    expect(rows[0].aiConfidence).toBe('')
    expect(rows[0].groundTruthStatus).toBe('')
    expect(rows[0].studyId).toBe('ST-AAAA0000AAAA0000')
    expect(toCsv(rows)).not.toContain('Someone')
  })
})
