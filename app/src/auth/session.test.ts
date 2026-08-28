import { beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../db/db'
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  SESSION_META_KEY,
  createSessionStore,
  isSessionExpired,
  millisUntilExpiry,
  type StoredSession,
} from './session'

let db: AuscultaDB
let sessions: ReturnType<typeof createSessionStore>

const T0 = Date.parse('2026-08-29T08:00:00.000Z')

beforeEach(() => {
  db = new AuscultaDB(`ausculta-session-test-${crypto.randomUUID()}`)
  sessions = createSessionStore(db)
})

describe('createSessionStore', () => {
  it('resolves null when no session has been started', async () => {
    await expect(sessions.read()).resolves.toBeNull()
  })

  it('persists a started session to appMeta and reads it back', async () => {
    const started = await sessions.start('user-1', T0)

    expect(started).toEqual({
      userId: 'user-1',
      startedAt: '2026-08-29T08:00:00.000Z',
      lastActivityAt: '2026-08-29T08:00:00.000Z',
    })
    await expect(sessions.read()).resolves.toEqual(started)
    expect(await db.appMeta.get(SESSION_META_KEY)).toMatchObject({ key: SESSION_META_KEY })
  })

  it('keeps at most one session, replacing the previous user', async () => {
    await sessions.start('user-1', T0)
    await sessions.start('user-2', T0 + 1_000)

    await expect(sessions.read()).resolves.toMatchObject({ userId: 'user-2' })
    expect(await db.appMeta.count()).toBe(1)
  })

  it('advances lastActivityAt on touch without moving startedAt', async () => {
    await sessions.start('user-1', T0)

    const touched = await sessions.touch(T0 + 5 * 60_000)

    expect(touched).toEqual({
      userId: 'user-1',
      startedAt: '2026-08-29T08:00:00.000Z',
      lastActivityAt: '2026-08-29T08:05:00.000Z',
    })
    await expect(sessions.read()).resolves.toEqual(touched)
  })

  it('treats a touch with no session as a no-op, not an error', async () => {
    await expect(sessions.touch(T0)).resolves.toBeNull()
    expect(await db.appMeta.count()).toBe(0)
  })

  it('removes the record on clear', async () => {
    await sessions.start('user-1', T0)

    await sessions.clear()

    await expect(sessions.read()).resolves.toBeNull()
    expect(await db.appMeta.get(SESSION_META_KEY)).toBeUndefined()
  })

  it('clearing twice is harmless', async () => {
    await sessions.clear()
    await expect(sessions.clear()).resolves.toBeUndefined()
  })

  it.each([
    ['a non-object', 'not a session'],
    ['null', null],
    ['a record missing userId', { startedAt: 'x', lastActivityAt: 'x' }],
    ['a record with an empty userId', { userId: '', startedAt: 'x', lastActivityAt: 'x' }],
    ['a record missing timestamps', { userId: 'user-1' }],
  ])('reads %s stored under the session key as no session', async (_label, value) => {
    await db.appMeta.put({ key: SESSION_META_KEY, value })

    await expect(sessions.read()).resolves.toBeNull()
  })
})

describe('isSessionExpired', () => {
  const session: StoredSession = {
    userId: 'user-1',
    startedAt: '2026-08-29T08:00:00.000Z',
    lastActivityAt: '2026-08-29T08:00:00.000Z',
  }

  it('is false while inside the idle window', () => {
    expect(isSessionExpired(session, 60_000, T0)).toBe(false)
    expect(isSessionExpired(session, 60_000, T0 + 59_999)).toBe(false)
  })

  it('is true at and beyond the idle window', () => {
    expect(isSessionExpired(session, 60_000, T0 + 60_000)).toBe(true)
    expect(isSessionExpired(session, 60_000, T0 + 10 * 60_000)).toBe(true)
  })

  it('defaults to a 30 minute idle window', () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000)
    expect(isSessionExpired(session, undefined, T0 + 29 * 60_000)).toBe(false)
    expect(isSessionExpired(session, undefined, T0 + 31 * 60_000)).toBe(true)
  })

  it('treats an unparseable lastActivityAt as expired', () => {
    expect(isSessionExpired({ ...session, lastActivityAt: 'nonsense' }, 60_000, T0)).toBe(true)
  })
})

describe('millisUntilExpiry', () => {
  const session: StoredSession = {
    userId: 'user-1',
    startedAt: '2026-08-29T08:00:00.000Z',
    lastActivityAt: '2026-08-29T08:00:00.000Z',
  }

  it('counts down the remaining idle window', () => {
    expect(millisUntilExpiry(session, 60_000, T0)).toBe(60_000)
    expect(millisUntilExpiry(session, 60_000, T0 + 20_000)).toBe(40_000)
  })

  it('never goes negative', () => {
    expect(millisUntilExpiry(session, 60_000, T0 + 120_000)).toBe(0)
    expect(millisUntilExpiry({ ...session, lastActivityAt: 'nonsense' }, 60_000, T0)).toBe(0)
  })
})
