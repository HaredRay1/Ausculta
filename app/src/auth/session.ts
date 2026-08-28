import { db as defaultDb, type AuscultaDB } from '../db/db'

/**
 * The signed-in session, persisted in `appMeta` rather than held only in React
 * state.
 *
 * Ausculta is an installed offline PWA on a shared clinic device: the app is
 * killed and relaunched constantly (backgrounded tabs, low memory, reboots),
 * and a health worker who was mid-assessment should not be thrown back to the
 * login screen every time. Persisting to IndexedDB — the same store the
 * clinical data already lives in — keeps the session across those relaunches
 * without adding a second storage mechanism to reason about.
 *
 * The stored record is a *reference*: a user id plus timing. No password
 * material, no role snapshot. Role and status are re-read from the `users`
 * table on every restore, so an account disabled by an admin cannot keep
 * working from a stale session record.
 */

/** `appMeta` key holding the current session (at most one; single-user device). */
export const SESSION_META_KEY = 'session'

/** Idle window before the session is dropped. 30 minutes. */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Minimum gap between `lastActivityAt` writes.
 *
 * Activity handlers fire on every tap and keystroke; without this the app
 * would issue an IndexedDB write per keystroke. 30s is far below the idle
 * timeout, so the recorded activity is never stale enough to expire a session
 * that is genuinely in use.
 */
export const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000

export interface StoredSession {
  userId: string
  startedAt: string
  lastActivityAt: string
}

/** Minimal database surface this module needs (mirrors i18n/missingKeyHandler.ts). */
export type AppMetaTable = Pick<AuscultaDB['appMeta'], 'get' | 'put' | 'delete'>
export interface SessionCapableDb {
  appMeta: AppMetaTable
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<StoredSession>
  return (
    typeof candidate.userId === 'string' &&
    candidate.userId.length > 0 &&
    typeof candidate.startedAt === 'string' &&
    typeof candidate.lastActivityAt === 'string'
  )
}

/**
 * True when `session` has been idle past `idleTimeoutMs`.
 *
 * Pure and clock-injectable so the timeout can be tested without waiting 30
 * minutes. An unparseable `lastActivityAt` counts as expired: a session record
 * we cannot reason about is not one to keep trusting.
 */
export function isSessionExpired(
  session: StoredSession,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
  now: number = Date.now(),
): boolean {
  const last = Date.parse(session.lastActivityAt)
  if (Number.isNaN(last)) return true
  return now - last >= idleTimeoutMs
}

/** Milliseconds of idle time left before expiry (0 once expired). */
export function millisUntilExpiry(
  session: StoredSession,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS,
  now: number = Date.now(),
): number {
  const last = Date.parse(session.lastActivityAt)
  if (Number.isNaN(last)) return 0
  return Math.max(0, last + idleTimeoutMs - now)
}

export interface SessionStore {
  read(): Promise<StoredSession | null>
  start(userId: string, now?: number): Promise<StoredSession>
  touch(now?: number): Promise<StoredSession | null>
  clear(): Promise<void>
}

/** Binds the session record in `appMeta` to one database. */
export function createSessionStore(database: SessionCapableDb = defaultDb): SessionStore {
  async function read(): Promise<StoredSession | null> {
    const row = await database.appMeta.get(SESSION_META_KEY)
    if (row === undefined || !isStoredSession(row.value)) return null
    return row.value
  }

  async function write(session: StoredSession): Promise<StoredSession> {
    await database.appMeta.put({ key: SESSION_META_KEY, value: session })
    return session
  }

  return {
    read,

    async start(userId, now = Date.now()) {
      const timestamp = new Date(now).toISOString()
      return write({ userId, startedAt: timestamp, lastActivityAt: timestamp })
    },

    /**
     * Records fresh activity. Resolves `null` when there is no session to
     * touch — a no-op, not an error, since activity handlers keep firing
     * after logout.
     */
    async touch(now = Date.now()) {
      const current = await read()
      if (current === null) return null
      return write({ ...current, lastActivityAt: new Date(now).toISOString() })
    },

    async clear() {
      await database.appMeta.delete(SESSION_META_KEY)
    },
  }
}

/** App-wide session store, bound to the real Dexie database. */
export const sessionStore = createSessionStore()
