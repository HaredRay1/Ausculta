import { MEASUREMENT_CODES } from '../../db/codes'
import { db as defaultDb, type AuscultaDB } from '../../db/db'
import type { Assessment, Patient, Recording, ResearchLabel } from '../../db/types'
import { visibleRows } from '../demo/visibility'

/**
 * De-identified research export.
 *
 * Two rules govern every field below, and both have a way of being eroded by a
 * well-meaning "it would be useful to also have…".
 *
 * **Nothing that identifies a person leaves the device.** Not the name, birth
 * date, address or contact; not the clinic-facing `patient.id`, which is read
 * aloud and written on paper forms; not `linkedUserId`; and not the raw
 * `id` of any assessment or recording, because those are join keys back into
 * the clinic database. What travels is `studyId`, drawn from the CSPRNG and
 * from nothing else (see `features/patients/ids.ts`), plus an assessment
 * sequence number and the lung location — which together identify a recording
 * uniquely inside the export without identifying it outside.
 *
 * Age is derived and exported; birth date is not. Age in whole years at the
 * assessment is a legitimate research variable and is far coarser than the
 * date it came from. Dates of service are quasi-identifiers, so what is
 * exported is `daysSinceFirstAssessment` — the longitudinal structure the
 * study actually needs, without a calendar to match against a clinic register.
 *
 * **Clinical values export as codes, never as translated display strings.** An
 * export where one device wrote "Hika" and another wrote "Asthma" cannot be
 * pooled, and language is itself a study variable here — which is why
 * `interfaceLanguage` and `questionnaireLanguage` are columns rather than
 * something to infer from the words in the file.
 *
 * Staff identifiers are also absent. `assessorId` would support inter-rater
 * analysis, but a raw account id in a file described as de-identified is not
 * de-identified. If that analysis is wanted, it needs an opaque per-study
 * rater id, which is a decision for the research protocol rather than for this
 * module to invent.
 */

/**
 * Patient fields that must never appear in an export, in any encoding.
 *
 * Exported so the test suite can assert their absence by value rather than by
 * reading this list back to itself.
 */
export const FORBIDDEN_PATIENT_FIELDS = [
  'name',
  'birthDate',
  'address',
  'contact',
  'id',
  'linkedUserId',
] as const

export interface ExportRow {
  /** De-identified study identifier. The only patient key that travels. */
  studyId: string
  sex: string
  ageYears: number | ''
  /** Codes of standing history answered "present", semicolon-joined. */
  respiratoryHistory: string
  familyHistory: string
  consentStatus: string
  consentLanguage: string
  consentTextVersion: string
  /** 1-based index of this assessment for this patient, oldest first. */
  assessmentSeq: number
  /** Days from the patient's first assessment. No calendar date is exported. */
  daysSinceFirstAssessment: number
  interfaceLanguage: string
  questionnaireLanguage: string
  questionnaireVersion: string
  reviewStatus: string
  practitionerInterpretation: string
  aiSeverityStatus: string
  aiSeverityScore: number | ''
  aiSeverityCategory: string
  symptomsPresent: string
  spo2: number | ''
  respiratoryRate: number | ''
  locationCode: string
  aiStatus: string
  aiClassification: string
  aiConfidence: number | ''
  uncertainFlag: 0 | 1
  modelVersion: string
  audioSource: string
  durationSec: number | ''
  groundTruthStatus: string
  referenceLabelCode: string
  /** 1 for a seeded fictional record. Present so a demo row can never be
   *  mistaken for study data inside the file itself. */
  isDemo: 0 | 1
}

/** Column order for the CSV. Also the field order of each JSON object. */
export const EXPORT_COLUMNS: readonly (keyof ExportRow)[] = [
  'studyId',
  'sex',
  'ageYears',
  'respiratoryHistory',
  'familyHistory',
  'consentStatus',
  'consentLanguage',
  'consentTextVersion',
  'assessmentSeq',
  'daysSinceFirstAssessment',
  'interfaceLanguage',
  'questionnaireLanguage',
  'questionnaireVersion',
  'reviewStatus',
  'practitionerInterpretation',
  'aiSeverityStatus',
  'aiSeverityScore',
  'aiSeverityCategory',
  'symptomsPresent',
  'spo2',
  'respiratoryRate',
  'locationCode',
  'aiStatus',
  'aiClassification',
  'aiConfidence',
  'uncertainFlag',
  'modelVersion',
  'audioSource',
  'durationSec',
  'groundTruthStatus',
  'referenceLabelCode',
  'isDemo',
]

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole years between two ISO instants, or `''` when either is unusable. */
export function ageYearsAt(birthDate: string, at: string): number | '' {
  const born = Date.parse(birthDate)
  const when = Date.parse(at)
  if (Number.isNaN(born) || Number.isNaN(when) || when < born) return ''
  const bornDate = new Date(born)
  const whenDate = new Date(when)
  let years = whenDate.getUTCFullYear() - bornDate.getUTCFullYear()
  const monthDelta = whenDate.getUTCMonth() - bornDate.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && whenDate.getUTCDate() < bornDate.getUTCDate())) {
    years -= 1
  }
  return years
}

function presentCodes(entries: { code: string; present: boolean }[] | undefined): string {
  return (entries ?? [])
    .filter((entry) => entry.present)
    .map((entry) => entry.code)
    .join(';')
}

function measurement(assessment: Assessment, code: string): number | '' {
  const found = assessment.vitals.find((vital) => vital.code === code)
  return found === undefined ? '' : found.value
}

export interface ExportInput {
  patients: Patient[]
  assessments: Assessment[]
  recordings: Recording[]
  labels: ResearchLabel[]
}

/**
 * Projects the clinical tables into export rows, one per recording.
 *
 * Pure, so the privacy property can be tested without a database, and so the
 * projection cannot quietly acquire a field by way of an I/O change.
 */
export function projectExportRows(input: ExportInput): ExportRow[] {
  const patientsById = new Map(input.patients.map((patient) => [patient.id, patient]))
  const labelsByRecording = new Map(input.labels.map((label) => [label.recordingId, label]))

  // Assessment sequence and day offsets are per patient, oldest first.
  const assessmentsByPatient = new Map<string, Assessment[]>()
  for (const assessment of input.assessments) {
    const list = assessmentsByPatient.get(assessment.patientId) ?? []
    list.push(assessment)
    assessmentsByPatient.set(assessment.patientId, list)
  }
  for (const list of assessmentsByPatient.values()) {
    list.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  }

  const assessmentMeta = new Map<string, { seq: number; dayOffset: number }>()
  for (const list of assessmentsByPatient.values()) {
    const first = list.length > 0 ? Date.parse(list[0].date) : Number.NaN
    list.forEach((assessment, index) => {
      const at = Date.parse(assessment.date)
      assessmentMeta.set(assessment.id, {
        seq: index + 1,
        dayOffset:
          Number.isNaN(at) || Number.isNaN(first) ? 0 : Math.round((at - first) / DAY_MS),
      })
    })
  }
  const assessmentsById = new Map(input.assessments.map((a) => [a.id, a]))

  const rows: ExportRow[] = []
  for (const recording of input.recordings) {
    const assessment = assessmentsById.get(recording.assessmentId)
    const patient = patientsById.get(recording.patientId)
    // A recording whose patient or assessment is not in scope is dropped
    // rather than exported with blanks: a row with no provenance is not data.
    if (assessment === undefined || patient === undefined) continue

    const meta = assessmentMeta.get(assessment.id) ?? { seq: 1, dayOffset: 0 }
    const label = labelsByRecording.get(recording.id)

    rows.push({
      studyId: patient.studyId,
      sex: patient.sex,
      ageYears: ageYearsAt(patient.birthDate, assessment.date),
      respiratoryHistory: presentCodes(patient.respiratoryHistory),
      familyHistory: presentCodes(patient.familyHistory),
      consentStatus: patient.consent?.status ?? '',
      consentLanguage: patient.consent?.language ?? '',
      consentTextVersion: patient.consent?.textVersion ?? '',
      assessmentSeq: meta.seq,
      daysSinceFirstAssessment: meta.dayOffset,
      interfaceLanguage: assessment.interfaceLanguage,
      questionnaireLanguage: assessment.questionnaireLanguage,
      questionnaireVersion: assessment.questionnaireVersion,
      reviewStatus: assessment.reviewStatus,
      practitionerInterpretation: assessment.practitionerSeverity?.interpretation ?? '',
      aiSeverityStatus: assessment.aiSeverity.status,
      aiSeverityScore: assessment.aiSeverity.score ?? '',
      aiSeverityCategory: assessment.aiSeverity.category ?? '',
      symptomsPresent: presentCodes(assessment.symptoms),
      spo2: measurement(assessment, MEASUREMENT_CODES.SPO2),
      respiratoryRate: measurement(assessment, MEASUREMENT_CODES.RESP_RATE_MANUAL),
      locationCode: recording.locationCode,
      aiStatus: recording.aiStatus,
      aiClassification: recording.aiClassification ?? '',
      aiConfidence: recording.aiConfidence ?? '',
      uncertainFlag: recording.uncertainFlag === true ? 1 : 0,
      modelVersion: recording.modelVersion ?? '',
      audioSource: recording.audioSource,
      durationSec: recording.durationSec,
      groundTruthStatus: label?.groundTruthStatus ?? '',
      referenceLabelCode: label?.labelCode ?? '',
      isDemo: recording.isDemo === 1 ? 1 : 0,
    })
  }

  // Deterministic order, so two exports of the same data are byte-identical
  // and a diff between them means the data changed.
  rows.sort(
    (a, b) =>
      a.studyId.localeCompare(b.studyId) ||
      a.assessmentSeq - b.assessmentSeq ||
      a.locationCode.localeCompare(b.locationCode),
  )
  return rows
}

/** Reads the tables an export needs, honouring demo-data visibility. */
export async function loadExportInput(
  db: AuscultaDB = defaultDb,
  demoEnabled = false,
): Promise<ExportInput> {
  const [patients, assessments, recordings, labels] = await Promise.all([
    visibleRows(db.patients, demoEnabled).toArray(),
    visibleRows(db.assessments, demoEnabled).toArray(),
    visibleRows(db.recordings, demoEnabled).toArray(),
    db.researchLabels.toArray(),
  ])
  return { patients, assessments, recordings, labels }
}

export async function buildExportRows(
  db: AuscultaDB = defaultDb,
  demoEnabled = false,
): Promise<ExportRow[]> {
  return projectExportRows(await loadExportInput(db, demoEnabled))
}

// --- serialisation ----------------------------------------------------------

/** RFC 4180 field: quote when the value contains a comma, quote or newline. */
export function csvField(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: readonly ExportRow[]): string {
  const header = EXPORT_COLUMNS.join(',')
  const body = rows.map((row) => EXPORT_COLUMNS.map((key) => csvField(row[key])).join(','))
  return [header, ...body].join('\r\n') + '\r\n'
}

export function toJson(rows: readonly ExportRow[]): string {
  // Rebuilt in EXPORT_COLUMNS order so the JSON and the CSV present the same
  // fields in the same order, and a reviewer can diff one against the other.
  const ordered = rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const key of EXPORT_COLUMNS) out[key] = row[key]
    return out
  })
  return JSON.stringify(ordered, null, 2)
}

/** `ausculta-export-2026-08-29.csv` */
export function exportFileName(extension: 'csv' | 'json', now: number = Date.now()): string {
  return `ausculta-export-${new Date(now).toISOString().slice(0, 10)}.${extension}`
}
