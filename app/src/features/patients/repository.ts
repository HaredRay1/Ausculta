/**
 * The patient register.
 *
 * Role scoping lives here, not in the screens. `visible()` is the only way
 * into the table, so a screen cannot widen its own view — as opposed to
 * fetching everything and hiding some of it in the UI, where the next
 * component to call `db.patients.toArray()` quietly undoes the whole thing.
 *
 * Demo filtering is applied in the same place, through the shared
 * `visibleRows` helper, so a seeded patient disappears everywhere at once when
 * demo mode is switched off.
 *
 * Visibility rules:
 *   ADMIN         every patient
 *   PRACTITIONER  patients assigned to them
 *   HEALTH_WORKER patients assigned to them
 *   PATIENT       their own linked record
 *   RESEARCHER    none — researchers work from de-identified exports, and
 *                 giving them the named register here would defeat the point
 *                 of issuing a separate studyId at all
 *
 * Reads return `undefined`/`[]` for anything out of scope rather than throwing
 * a "forbidden" error, so a worker cannot probe for whether a clinic id exists
 * on someone else's list. Writes throw, because by then the caller has already
 * had to get past a read.
 */

import { createAuditLogger } from '../../audit/audit'
import {
  ROLES,
  type FamilyHistoryCode,
  type RespiratoryHistoryCode,
  type Role,
} from '../../db/codes'
import { db as defaultDb, type AuscultaDB } from '../../db/db'
import type { DemoFlag, HistoryEntry, Patient } from '../../db/types'
import { normaliseUsername } from '../../auth/authService'
import { readDemoMode } from '../demo/demoMode'
import { isVisible, visibleRows } from '../demo/visibility'
import { buildPatientConsent, type RecordConsentInput } from './consent'
import { generatePatientId, generateStudyId, normalisePatientId } from './ids'
import {
  validateDemographics,
  validateFamilyHistory,
  validateRespiratoryHistory,
  type DemographicsInput,
} from './validation'

/**
 * Patient-record events for the audit trail.
 *
 * These follow the precedent set by AUDIT_ACTIONS in audit/audit.ts rather
 * than living in db/codes.ts: they are operational events that never leave the
 * device, unlike consent status, which is a study variable and belongs with
 * the exported vocabularies. Display strings live in `locales/en/patients.json`
 * under `auditAction.*`.
 */
export const PATIENT_AUDIT_ACTIONS = {
  PATIENT_CREATED: 'PATIENT_CREATED',
  PATIENT_UPDATED: 'PATIENT_UPDATED',
  PATIENT_CONSENT_RECORDED: 'PATIENT_CONSENT_RECORDED',
  PATIENT_ASSIGNED: 'PATIENT_ASSIGNED',
  PATIENT_UNASSIGNED: 'PATIENT_UNASSIGNED',
  PATIENT_ACCOUNT_LINKED: 'PATIENT_ACCOUNT_LINKED',
  PATIENT_ACCOUNT_UNLINKED: 'PATIENT_ACCOUNT_UNLINKED',
} as const

export type PatientAuditAction =
  (typeof PATIENT_AUDIT_ACTIONS)[keyof typeof PATIENT_AUDIT_ACTIONS]

export const PATIENT_REPO_ERRORS = {
  NOT_FOUND: 'PATIENT_NOT_FOUND',
  NOT_PERMITTED: 'PATIENT_NOT_PERMITTED',
  INVALID_DEMOGRAPHICS: 'PATIENT_INVALID_DEMOGRAPHICS',
  INVALID_HISTORY: 'PATIENT_INVALID_HISTORY',
  INVALID_CONSENT: 'PATIENT_INVALID_CONSENT',
  ID_COLLISION: 'PATIENT_ID_COLLISION',
  USER_NOT_FOUND: 'PATIENT_USER_NOT_FOUND',
  USER_NOT_A_PATIENT: 'PATIENT_USER_NOT_A_PATIENT',
  USER_ALREADY_LINKED: 'PATIENT_USER_ALREADY_LINKED',
} as const

export type PatientRepoErrorCode =
  (typeof PATIENT_REPO_ERRORS)[keyof typeof PATIENT_REPO_ERRORS]

/** Carries a code the UI translates; the message is for developers only. */
export class PatientError extends Error {
  constructor(
    readonly code: PatientRepoErrorCode,
    readonly detail?: unknown,
  ) {
    super(code)
    this.name = 'PatientError'
  }
}

/** The signed-in user performing an operation. */
export interface Actor {
  id: string
  role: Role
}

/** Roles allowed to register a new patient. */
export const ROLES_THAT_CAN_REGISTER: readonly Role[] = [
  ROLES.HEALTH_WORKER,
  ROLES.PRACTITIONER,
  ROLES.ADMIN,
]

/**
 * Roles allowed to REMOVE an assignment.
 *
 * Adding one is a referral and any clinic user with the record open may do it;
 * removing one takes a patient off somebody's list, which is a supervisory act.
 */
export const ROLES_THAT_CAN_UNASSIGN: readonly Role[] = [ROLES.PRACTITIONER, ROLES.ADMIN]

export interface CreatePatientInput {
  demographics: DemographicsInput
  preferredLanguage: string
  respiratoryHistory?: readonly HistoryEntry<RespiratoryHistoryCode>[]
  familyHistory?: readonly HistoryEntry<FamilyHistoryCode>[]
  consent?: Omit<RecordConsentInput, 'recordedBy'>
  isDemo?: DemoFlag
}

export interface UpdatePatientInput {
  demographics?: DemographicsInput
  preferredLanguage?: string
  respiratoryHistory?: readonly HistoryEntry<RespiratoryHistoryCode>[]
  familyHistory?: readonly HistoryEntry<FamilyHistoryCode>[]
}

export interface AssignmentChange {
  practitionerIds?: readonly string[]
  healthWorkerIds?: readonly string[]
}

function addUnique(existing: readonly string[], incoming: readonly string[] = []): string[] {
  return Array.from(new Set([...existing, ...incoming]))
}

function removeAll(existing: readonly string[], outgoing: readonly string[] = []): string[] {
  const drop = new Set(outgoing)
  return existing.filter((id) => !drop.has(id))
}

export function createPatientRepository(database: AuscultaDB = defaultDb) {
  const audit = createAuditLogger(database)

  /**
   * The visible set: demo filtering first, then role scoping.
   *
   * Both filters run here rather than in the caller, so `visible()` is the one
   * accessor and no screen can widen its own view by querying the table
   * directly. The demo pass goes through `visibleRows` and is narrowed with
   * `.and(...)`, never by starting a fresh query off the table — starting fresh
   * is how demo rows leak back in when demo mode is off.
   *
   * That does mean role scoping is now a repository-side predicate rather than
   * a multiEntry index lookup. The guarantee is unchanged, since this is the
   * only way in; what changes is that the collection is walked instead of
   * seeked. At clinic scale — hundreds of patients on one device — that is not
   * worth reintroducing a path that bypasses demo filtering to avoid.
   */
  async function visible(actor: Actor): Promise<Patient[]> {
    if (actor.role === ROLES.RESEARCHER) return []

    const demoEnabled = await readDemoMode(database)
    const rows = visibleRows(database.patients, demoEnabled)

    switch (actor.role) {
      case ROLES.ADMIN:
        return rows.toArray()
      case ROLES.PRACTITIONER:
        return rows.and((p) => p.assignedPractitionerIds.includes(actor.id)).toArray()
      case ROLES.HEALTH_WORKER:
        return rows.and((p) => p.assignedHealthWorkerIds.includes(actor.id)).toArray()
      case ROLES.PATIENT:
        return rows.and((p) => p.linkedUserId === actor.id).toArray()
      default:
        return []
    }
  }

  function isVisibleTo(patient: Patient, actor: Actor): boolean {
    switch (actor.role) {
      case ROLES.ADMIN:
        return true
      case ROLES.PRACTITIONER:
        return patient.assignedPractitionerIds.includes(actor.id)
      case ROLES.HEALTH_WORKER:
        return patient.assignedHealthWorkerIds.includes(actor.id)
      case ROLES.PATIENT:
        return patient.linkedUserId === actor.id
      default:
        return false
    }
  }

  /**
   * The username behind `linkedUserId`, or undefined.
   *
   * The detail screen promises a username and was interpolating the raw user
   * id, so a health worker read an opaque UUID where a name was offered. The
   * lookup lives here because the screen has no business querying the users
   * table itself.
   */
  async function linkedUsername(patient: Patient): Promise<string | undefined> {
    if (patient.linkedUserId === undefined) return undefined
    const user = await database.users.get(patient.linkedUserId)
    return user?.username
  }

  async function get(id: string, actor: Actor): Promise<Patient | undefined> {
    const patient = await database.patients.get(id)
    if (patient === undefined) return undefined
    if (!isVisibleTo(patient, actor)) return undefined

    // Demo mode is checked here too. Without it a seeded patient stays
    // reachable by typing the URL after demo mode is switched off.
    const demoEnabled = await readDemoMode(database)
    return isVisible(patient, demoEnabled) ? patient : undefined
  }

  /** Loads for writing. Anything the actor cannot see is simply "not found". */
  async function getForWrite(id: string, actor: Actor): Promise<Patient> {
    const patient = await get(id, actor)
    if (patient === undefined) throw new PatientError(PATIENT_REPO_ERRORS.NOT_FOUND)
    return patient
  }

  function byName(a: Patient, b: Patient): number {
    return a.name.localeCompare(b.name)
  }

  async function list(actor: Actor): Promise<Patient[]> {
    return (await visible(actor)).sort(byName)
  }

  /**
   * Name or clinic-id search within the actor's own visible set.
   *
   * Deliberately does not match on studyId: that identifier exists so research
   * data cannot be tied back to a person, and a clinic search box that accepts
   * it would hand anyone holding an export a re-identification lookup.
   */
  async function search(query: string, actor: Actor): Promise<Patient[]> {
    const patients = await list(actor)
    const trimmed = query.trim()
    if (trimmed === '') return patients

    const asId = normalisePatientId(trimmed)
    if (asId !== '') return patients.filter((p) => p.id === asId)

    const needle = trimmed.toLocaleLowerCase()
    return patients.filter((p) => p.name.toLocaleLowerCase().includes(needle))
  }

  function validateHistories(input: {
    respiratoryHistory?: readonly HistoryEntry<RespiratoryHistoryCode>[]
    familyHistory?: readonly HistoryEntry<FamilyHistoryCode>[]
  }) {
    const respiratory = validateRespiratoryHistory(input.respiratoryHistory ?? [])
    if (!respiratory.ok) {
      throw new PatientError(PATIENT_REPO_ERRORS.INVALID_HISTORY, respiratory.errors)
    }
    const family = validateFamilyHistory(input.familyHistory ?? [])
    if (!family.ok) {
      throw new PatientError(PATIENT_REPO_ERRORS.INVALID_HISTORY, family.errors)
    }
    return { respiratory: respiratory.value, family: family.value }
  }

  /** A clinic id nothing else is using. Collisions are vanishing but not impossible. */
  async function freshPatientId(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = generatePatientId()
      if ((await database.patients.get(id)) === undefined) return id
    }
    throw new PatientError(PATIENT_REPO_ERRORS.ID_COLLISION)
  }

  /** The schema indexes studyId but does not enforce uniqueness, so check it. */
  async function freshStudyId(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const studyId = generateStudyId()
      const clash = await database.patients.where('studyId').equals(studyId).first()
      if (clash === undefined) return studyId
    }
    throw new PatientError(PATIENT_REPO_ERRORS.ID_COLLISION)
  }

  async function create(input: CreatePatientInput, actor: Actor): Promise<Patient> {
    if (!ROLES_THAT_CAN_REGISTER.includes(actor.role)) {
      throw new PatientError(PATIENT_REPO_ERRORS.NOT_PERMITTED)
    }

    const demographics = validateDemographics(input.demographics)
    if (!demographics.ok) {
      throw new PatientError(PATIENT_REPO_ERRORS.INVALID_DEMOGRAPHICS, demographics.errors)
    }

    const histories = validateHistories(input)

    let consent: Patient['consent'] = null
    if (input.consent !== undefined) {
      const built = buildPatientConsent({ ...input.consent, recordedBy: actor.id })
      if (!built.ok) throw new PatientError(PATIENT_REPO_ERRORS.INVALID_CONSENT, built.error)
      consent = built.value
    }

    // The registering user is assigned to their own patient. Without this a
    // health worker finishes registration and the record disappears from the
    // very list they are looking at.
    const patient: Patient = {
      ...demographics.value,
      id: await freshPatientId(),
      studyId: await freshStudyId(),
      assignedPractitionerIds: actor.role === ROLES.PRACTITIONER ? [actor.id] : [],
      assignedHealthWorkerIds: actor.role === ROLES.HEALTH_WORKER ? [actor.id] : [],
      consent,
      respiratoryHistory: histories.respiratory,
      familyHistory: histories.family,
      preferredLanguage: input.preferredLanguage,
      isDemo: input.isDemo ?? 0,
      createdAt: new Date().toISOString(),
    }

    await database.patients.add(patient)

    await audit({
      userId: actor.id,
      actionCode: PATIENT_AUDIT_ACTIONS.PATIENT_CREATED,
      entityType: 'patient',
      entityId: patient.id,
      patientId: patient.id,
      detail: { isDemo: patient.isDemo, consentRecorded: consent !== null },
    })

    return patient
  }

  async function update(
    id: string,
    input: UpdatePatientInput,
    actor: Actor,
  ): Promise<Patient> {
    const existing = await getForWrite(id, actor)
    const changed: string[] = []
    const next: Patient = { ...existing }

    if (input.demographics !== undefined) {
      const demographics = validateDemographics(input.demographics)
      if (!demographics.ok) {
        throw new PatientError(PATIENT_REPO_ERRORS.INVALID_DEMOGRAPHICS, demographics.errors)
      }
      for (const [key, value] of Object.entries(demographics.value)) {
        if (existing[key as keyof Patient] !== value) changed.push(key)
      }
      // Assign wholesale so a cleared optional field is actually cleared.
      Object.assign(next, {
        name: demographics.value.name,
        birthDate: demographics.value.birthDate,
        sex: demographics.value.sex,
        address: demographics.value.address,
        contact: demographics.value.contact,
      })
    }

    if (input.respiratoryHistory !== undefined || input.familyHistory !== undefined) {
      const histories = validateHistories({
        respiratoryHistory: input.respiratoryHistory ?? existing.respiratoryHistory,
        familyHistory: input.familyHistory ?? existing.familyHistory,
      })
      if (input.respiratoryHistory !== undefined) {
        next.respiratoryHistory = histories.respiratory
        changed.push('respiratoryHistory')
      }
      if (input.familyHistory !== undefined) {
        next.familyHistory = histories.family
        changed.push('familyHistory')
      }
    }

    if (input.preferredLanguage !== undefined && input.preferredLanguage !== existing.preferredLanguage) {
      next.preferredLanguage = input.preferredLanguage
      changed.push('preferredLanguage')
    }

    await database.patients.put(next)

    // Field NAMES only. The audit trail's job is accountability — who touched
    // which record, when — and copying the values into it would just create a
    // second, longer-lived copy of the same personal data.
    await audit({
      userId: actor.id,
      actionCode: PATIENT_AUDIT_ACTIONS.PATIENT_UPDATED,
      entityType: 'patient',
      entityId: next.id,
      patientId: next.id,
      detail: { changed },
    })

    return next
  }

  async function recordConsent(
    id: string,
    input: Omit<RecordConsentInput, 'recordedBy'>,
    actor: Actor,
  ): Promise<Patient> {
    const existing = await getForWrite(id, actor)

    // recordedBy always comes from the session, never from the caller: the
    // point of the field is who was actually standing there.
    const built = buildPatientConsent({ ...input, recordedBy: actor.id })
    if (!built.ok) throw new PatientError(PATIENT_REPO_ERRORS.INVALID_CONSENT, built.error)

    const next: Patient = { ...existing, consent: built.value }
    await database.patients.put(next)

    await audit({
      userId: actor.id,
      actionCode: PATIENT_AUDIT_ACTIONS.PATIENT_CONSENT_RECORDED,
      entityType: 'patient',
      entityId: next.id,
      patientId: next.id,
      detail: {
        status: built.value.status,
        language: built.value.language,
        textVersion: built.value.textVersion,
      },
    })

    return next
  }

  async function assign(
    id: string,
    change: AssignmentChange,
    actor: Actor,
  ): Promise<Patient> {
    const existing = await getForWrite(id, actor)

    const next: Patient = {
      ...existing,
      assignedPractitionerIds: addUnique(existing.assignedPractitionerIds, change.practitionerIds),
      assignedHealthWorkerIds: addUnique(existing.assignedHealthWorkerIds, change.healthWorkerIds),
    }
    await database.patients.put(next)

    await audit({
      userId: actor.id,
      actionCode: PATIENT_AUDIT_ACTIONS.PATIENT_ASSIGNED,
      entityType: 'patient',
      entityId: next.id,
      patientId: next.id,
      detail: {
        practitionerIds: change.practitionerIds ?? [],
        healthWorkerIds: change.healthWorkerIds ?? [],
      },
    })

    return next
  }

  async function unassign(
    id: string,
    change: AssignmentChange,
    actor: Actor,
  ): Promise<Patient> {
    if (!ROLES_THAT_CAN_UNASSIGN.includes(actor.role)) {
      throw new PatientError(PATIENT_REPO_ERRORS.NOT_PERMITTED)
    }
    const existing = await getForWrite(id, actor)

    const next: Patient = {
      ...existing,
      assignedPractitionerIds: removeAll(existing.assignedPractitionerIds, change.practitionerIds),
      assignedHealthWorkerIds: removeAll(existing.assignedHealthWorkerIds, change.healthWorkerIds),
    }
    await database.patients.put(next)

    await audit({
      userId: actor.id,
      actionCode: PATIENT_AUDIT_ACTIONS.PATIENT_UNASSIGNED,
      entityType: 'patient',
      entityId: next.id,
      patientId: next.id,
      detail: {
        practitionerIds: change.practitionerIds ?? [],
        healthWorkerIds: change.healthWorkerIds ?? [],
      },
    })

    return next
  }

  /** Links this record to an existing patient login, by username. */
  async function linkAccount(id: string, username: string, actor: Actor): Promise<Patient> {
    const existing = await getForWrite(id, actor)

    const normalised = normaliseUsername(username)
    const user = await database.users.where('username').equals(normalised).first()
    if (user === undefined) throw new PatientError(PATIENT_REPO_ERRORS.USER_NOT_FOUND)
    if (user.role !== ROLES.PATIENT) {
      throw new PatientError(PATIENT_REPO_ERRORS.USER_NOT_A_PATIENT)
    }

    // One login must not reach two records, or a patient signs in and sees
    // somebody else's recordings.
    const alreadyLinked = await database.patients.where('linkedUserId').equals(user.id).first()
    if (alreadyLinked !== undefined && alreadyLinked.id !== existing.id) {
      throw new PatientError(PATIENT_REPO_ERRORS.USER_ALREADY_LINKED)
    }

    const next: Patient = { ...existing, linkedUserId: user.id }
    await database.patients.put(next)

    await audit({
      userId: actor.id,
      actionCode: PATIENT_AUDIT_ACTIONS.PATIENT_ACCOUNT_LINKED,
      entityType: 'patient',
      entityId: next.id,
      patientId: next.id,
      detail: { linkedUserId: user.id },
    })

    return next
  }

  async function unlinkAccount(id: string, actor: Actor): Promise<Patient> {
    const existing = await getForWrite(id, actor)
    const previous = existing.linkedUserId

    const next: Patient = { ...existing }
    delete next.linkedUserId
    await database.patients.put(next)

    await audit({
      userId: actor.id,
      actionCode: PATIENT_AUDIT_ACTIONS.PATIENT_ACCOUNT_UNLINKED,
      entityType: 'patient',
      entityId: next.id,
      patientId: next.id,
      detail: { previousLinkedUserId: previous },
    })

    return next
  }

  return {
    create,
    get,
    linkedUsername,
    list,
    search,
    update,
    recordConsent,
    assign,
    unassign,
    linkAccount,
    unlinkAccount,
  }
}

export type PatientRepository = ReturnType<typeof createPatientRepository>
