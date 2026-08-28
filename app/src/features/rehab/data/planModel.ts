import { REVIEW_STATUSES, type ReviewStatus } from '../../../db/codes'
import type { RehabCompletion, RehabPlan } from '../../../db/types'
import { CONTACT_FIELDS, PLAN_FIELDS, PLAN_ZONES, type ContactField, type PlanField, type PlanZone } from '../content/actionPlanTemplate'
import { isRehabActivityCode, type RehabActivityCode } from '../content/techniques'

/**
 * What sits inside `RehabPlan.details`, and how to read it safely.
 *
 * `details` is typed `unknown` in the shared schema, so every field is parsed
 * defensively here rather than cast. That is not ceremony: a half-written row,
 * a row from an older build, or a row seeded by another feature must degrade to
 * "your practitioner has not filled this in yet" rather than crash a screen or,
 * far worse, render a partially-parsed clinical instruction.
 *
 * ## Two independent gates
 *
 * 1. **Approval.** A plan is inert until a practitioner approves it. Approval
 *    is `approvalStatus === REVIEW_STATUSES.APPROVED`, reusing the existing
 *    review-status codes rather than inventing a parallel vocabulary. A DRAFT
 *    or PENDING_REVIEW plan is never shown as the plan to follow.
 * 2. **Completeness.** An approved plan can still be empty. Every clinical
 *    field is optional in the type, and a missing field renders as the
 *    not-filled-in message. Nothing here ever substitutes a default.
 *
 * There is deliberately no function in this module that *creates* plan content.
 * Reading and emptiness-checking only.
 */

export const REHAB_PLAN_SCHEMA_VERSION = 1

/** One zone's clinician-entered text. Every field optional; none defaulted. */
export type ZoneFields = Partial<Record<PlanField, string>>

export type PlanContacts = Partial<Record<ContactField, string>>

export interface ActionPlanDetails {
  templateId: string
  contacts: PlanContacts
  zones: Partial<Record<PlanZone, ZoneFields>>
  /** User id of the practitioner who wrote the clinical fields. */
  filledBy?: string
  filledAt?: string
}

export interface AssignedActivity {
  code: RehabActivityCode
  /** Free text set by the practitioner — "twice a day", "before PE". */
  frequency?: string
  duration?: string
  instructions?: string
}

export interface RehabPlanDetails {
  schemaVersion: number
  /** `null` when a practitioner approved a plan but wrote no action plan yet. */
  actionPlan: ActionPlanDetails | null
  activities: AssignedActivity[]
  notes?: string
  approvedAt?: string
  approvedBy?: string
}

export const EMPTY_PLAN_DETAILS: RehabPlanDetails = {
  schemaVersion: REHAB_PLAN_SCHEMA_VERSION,
  actionPlan: null,
  activities: [],
}

/* ---- Parsing ------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A string that actually says something.
 *
 * Whitespace-only counts as unfilled. A clinician who tabbed through a field
 * has not filled it in, and rendering a blank line under "Medicines" reads as
 * an instruction to take nothing.
 */
function readText(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function parseZone(value: unknown): ZoneFields {
  if (!isRecord(value)) return {}
  const zone: ZoneFields = {}
  for (const field of PLAN_FIELDS) {
    const text = readText(value, field)
    if (text !== undefined) zone[field] = text
  }
  return zone
}

function parseContacts(value: unknown): PlanContacts {
  if (!isRecord(value)) return {}
  const contacts: PlanContacts = {}
  for (const field of CONTACT_FIELDS) {
    const text = readText(value, field)
    if (text !== undefined) contacts[field] = text
  }
  return contacts
}

function parseActionPlan(value: unknown): ActionPlanDetails | null {
  if (!isRecord(value)) return null

  const zones: Partial<Record<PlanZone, ZoneFields>> = {}
  const rawZones = isRecord(value.zones) ? value.zones : {}
  for (const zone of PLAN_ZONES) {
    const parsed = parseZone(rawZones[zone])
    if (Object.keys(parsed).length > 0) zones[zone] = parsed
  }

  const templateId = readText(value, 'templateId')
  const filledBy = readText(value, 'filledBy')
  const filledAt = readText(value, 'filledAt')

  return {
    templateId: templateId ?? '',
    contacts: parseContacts(value.contacts),
    zones,
    ...(filledBy !== undefined && { filledBy }),
    ...(filledAt !== undefined && { filledAt }),
  }
}

function parseActivities(value: unknown): AssignedActivity[] {
  if (!Array.isArray(value)) return []

  const activities: AssignedActivity[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const code = entry.code
    // An unknown code is dropped rather than shown. It would render as a raw
    // identifier at a patient, and it may be an activity this build has
    // deliberately excluded on safety grounds.
    if (!isRehabActivityCode(code)) continue

    const frequency = readText(entry, 'frequency')
    const duration = readText(entry, 'duration')
    const instructions = readText(entry, 'instructions')

    activities.push({
      code,
      ...(frequency !== undefined && { frequency }),
      ...(duration !== undefined && { duration }),
      ...(instructions !== undefined && { instructions }),
    })
  }
  return activities
}

export function parsePlanDetails(details: unknown): RehabPlanDetails {
  if (!isRecord(details)) return EMPTY_PLAN_DETAILS

  const schemaVersion =
    typeof details.schemaVersion === 'number' ? details.schemaVersion : REHAB_PLAN_SCHEMA_VERSION
  const notes = readText(details, 'notes')
  const approvedAt = readText(details, 'approvedAt')
  const approvedBy = readText(details, 'approvedBy')

  return {
    schemaVersion,
    actionPlan: parseActionPlan(details.actionPlan),
    activities: parseActivities(details.activities),
    ...(notes !== undefined && { notes }),
    ...(approvedAt !== undefined && { approvedAt }),
    ...(approvedBy !== undefined && { approvedBy }),
  }
}

/* ---- Gates --------------------------------------------------------------- */

/**
 * The one rule that makes a plan real.
 *
 * The specification's boundary is that a practitioner approves, modifies,
 * rejects or sets the terms of every rehabilitation activity. Until they have
 * approved, the patient has no plan — not a provisional one, not a suggested
 * one, none.
 */
export function isApproved(plan: Pick<RehabPlan, 'approvalStatus'> | null | undefined): boolean {
  return plan?.approvalStatus === REVIEW_STATUSES.APPROVED
}

/**
 * A plan exists and is under review, but is not yet the plan to follow.
 * Worth telling the patient about, in different words from "no plan at all".
 */
export function isAwaitingApproval(
  plan: Pick<RehabPlan, 'approvalStatus'> | null | undefined,
): boolean {
  if (plan === null || plan === undefined) return false
  const status: ReviewStatus | string = plan.approvalStatus
  return status === REVIEW_STATUSES.DRAFT || status === REVIEW_STATUSES.PENDING_REVIEW
}

/** True when a zone has no clinician-entered content at all. */
export function isZoneEmpty(zone: ZoneFields | undefined): boolean {
  return zone === undefined || Object.keys(zone).length === 0
}

/** True when the whole action plan is blank — every zone and every contact. */
export function isActionPlanEmpty(actionPlan: ActionPlanDetails | null): boolean {
  if (actionPlan === null) return true
  const hasZoneContent = PLAN_ZONES.some((zone) => !isZoneEmpty(actionPlan.zones[zone]))
  const hasContacts = Object.keys(actionPlan.contacts).length > 0
  return !hasZoneContent && !hasContacts
}

/* ---- Completions --------------------------------------------------------- */

export interface CompletionDetails {
  activityCode: RehabActivityCode | null
  note?: string
}

export function parseCompletionDetails(details: unknown): CompletionDetails {
  if (!isRecord(details)) return { activityCode: null }
  const code = details.activityCode
  const note = readText(details, 'note')
  return {
    activityCode: isRehabActivityCode(code) ? code : null,
    ...(note !== undefined && { note }),
  }
}

/** Completions for one activity, newest first. */
export function completionsForActivity(
  completions: readonly RehabCompletion[],
  code: RehabActivityCode,
): RehabCompletion[] {
  return completions
    .filter((completion) => parseCompletionDetails(completion.details).activityCode === code)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
}

/** How many times an activity was logged in the `days` before `now`. */
export function countRecentCompletions(
  completions: readonly RehabCompletion[],
  code: RehabActivityCode,
  now: Date = new Date(),
  days = 7,
): number {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  return completionsForActivity(completions, code).filter(
    (completion) => completion.completedAt >= cutoff,
  ).length
}
