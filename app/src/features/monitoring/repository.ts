/**
 * Monitoring plans and the alert store.
 *
 * Two properties are enforced here rather than in a screen:
 *
 * 1. **A plan is inert until a practitioner approves it.** A draft creates no
 *    expectation, so it can raise no MISSED_MONITORING alert and tells a health
 *    worker to do nothing. An unapproved plan that quietly started generating
 *    obligations would be the app inventing clinical instructions.
 *
 * 2. **A practitioner only ever sees alerts for their own patients**, enforced
 *    by the query.
 *
 * Alerts store a type code and a JSON parameter bundle, never a sentence. The
 * `Alert.message` column is typed `string`, and `MonitoringPlan.details` is
 * typed `unknown`; both are the schema's extension points, so the payloads are
 * defined here and parsed defensively on the way back out — a row written by an
 * older build must never crash a screen.
 */

import { createAuditLogger } from '../../audit/audit'
import {
  ALERT_STATUSES,
  ROLES,
  type AlertStatus,
  type LocationCode,
  type Role,
} from '../../db/codes'
import { db as defaultDb, type AuscultaDB } from '../../db/db'
import type { Alert, MonitoringPlan, Patient } from '../../db/types'
import { readDemoMode } from '../demo/demoMode'
import { isVisible } from '../demo/visibility'
import {
  alertIdentity,
  evaluateAlerts,
  snapshotRecording,
  type AssessmentSnapshot,
} from './alertEngine'

/**
 * Plan lifecycle.
 *
 * Kept in this feature rather than db/codes.ts, following the precedent set by
 * AUDIT_ACTIONS: these are operational states of a care plan on one device.
 * If the research protocol ever exports plan adherence, they should be
 * promoted to the shared registry — flagged rather than assumed.
 */
export const PLAN_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const

export type PlanStatus = (typeof PLAN_STATUSES)[keyof typeof PLAN_STATUSES]

export const MONITORING_AUDIT_ACTIONS = {
  PLAN_DRAFTED: 'MONITORING_PLAN_DRAFTED',
  PLAN_APPROVED: 'MONITORING_PLAN_APPROVED',
  PLAN_ARCHIVED: 'MONITORING_PLAN_ARCHIVED',
  ALERT_RAISED: 'MONITORING_ALERT_RAISED',
  ALERT_ACKNOWLEDGED: 'MONITORING_ALERT_ACKNOWLEDGED',
  ALERT_CLOSED: 'MONITORING_ALERT_CLOSED',
} as const

export const MONITORING_ERRORS = {
  NOT_FOUND: 'MONITORING_NOT_FOUND',
  NOT_PERMITTED: 'MONITORING_NOT_PERMITTED',
  INVALID_INTERVAL: 'MONITORING_INVALID_INTERVAL',
  NO_LOCATIONS: 'MONITORING_NO_LOCATIONS',
  INVALID_DATE_RANGE: 'MONITORING_INVALID_DATE_RANGE',
  ALREADY_APPROVED: 'MONITORING_ALREADY_APPROVED',
  NOTE_REQUIRED: 'MONITORING_NOTE_REQUIRED',
} as const

export type MonitoringErrorCode =
  (typeof MONITORING_ERRORS)[keyof typeof MONITORING_ERRORS]

export class MonitoringError extends Error {
  constructor(readonly code: MonitoringErrorCode) {
    super(code)
    this.name = 'MonitoringError'
  }
}

export interface Actor {
  id: string
  role: Role
}

/** Only these roles write plans or adjudicate alerts. */
export const ROLES_THAT_CAN_PLAN: readonly Role[] = [ROLES.PRACTITIONER, ROLES.ADMIN]

/** Longest sensible gap between assessments. Beyond this it is not a plan. */
export const MAX_INTERVAL_DAYS = 365

/** What a plan actually says, stored in `MonitoringPlan.details`. */
export interface MonitoringPlanDetails {
  intervalDays: number
  locationCodes: LocationCode[]
  startDate: string
  endDate?: string
  followUpNote?: string
}

export interface DraftPlanInput {
  patientId: string
  intervalDays: number
  locationCodes: readonly LocationCode[]
  startDate: string
  endDate?: string
  followUpNote?: string
}

/** Parsed alert payload. Never a sentence — the screen supplies the words. */
export interface AlertPayload {
  locationCode?: LocationCode
  params: Record<string, string | number>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads a plan's details defensively.
 *
 * Returns null rather than throwing for a row written by an older build: a
 * malformed plan should read as "no plan", which is inert, rather than take
 * down the screen showing it.
 */
export function readPlanDetails(plan: MonitoringPlan): MonitoringPlanDetails | null {
  const details = plan.details
  if (!isRecord(details)) return null
  if (typeof details.intervalDays !== 'number' || details.intervalDays <= 0) return null
  if (!Array.isArray(details.locationCodes)) return null
  if (typeof details.startDate !== 'string') return null

  return {
    intervalDays: details.intervalDays,
    locationCodes: details.locationCodes as LocationCode[],
    startDate: details.startDate,
    ...(typeof details.endDate === 'string' && { endDate: details.endDate }),
    ...(typeof details.followUpNote === 'string' && { followUpNote: details.followUpNote }),
  }
}

/** Reads an alert's stored payload, tolerating anything unexpected. */
export function readAlertPayload(alert: Alert): AlertPayload {
  if (alert.message === undefined) return { params: {} }
  try {
    const parsed: unknown = JSON.parse(alert.message)
    if (!isRecord(parsed)) return { params: {} }
    const params = isRecord(parsed.params) ? parsed.params : {}
    return {
      ...(typeof parsed.locationCode === 'string' && {
        locationCode: parsed.locationCode as LocationCode,
      }),
      params: params as Record<string, string | number>,
    }
  } catch {
    // Not JSON — an older build may have stored prose. Show no parameters
    // rather than crash; the type code still carries the meaning.
    return { params: {} }
  }
}

/** An open alert with the patient it concerns and its parsed evidence. */
export interface AlertWithPatient {
  alert: Alert
  patient: Patient
  payload: AlertPayload
}

export function createMonitoringRepository(database: AuscultaDB = defaultDb) {
  const audit = createAuditLogger(database)

  function canPlan(actor: Actor): boolean {
    return ROLES_THAT_CAN_PLAN.includes(actor.role)
  }

  function patientVisibleTo(patient: Patient, actor: Actor): boolean {
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

  async function visiblePatient(
    patientId: string,
    actor: Actor,
  ): Promise<Patient | undefined> {
    const patient = await database.patients.get(patientId)
    if (patient === undefined) return undefined
    if (!patientVisibleTo(patient, actor)) return undefined

    const demoEnabled = await readDemoMode(database)
    return isVisible(patient, demoEnabled) ? patient : undefined
  }

  // -------------------------------------------------------------------------
  // Plans
  // -------------------------------------------------------------------------

  function validateDraft(input: DraftPlanInput): void {
    if (input.intervalDays <= 0 || input.intervalDays > MAX_INTERVAL_DAYS) {
      throw new MonitoringError(MONITORING_ERRORS.INVALID_INTERVAL)
    }
    if (input.locationCodes.length === 0) {
      throw new MonitoringError(MONITORING_ERRORS.NO_LOCATIONS)
    }
    if (input.endDate !== undefined && input.endDate < input.startDate) {
      throw new MonitoringError(MONITORING_ERRORS.INVALID_DATE_RANGE)
    }
  }

  /** Creates a plan in DRAFT. It is inert until `approvePlan`. */
  async function draftPlan(input: DraftPlanInput, actor: Actor): Promise<MonitoringPlan> {
    if (!canPlan(actor)) throw new MonitoringError(MONITORING_ERRORS.NOT_PERMITTED)

    const patient = await visiblePatient(input.patientId, actor)
    if (patient === undefined) throw new MonitoringError(MONITORING_ERRORS.NOT_FOUND)

    validateDraft(input)

    const details: MonitoringPlanDetails = {
      intervalDays: input.intervalDays,
      locationCodes: [...input.locationCodes],
      startDate: input.startDate,
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.followUpNote !== undefined && { followUpNote: input.followUpNote }),
    }

    const plan: MonitoringPlan = {
      id: crypto.randomUUID(),
      patientId: input.patientId,
      practitionerId: actor.id,
      status: PLAN_STATUSES.DRAFT,
      createdAt: new Date().toISOString(),
      details,
    }
    await database.monitoringPlans.add(plan)

    await audit({
      userId: actor.id,
      actionCode: MONITORING_AUDIT_ACTIONS.PLAN_DRAFTED,
      entityType: 'monitoringPlan',
      entityId: plan.id,
      patientId: plan.patientId,
      detail: { intervalDays: details.intervalDays, locations: details.locationCodes.length },
    })

    return plan
  }

  /**
   * Approves a plan, making it active.
   *
   * Archives any other active plan for the same patient first: two active plans
   * asking for different intervals is an instruction a health worker cannot
   * follow.
   */
  async function approvePlan(planId: string, actor: Actor): Promise<MonitoringPlan> {
    if (!canPlan(actor)) throw new MonitoringError(MONITORING_ERRORS.NOT_PERMITTED)

    const plan = await database.monitoringPlans.get(planId)
    if (plan === undefined) throw new MonitoringError(MONITORING_ERRORS.NOT_FOUND)

    const patient = await visiblePatient(plan.patientId, actor)
    if (patient === undefined) throw new MonitoringError(MONITORING_ERRORS.NOT_FOUND)
    if (plan.status === PLAN_STATUSES.ACTIVE) {
      throw new MonitoringError(MONITORING_ERRORS.ALREADY_APPROVED)
    }

    const others = await database.monitoringPlans
      .where('patientId')
      .equals(plan.patientId)
      .toArray()
    for (const other of others) {
      if (other.id !== plan.id && other.status === PLAN_STATUSES.ACTIVE) {
        await database.monitoringPlans.update(other.id, { status: PLAN_STATUSES.ARCHIVED })
      }
    }

    await database.monitoringPlans.update(plan.id, {
      status: PLAN_STATUSES.ACTIVE,
      practitionerId: actor.id,
    })

    await audit({
      userId: actor.id,
      actionCode: MONITORING_AUDIT_ACTIONS.PLAN_APPROVED,
      entityType: 'monitoringPlan',
      entityId: plan.id,
      patientId: plan.patientId,
    })

    return { ...plan, status: PLAN_STATUSES.ACTIVE, practitionerId: actor.id }
  }

  /** The one active plan for a patient, or undefined. Drafts are not returned. */
  async function activePlanFor(
    patientId: string,
    actor: Actor,
  ): Promise<MonitoringPlan | undefined> {
    const patient = await visiblePatient(patientId, actor)
    if (patient === undefined) return undefined

    const plans = await database.monitoringPlans.where('patientId').equals(patientId).toArray()
    return plans.find((p) => p.status === PLAN_STATUSES.ACTIVE)
  }

  /** Every plan for a patient, newest first, including drafts. */
  async function plansFor(patientId: string, actor: Actor): Promise<MonitoringPlan[]> {
    const patient = await visiblePatient(patientId, actor)
    if (patient === undefined) return []

    const plans = await database.monitoringPlans.where('patientId').equals(patientId).toArray()
    return plans.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  // -------------------------------------------------------------------------
  // Alerts
  // -------------------------------------------------------------------------

  /** Builds the engine's view of a patient's history, oldest first. */
  async function historyFor(patientId: string): Promise<AssessmentSnapshot[]> {
    const assessments = await database.assessments.where('patientId').equals(patientId).toArray()
    const recordings = await database.recordings.where('patientId').equals(patientId).toArray()

    return assessments
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((assessment) => ({
        assessmentId: assessment.id,
        date: assessment.date,
        recordings: recordings
          .filter((r) => r.assessmentId === assessment.id)
          .map(snapshotRecording),
      }))
  }

  /**
   * Runs the engine for a patient and stores anything not already open.
   *
   * Called after an assessment is saved. Returns only the alerts newly raised,
   * so a caller can tell the user what just happened without re-announcing
   * standing findings.
   */
  async function refreshAlerts(
    patientId: string,
    now: Date = new Date(),
  ): Promise<Alert[]> {
    const patient = await database.patients.get(patientId)
    if (patient === undefined) return []

    const history = await historyFor(patientId)

    const plans = await database.monitoringPlans.where('patientId').equals(patientId).toArray()
    const active = plans.find((p) => p.status === PLAN_STATUSES.ACTIVE)
    const details = active === undefined ? null : readPlanDetails(active)

    const proposals = evaluateAlerts({
      history,
      now,
      expectation:
        details === null ? null : { intervalDays: details.intervalDays, active: true },
    })

    const existing = await database.alerts.where('patientId').equals(patientId).toArray()
    const openIdentities = new Set(
      existing
        .filter((a) => a.status !== ALERT_STATUSES.CLOSED)
        .map((a) => {
          const payload = readAlertPayload(a)
          return `${a.typeCode}:${payload.locationCode ?? '-'}`
        }),
    )

    const raised: Alert[] = []
    for (const proposal of proposals) {
      if (openIdentities.has(alertIdentity(proposal))) continue

      const alert: Alert = {
        id: crypto.randomUUID(),
        patientId,
        typeCode: proposal.typeCode,
        status: ALERT_STATUSES.NEW,
        // Type code plus evidence. The screen supplies the sentence, in the
        // reader's language.
        message: JSON.stringify({
          ...(proposal.locationCode !== undefined && { locationCode: proposal.locationCode }),
          params: proposal.params,
        }),
        createdAt: now.toISOString(),
      }
      await database.alerts.add(alert)
      raised.push(alert)
      openIdentities.add(alertIdentity(proposal))

      await audit({
        userId: 'SYSTEM',
        actionCode: MONITORING_AUDIT_ACTIONS.ALERT_RAISED,
        entityType: 'alert',
        entityId: alert.id,
        patientId,
        detail: { typeCode: alert.typeCode },
      })
    }

    return raised
  }

  /** Open alerts across the actor's own patients, newest first. */
  async function openAlerts(actor: Actor): Promise<AlertWithPatient[]> {
    if (!canPlan(actor)) return []

    const demoEnabled = await readDemoMode(database)
    const alerts = await database.alerts.toArray()
    const rows: AlertWithPatient[] = []

    for (const alert of alerts) {
      if (alert.status === ALERT_STATUSES.CLOSED) continue

      const patient = await database.patients.get(alert.patientId)
      if (patient === undefined) continue
      if (!patientVisibleTo(patient, actor)) continue
      if (!isVisible(patient, demoEnabled)) continue

      rows.push({ alert, patient, payload: readAlertPayload(alert) })
    }

    return rows.sort((a, b) => b.alert.createdAt.localeCompare(a.alert.createdAt))
  }

  async function setAlertStatus(
    alertId: string,
    status: AlertStatus,
    note: string,
    actor: Actor,
  ): Promise<Alert> {
    if (!canPlan(actor)) throw new MonitoringError(MONITORING_ERRORS.NOT_PERMITTED)

    const alert = await database.alerts.get(alertId)
    if (alert === undefined) throw new MonitoringError(MONITORING_ERRORS.NOT_FOUND)

    const patient = await visiblePatient(alert.patientId, actor)
    if (patient === undefined) throw new MonitoringError(MONITORING_ERRORS.NOT_FOUND)

    // Closing an alert is a decision that it needed no action, so it has to be
    // attributable and explained. Acknowledging is just "seen", and does not.
    if (status === ALERT_STATUSES.CLOSED && note.trim() === '') {
      throw new MonitoringError(MONITORING_ERRORS.NOTE_REQUIRED)
    }

    await database.alerts.update(alertId, {
      status,
      acknowledgedBy: actor.id,
      acknowledgedAt: new Date().toISOString(),
    })

    await audit({
      userId: actor.id,
      actionCode:
        status === ALERT_STATUSES.CLOSED
          ? MONITORING_AUDIT_ACTIONS.ALERT_CLOSED
          : MONITORING_AUDIT_ACTIONS.ALERT_ACKNOWLEDGED,
      entityType: 'alert',
      entityId: alertId,
      patientId: alert.patientId,
      detail: { typeCode: alert.typeCode },
    })

    const updated = await database.alerts.get(alertId)
    return updated ?? alert
  }

  return {
    draftPlan,
    approvePlan,
    activePlanFor,
    plansFor,
    refreshAlerts,
    openAlerts,
    acknowledgeAlert: (alertId: string, actor: Actor) =>
      setAlertStatus(alertId, ALERT_STATUSES.ACKNOWLEDGED, 'seen', actor),
    closeAlert: (alertId: string, note: string, actor: Actor) =>
      setAlertStatus(alertId, ALERT_STATUSES.CLOSED, note, actor),
    historyFor,
  }
}

export type MonitoringRepository = ReturnType<typeof createMonitoringRepository>
