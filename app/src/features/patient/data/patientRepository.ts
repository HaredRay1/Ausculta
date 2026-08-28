import { db as defaultDb, type AuscultaDB } from '../../../db/db'
import type { Assessment, ClinicalReview, Patient, Recording } from '../../../db/types'
import { readDemoMode } from '../../demo/demoMode'
import { resolveDemoStaff } from '../../demo/staff'
import { isDemoRow } from '../../demo/visibility'
import { summariseAssessment, type AssessmentSummary } from './resultView'

/**
 * Everything the patient screens read from the database.
 *
 * Built as a factory over an injected `AuscultaDB`, the same shape as
 * `auth/authService.ts` and `features/assessment/data/assessmentStore.ts`, so
 * tests run against a throwaway database rather than the app singleton.
 *
 * Nothing here writes. A patient looking at their own record is a read-only act
 * in this phase, and keeping the module read-only means no screen in this
 * feature can quietly become a way to edit a clinical record.
 */

/**
 * How the screen got the record it is showing.
 *
 * The distinction matters enough to be in the type rather than a boolean,
 * because `demo-preview` is the one case where the person on screen is not the
 * person holding the phone — and every screen has to say so, loudly, with the
 * design system's FictionalDataBanner.
 */
export type PatientRecordSource =
  /** This account is linked to a real patient record on this device. */
  | 'linked'
  /**
   * No linked record, but demo mode is on, so the fictional walkthrough patient
   * is shown as an example. Always labelled as invented.
   */
  | 'demo-preview'
  /** No linked record and no demo data: there is genuinely nothing to show. */
  | 'none'

/**
 * A person named on a record, resolved for display.
 *
 * Assessments point at staff by id, and two of those ids resolve differently:
 * a real account lives in the `users` table, while the fictional clinic's staff
 * are constants with no account at all (see features/demo/staff.ts). Without
 * this a validator would be shown a bare `DEMO-STAFF-DR1` where a doctor's name
 * belongs.
 */
export interface StaffDisplay {
  name: string
  designation?: string
}

export interface PatientOverview {
  source: PatientRecordSource
  patient: Patient | null
  /** Display names for every staff id named on this patient's record. */
  staffById: Record<string, StaffDisplay>
  /** Newest first — the order every patient screen lists visits in. */
  summaries: AssessmentSummary[]
  /** Keyed by assessment id. */
  assessmentsById: Record<string, Assessment>
  /** Every recording of this patient, newest first. */
  recordings: Recording[]
  /** Practitioner reviews, keyed by assessment id. */
  reviewsByAssessment: Record<string, ClinicalReview[]>
  /** `true` when what is on screen is seeded fictional data. */
  isFictional: boolean
}

/**
 * A `PatientOverview` that is known to have a record.
 *
 * `PatientScreen` only renders its children once `patient` is non-null, and
 * this is how that guarantee reaches them — so no screen has to cast, and none
 * can accidentally render a nullable patient as though it were present.
 */
export interface LoadedPatientOverview extends Omit<PatientOverview, 'patient'> {
  patient: Patient
}

export const EMPTY_OVERVIEW: PatientOverview = {
  source: 'none',
  patient: null,
  staffById: {},
  summaries: [],
  assessmentsById: {},
  recordings: [],
  reviewsByAssessment: {},
  isFictional: false,
}

export interface PatientRepository {
  /** The patient record linked to `userId`, or null. */
  findLinkedPatient(userId: string): Promise<Patient | null>
  /** Everything the patient screens need for `userId`, in one read. */
  loadOverview(userId: string): Promise<PatientOverview>
  /** The stored audio for a recording, or null when the blob is gone. */
  readAudio(audioBlobId: string): Promise<Blob | null>
}

export function createPatientRepository(database: AuscultaDB = defaultDb): PatientRepository {
  async function findLinkedPatient(userId: string): Promise<Patient | null> {
    if (userId === '') return null
    return (await database.patients.where('linkedUserId').equals(userId).first()) ?? null
  }

  /**
   * The fictional patient a validator is steered to, when there is one seeded.
   *
   * Validators are asthma patients who register an account minutes before being
   * asked to "find where you can view your respiratory assessment results".
   * Nobody has linked them to a patient record, so without this every screen
   * they are scored on would be an empty state — which the protocol counts as a
   * navigation failure, not as an unbuilt feature.
   *
   * Only reachable with demo mode on, which is a deliberate device state, and
   * every screen that takes this path carries the FictionalDataBanner. It is
   * never a substitute for a real record: `findLinkedPatient` is tried first and
   * always wins.
   *
   * Which fictional patient is chosen is decided here, from the seeded rows
   * themselves, rather than by asking the seeder — this module must not depend
   * on the demo fixture layer. "The one with the most visits" is the right rule
   * on its own terms: it is the record with the most for a validator to
   * navigate, and every screen they are scored on has content. Ties break on
   * id so the choice is stable between launches.
   */
  async function findDemoPreviewPatient(): Promise<Patient | null> {
    if (!(await readDemoMode(database))) return null

    const demoPatients = (await database.patients.toArray()).filter(isDemoRow)
    if (demoPatients.length === 0) return null

    const visitCounts = new Map<string, number>()
    for (const patient of demoPatients) {
      visitCounts.set(
        patient.id,
        await database.assessments.where('patientId').equals(patient.id).count(),
      )
    }

    return demoPatients.reduce((best, candidate) => {
      const bestVisits = visitCounts.get(best.id) ?? 0
      const candidateVisits = visitCounts.get(candidate.id) ?? 0
      if (candidateVisits !== bestVisits) return candidateVisits > bestVisits ? candidate : best
      return candidate.id.localeCompare(best.id) < 0 ? candidate : best
    })
  }

  async function loadOverview(userId: string): Promise<PatientOverview> {
    const linked = await findLinkedPatient(userId)
    const patient = linked ?? (await findDemoPreviewPatient())
    if (patient === null) return EMPTY_OVERVIEW

    const source: PatientRecordSource = linked === null ? 'demo-preview' : 'linked'

    const [assessments, recordings] = await Promise.all([
      database.assessments.where('patientId').equals(patient.id).toArray(),
      database.recordings.where('patientId').equals(patient.id).toArray(),
    ])

    const recordingsByAssessment = new Map<string, Recording[]>()
    for (const recording of recordings) {
      const list = recordingsByAssessment.get(recording.assessmentId)
      if (list === undefined) recordingsByAssessment.set(recording.assessmentId, [recording])
      else list.push(recording)
    }

    const assessmentsById: Record<string, Assessment> = {}
    for (const assessment of assessments) assessmentsById[assessment.id] = assessment

    // Newest first everywhere a patient sees a list: the visit they remember is
    // the one they just had.
    const summaries = [...assessments]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((assessment) =>
        summariseAssessment(assessment, recordingsByAssessment.get(assessment.id) ?? []),
      )

    const reviews =
      assessments.length === 0
        ? []
        : await database.clinicalReviews
            .where('assessmentId')
            .anyOf(assessments.map((assessment) => assessment.id))
            .toArray()

    const reviewsByAssessment: Record<string, ClinicalReview[]> = {}
    for (const review of reviews) {
      ;(reviewsByAssessment[review.assessmentId] ??= []).push(review)
    }

    const staffIds = new Set<string>()
    for (const assessment of assessments) {
      staffIds.add(assessment.assessorId)
      if (assessment.practitionerReviewerId !== undefined) {
        staffIds.add(assessment.practitionerReviewerId)
      }
    }
    for (const review of reviews) staffIds.add(review.practitionerId)

    const staffById: Record<string, StaffDisplay> = {}
    for (const id of staffIds) {
      const fictional = resolveDemoStaff(id)
      if (fictional !== null) {
        staffById[id] = { name: fictional.name, designation: fictional.designation }
        continue
      }
      const account = await database.users.get(id)
      if (account !== undefined) {
        staffById[id] = {
          name: account.name,
          ...(account.professionalDesignation !== undefined && {
            designation: account.professionalDesignation,
          }),
        }
      }
      // Nothing added for an id that resolves to neither. A screen showing a
      // name it cannot resolve would print an internal identifier at a patient.
    }

    return {
      source,
      patient,
      staffById,
      summaries,
      assessmentsById,
      recordings: [...recordings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      reviewsByAssessment,
      isFictional: isDemoRow(patient),
    }
  }

  async function readAudio(audioBlobId: string): Promise<Blob | null> {
    return (await database.audioBlobs.get(audioBlobId))?.blob ?? null
  }

  return { findLinkedPatient, loadOverview, readAudio }
}

/** The repository bound to the app's real database. */
export const patientRepository = createPatientRepository()

/**
 * Trend points are ordered oldest-first, which is the opposite of every list.
 *
 * Kept here rather than inside the chart so the ordering is a property of the
 * data and not of the component drawing it.
 */
export function oldestFirst(summaries: readonly AssessmentSummary[]): AssessmentSummary[] {
  return [...summaries].sort((a, b) => a.date.localeCompare(b.date))
}
