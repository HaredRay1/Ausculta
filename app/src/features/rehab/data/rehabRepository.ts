import { db as defaultDb, type AuscultaDB } from '../../../db/db'
import type { Patient, RehabCompletion, RehabPlan } from '../../../db/types'
import { readDemoMode } from '../../demo/demoMode'
import { isDemoRow, visibleRows } from '../../demo/visibility'
import type { RehabActivityCode } from '../content/techniques'
import {
  isApproved,
  isAwaitingApproval,
  parsePlanDetails,
  type RehabPlanDetails,
} from './planModel'

/**
 * Everything the rehabilitation screens read and write.
 *
 * A factory over an injected `AuscultaDB`, matching `auth/authService.ts` and
 * `features/patient/data/patientRepository.ts`, so tests run against a
 * throwaway database rather than the app singleton.
 *
 * The only write in the whole feature is `logCompletion`. A patient can record
 * that they did an activity their practitioner approved; they cannot create,
 * edit or approve a plan from here. Practitioner authoring is a separate,
 * practitioner-role surface and is not part of this module.
 */

/** Why the plan screen is showing what it is showing. */
export type PlanState =
  /** A practitioner approved a plan for this patient. */
  | 'approved'
  /** A plan exists but is still a draft or awaiting review. */
  | 'awaiting-approval'
  /** No plan row at all. */
  | 'none'

export interface RehabOverview {
  state: PlanState
  patient: Patient | null
  plan: RehabPlan | null
  details: RehabPlanDetails | null
  completions: RehabCompletion[]
  /** True when what is on screen belongs to a seeded fictional patient. */
  isFictional: boolean
}

export const EMPTY_OVERVIEW: RehabOverview = {
  state: 'none',
  patient: null,
  plan: null,
  details: null,
  completions: [],
  isFictional: false,
}

export interface RehabRepository {
  loadForUser(userId: string): Promise<RehabOverview>
  loadForPatient(patientId: string): Promise<RehabOverview>
  logCompletion(input: LogCompletionInput): Promise<RehabCompletion>
}

export interface LogCompletionInput {
  planId: string
  patientId: string
  activityCode: RehabActivityCode
  note?: string
  /** Injectable so tests are not clock-dependent. */
  completedAt?: string
}

export function createRehabRepository(database: AuscultaDB = defaultDb): RehabRepository {
  /**
   * The plan to show, when a patient has more than one row.
   *
   * An approved plan always beats an unapproved one, however new the unapproved
   * one is — an in-progress revision must never displace the plan the patient
   * is currently meant to be following. Within a tier, newest wins.
   */
  function pickPlan(plans: readonly RehabPlan[]): RehabPlan | null {
    if (plans.length === 0) return null
    const approved = plans.filter(isApproved)
    const pool = approved.length > 0 ? approved : plans
    return [...pool].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  }

  async function buildOverview(patient: Patient | null): Promise<RehabOverview> {
    if (patient === null) return EMPTY_OVERVIEW

    const plans = await database.rehabPlans.where('patientId').equals(patient.id).toArray()
    const plan = pickPlan(plans)

    if (plan === null) {
      return { ...EMPTY_OVERVIEW, patient, isFictional: isDemoRow(patient) }
    }

    const completions = isApproved(plan)
      ? await database.rehabCompletions.where('rehabPlanId').equals(plan.id).toArray()
      : []

    const state: PlanState = isApproved(plan)
      ? 'approved'
      : isAwaitingApproval(plan)
        ? 'awaiting-approval'
        : 'none'

    return {
      state,
      patient,
      // A rejected or unknown-status plan is not a plan. Returning its details
      // would let a screen render clinical instructions nobody approved.
      plan: state === 'none' ? null : plan,
      details: state === 'approved' ? parsePlanDetails(plan.details) : null,
      completions: completions.sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
      isFictional: isDemoRow(patient),
    }
  }

  /**
   * The patient record linked to this account.
   *
   * Demo rows are filtered through `visibleRows` so a seeded fictional patient
   * cannot appear while demo mode is off. Unlike the patient overview screens,
   * this does *not* fall back to a fictional patient when nothing is linked:
   * "your practitioner has not assigned a plan yet" is the correct, honest
   * screen for someone with no record, and inventing a plan to fill it — even a
   * clearly-labelled fictional one — is the exact failure this module exists to
   * prevent.
   */
  async function loadForUser(userId: string): Promise<RehabOverview> {
    if (userId === '') return EMPTY_OVERVIEW
    const demoEnabled = await readDemoMode(database)
    const patient =
      (await visibleRows(database.patients, demoEnabled)
        .and((row) => row.linkedUserId === userId)
        .first()) ?? null
    return buildOverview(patient)
  }

  async function loadForPatient(patientId: string): Promise<RehabOverview> {
    if (patientId === '') return EMPTY_OVERVIEW
    const patient = (await database.patients.get(patientId)) ?? null
    return buildOverview(patient)
  }

  /**
   * Records that the patient did an activity.
   *
   * Refuses unless the plan is approved and the activity is one the
   * practitioner actually assigned. A completion against an unapproved or
   * unassigned activity is a claim that the app suggested it, which it did not.
   */
  async function logCompletion(input: LogCompletionInput): Promise<RehabCompletion> {
    const plan = await database.rehabPlans.get(input.planId)
    if (plan === undefined) throw new Error(`No rehabilitation plan ${input.planId}`)
    if (!isApproved(plan)) {
      throw new Error('Cannot log an activity against a plan a practitioner has not approved')
    }

    const details = parsePlanDetails(plan.details)
    if (!details.activities.some((activity) => activity.code === input.activityCode)) {
      throw new Error(
        `Activity ${input.activityCode} is not assigned on plan ${input.planId}`,
      )
    }

    const completion: RehabCompletion = {
      id: crypto.randomUUID(),
      rehabPlanId: input.planId,
      patientId: input.patientId,
      completedAt: input.completedAt ?? new Date().toISOString(),
      details: {
        activityCode: input.activityCode,
        ...(input.note !== undefined && { note: input.note }),
      },
    }

    await database.rehabCompletions.add(completion)
    return completion
  }

  return { loadForUser, loadForPatient, logCompletion }
}

/** The repository bound to the app's real database. */
export const rehabRepository = createRehabRepository()
