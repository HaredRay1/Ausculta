import { db as defaultDb, type AuscultaDB } from '../../db/db'
import { ROLES } from '../../db/codes'
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
  /** Demo patients detached from a real account (repairing an earlier build). */
  unlinkedFromRealAccounts: number
}

/**
 * Gives every current user access to the seeded patients.
 *
 * Assignment follows role rather than spraying every id into both arrays:
 * health workers land in `assignedHealthWorkerIds`, practitioners in
 * `assignedPractitionerIds`, and admins and researchers in both since they may
 * legitimately arrive from either screen. Patient-role accounts get NOTHING
 * here: a caseload is not theirs, and their own record must be a real one.
 *
 * Safe and cheap to call on every launch: seven patients, and a write only
 * when something is genuinely missing.
 */
export async function syncDemoAssignments(
  db: AuscultaDB = defaultDb,
): Promise<AssignmentSyncResult> {
  const result: AssignmentSyncResult = { patientsUpdated: 0, unlinkedFromRealAccounts: 0 }
  // Runs before the early return: a device that still carries a bad link from
  // an earlier build must be repaired even if it has no accounts right now.
  result.unlinkedFromRealAccounts = await unlinkDemoPatientsFromAccounts(db)

  const users = await db.users.toArray()
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

  return result
}

/**
 * Detaches any seeded patient from a real account.
 *
 * An earlier version of this file did the opposite: it pointed a patient-role
 * account at the walkthrough case so that patient validators would not meet an
 * empty screen. That was wrong, and it caused a real defect — the owner
 * registered an account on the installed build and the app greeted him by the
 * fictional patient's name, because `patientRepository` resolves "my record"
 * through `linkedUserId` and the link was genuinely there.
 *
 * The reasoning that produced it was that validators need content. That does
 * not justify the app telling a real person they are someone else. An identity
 * is data, and the rule the rest of this feature keeps — never present invented
 * data as real — does not stop applying because the alternative is an empty
 * screen. A patient validator who needs content needs a demo ACCOUNT, not a
 * real account wearing a fictional person's record.
 *
 * This runs on every launch rather than once, so a device already carrying the
 * bad link repairs itself on next start instead of needing a reinstall. It only
 * ever touches rows flagged `isDemo`, so a real patient's link is never removed.
 */
async function unlinkDemoPatientsFromAccounts(db: AuscultaDB): Promise<number> {
  const linked = await demoRowsOnly(db.patients)
    .filter((patient) => patient.linkedUserId !== undefined)
    .toArray()

  for (const patient of linked) {
    const repaired = { ...patient }
    delete repaired.linkedUserId
    await db.patients.put(repaired)
  }
  return linked.length
}
