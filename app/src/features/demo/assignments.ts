import { db as defaultDb, type AuscultaDB } from '../../db/db'
import { ROLES } from '../../db/codes'
import { walkthroughPatientSpec } from './dataset'
import { demoPatientId } from './seed'
import { demoRowsOnly } from './visibility'

/**
 * Making seeded patients actually reachable.
 *
 * Patient lists scope by role at the query: a health worker or practitioner
 * only sees patients whose `assignedHealthWorkerIds` / `assignedPractitionerIds`
 * contain their own user id. Seeded patients are assigned to the fictional
 * clinic staff in `staff.ts`, who are constants rather than rows in `users` —
 * so without this, the demo data exists in the database and renders as an
 * empty screen for every role except admin. Which is the exact failure demo
 * data was seeded to prevent.
 *
 * The fix has to survive the ordering problem: on a fresh device the fictional
 * clinic is seeded before anybody has an account, so there is no user id to
 * assign to yet. So this is not a one-off step during seeding — it runs on
 * every launch, is idempotent, and only writes the patients that actually
 * changed.
 *
 * Assignment is additive. The demo staff ids stay, because the assessments
 * reference them as assessor and reviewer and the fiction should stay
 * internally consistent; real user ids are added alongside.
 */

/** Adds `ids` to `existing` without duplicating, preserving order. */
function union(existing: readonly string[], ids: readonly string[]): string[] {
  const merged = [...existing]
  for (const id of ids) {
    if (!merged.includes(id)) merged.push(id)
  }
  return merged
}

export interface AssignmentSyncResult {
  /** Demo patients whose assignment arrays changed. */
  patientsUpdated: number
  /** True when a demo patient was linked to a patient-role account. */
  linkedPatientAccount: boolean
}

/**
 * Gives every current user access to the seeded patients.
 *
 * Assignment follows role rather than spraying every id into both arrays:
 * health workers land in `assignedHealthWorkerIds`, practitioners in
 * `assignedPractitionerIds`, and admins and researchers in both since they may
 * legitimately arrive from either screen. Patient-role accounts are handled
 * separately below — a patient does not get a caseload, they get their own
 * record.
 *
 * Safe and cheap to call on every launch: seven patients, and a write only
 * when something is genuinely missing.
 */
export async function syncDemoAssignments(
  db: AuscultaDB = defaultDb,
): Promise<AssignmentSyncResult> {
  const users = await db.users.toArray()
  const result: AssignmentSyncResult = { patientsUpdated: 0, linkedPatientAccount: false }
  if (users.length === 0) return result

  const healthWorkerIds = users
    .filter((user) => user.role === ROLES.HEALTH_WORKER || user.role === ROLES.ADMIN || user.role === ROLES.RESEARCHER)
    .map((user) => user.id)
  const practitionerIds = users
    .filter((user) => user.role === ROLES.PRACTITIONER || user.role === ROLES.ADMIN || user.role === ROLES.RESEARCHER)
    .map((user) => user.id)

  const demoPatients = await demoRowsOnly(db.patients).toArray()

  for (const patient of demoPatients) {
    const assignedHealthWorkerIds = union(patient.assignedHealthWorkerIds, healthWorkerIds)
    const assignedPractitionerIds = union(patient.assignedPractitionerIds, practitionerIds)
    const changed =
      assignedHealthWorkerIds.length !== patient.assignedHealthWorkerIds.length ||
      assignedPractitionerIds.length !== patient.assignedPractitionerIds.length
    if (changed) {
      await db.patients.put({ ...patient, assignedHealthWorkerIds, assignedPractitionerIds })
      result.patientsUpdated += 1
    }
  }

  result.linkedPatientAccount = await linkWalkthroughToPatientAccount(db)
  return result
}

/**
 * Points a patient-role account at the walkthrough case.
 *
 * The largest group of validators are asthma patients signing in to a
 * patient-facing app, and their own record is the first thing they will look
 * for. Without a link they meet an empty screen and score it as a navigation
 * failure. The walkthrough patient is the right one to attach: she has asthma
 * and four visits, so the screens that matter have a trend to draw.
 *
 * Only ever fills an empty `linkedUserId`, and only for a demo patient, so it
 * cannot detach a real linkage or claim an account that is already spoken for.
 */
async function linkWalkthroughToPatientAccount(db: AuscultaDB): Promise<boolean> {
  const patientUser = await db.users.filter((user) => user.role === ROLES.PATIENT).first()
  if (patientUser === undefined) return false

  const alreadyLinked = await demoRowsOnly(db.patients)
    .filter((patient) => patient.linkedUserId === patientUser.id)
    .count()
  if (alreadyLinked > 0) return false

  const target = await db.patients.get(demoPatientId(walkthroughPatientSpec().seq))
  if (target === undefined || target.linkedUserId !== undefined) return false

  await db.patients.put({ ...target, linkedUserId: patientUser.id })
  return true
}
