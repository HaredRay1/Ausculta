import { db as defaultDb, type AuscultaDB } from '../db/db'
import type { AuditLog } from '../db/types'

/**
 * Append-only audit trail over the `auditLogs` table (db.ts schema v1).
 *
 * Every entry is written with an ISO-8601 UTC timestamp and an auto-incrementing
 * `seq`, so the order of events survives even when two actions land inside the
 * same millisecond — which matters on a shared clinic device where the
 * chronology of who did what is the point of keeping the log at all.
 */

/**
 * Action codes emitted by the auth layer.
 *
 * These are deliberately NOT in `db/codes.ts`: that registry is the clinical
 * code vocabulary and its CODE_REGISTRY drives an i18n exhaustiveness test.
 * Audit actions are an operational vocabulary; their display strings live in
 * `i18n/locales/en/auth.json` under `auditAction.*`.
 */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  ACCOUNT_VERIFIED: 'ACCOUNT_VERIFIED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  ACCOUNT_REENABLED: 'ACCOUNT_REENABLED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ADMIN_BOOTSTRAPPED: 'ADMIN_BOOTSTRAPPED',
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

/**
 * Stand-in `userId` for an action with no authenticated actor — the only real
 * case being a failed login, where the submitted username is not (and must not
 * be assumed to be) a real user id.
 */
export const ANONYMOUS_ACTOR = 'ANONYMOUS'

/**
 * Minimal shape this module needs from the database — lets tests pass a stub
 * instead of a full AuscultaDB (same convention as i18n/missingKeyHandler.ts).
 */
export type AuditLogTable = Pick<AuscultaDB['auditLogs'], 'add'>
export interface AuditCapableDb {
  auditLogs: AuditLogTable
}

/** Everything but the timestamp and seq, which this module owns. */
export interface AuditEntryInput {
  userId: string
  actionCode: AuditAction | string
  entityType?: string
  entityId?: string
  patientId?: string
  detail?: unknown
}

/**
 * Appends one row to `auditLogs` and resolves with its `seq`.
 *
 * Never throws. A failed audit write resolves to `null` instead of rejecting,
 * because every caller is on a user-facing path (login, logout, account
 * changes) where a storage hiccup must not turn into a dead screen — the
 * action itself has already happened or already failed on its own merits.
 * Callers that must know whether the trail is intact can check for `null`.
 */
export async function logAction(
  entry: AuditEntryInput,
  database: AuditCapableDb = defaultDb,
): Promise<number | null> {
  const row: AuditLog = {
    timestamp: new Date().toISOString(),
    userId: entry.userId,
    actionCode: entry.actionCode,
    ...(entry.entityType !== undefined && { entityType: entry.entityType }),
    ...(entry.entityId !== undefined && { entityId: entry.entityId }),
    ...(entry.patientId !== undefined && { patientId: entry.patientId }),
    ...(entry.detail !== undefined && { detail: entry.detail }),
  }

  try {
    // Dexie types an auto-increment key as optional on the row, so `add`
    // resolves `number | undefined`; the store always supplies one.
    return (await database.auditLogs.add(row as AuditLog & { seq: number })) ?? null
  } catch {
    return null
  }
}

/** Binds `logAction` to one database — convenient for services and for tests. */
export function createAuditLogger(database: AuditCapableDb = defaultDb) {
  return (entry: AuditEntryInput) => logAction(entry, database)
}
