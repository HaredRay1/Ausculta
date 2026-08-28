/**
 * Registration draft storage.
 *
 * Registration is a long form — demographics, then respiratory history, then
 * family history, then consent — filled in on a phone by someone who is
 * routinely interrupted mid-way. Losing the entry because they navigated away
 * is the single most likely way this feature wastes a health worker's time, so
 * the draft is written as they go and restored when they come back.
 *
 * Two things follow from the device being shared between clinic staff:
 *
 * - Drafts are keyed by user. Worker B opening the form must never be handed
 *   worker A's half-entered personal details.
 * - Drafts expire. An abandoned draft is patient data sitting on a shared
 *   phone with nobody coming back for it, so it is deleted on the first read
 *   past its lifetime rather than merely hidden.
 *
 * Stored in the `appMeta` table rather than localStorage, so it lives with the
 * rest of the app's data and survives the same way.
 */

import { db as defaultDb, type AuscultaDB } from '../../db/db'
import type { ConsentStatus, FamilyHistoryCode, RespiratoryHistoryCode } from '../../db/codes'
import type { HistoryEntry } from '../../db/types'
import type { DemographicsInput } from './validation'

/** After this, an untouched draft is discarded on the next read. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

const KEY_PREFIX = 'patients.registrationDraft.'

/** Namespaced so this cannot collide with another feature's appMeta keys. */
export function draftKeyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

export interface RegistrationDraft {
  demographics: DemographicsInput
  respiratoryHistory: HistoryEntry<RespiratoryHistoryCode>[]
  familyHistory: HistoryEntry<FamilyHistoryCode>[]
  /** Held here so a consent answer given before the form was finished is not lost. */
  consentStatus?: ConsentStatus
  consentDocumentVersion?: string
  preferredLanguage?: string
  updatedAt: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Shape check for a value coming back out of storage.
 *
 * Anything written by an older build, or half-written by a tab that was killed
 * mid-save, must be treated as absent rather than allowed to crash the form.
 */
function isDraft(value: unknown): value is RegistrationDraft {
  if (!isPlainObject(value)) return false
  if (!isPlainObject(value.demographics)) return false
  if (!Array.isArray(value.respiratoryHistory)) return false
  if (!Array.isArray(value.familyHistory)) return false
  if (typeof value.updatedAt !== 'string') return false
  return true
}

export function createDraftStore(database: AuscultaDB = defaultDb) {
  async function save(
    userId: string,
    draft: Omit<RegistrationDraft, 'updatedAt'>,
    now: Date = new Date(),
  ): Promise<void> {
    const value: RegistrationDraft = { ...draft, updatedAt: now.toISOString() }
    await database.appMeta.put({ key: draftKeyFor(userId), value })
  }

  async function clear(userId: string): Promise<void> {
    await database.appMeta.delete(draftKeyFor(userId))
  }

  async function load(
    userId: string,
    now: Date = new Date(),
  ): Promise<RegistrationDraft | undefined> {
    const entry = await database.appMeta.get(draftKeyFor(userId))
    if (entry === undefined) return undefined

    if (!isDraft(entry.value)) {
      await clear(userId)
      return undefined
    }

    const savedAt = Date.parse(entry.value.updatedAt)
    if (Number.isNaN(savedAt) || now.getTime() - savedAt > DRAFT_MAX_AGE_MS) {
      await clear(userId)
      return undefined
    }

    return entry.value
  }

  return { save, load, clear }
}

export type DraftStore = ReturnType<typeof createDraftStore>
