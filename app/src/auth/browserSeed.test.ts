import { beforeEach, describe, expect, it } from 'vitest'
import { ROLES, USER_STATUSES } from '../db/codes'
import { AuscultaDB } from '../db/db'
import { createAuthService } from './authService'
import { SESSION_META_KEY } from './session'

/**
 * Proves the exact records an external tool must write to arrive signed in.
 *
 * A headless-browser accessibility probe can only reach five of this app's
 * thirty routes, because the rest need a session and it has no way to log in —
 * and typing into the login form is slow, brittle, and impossible for a role
 * whose account does not exist yet. Seeding the database directly is the way
 * in, and the point of this test is that the seed shape is verified rather than
 * guessed at.
 *
 * The load-bearing fact: `getCurrentUser()` never checks a password. It reads
 * the session record, then re-reads the user row and requires it to be ACTIVE.
 * So an external tool needs exactly two rows — a user and a session — and no
 * password hashing at all.
 *
 * The equivalent for a real browser, once the app has opened the database once
 * so the object stores exist:
 *
 *     await page.evaluate(async (role) => {
 *       const open = indexedDB.open('ausculta')
 *       const db = await new Promise((res, rej) => {
 *         open.onsuccess = () => res(open.result)
 *         open.onerror = () => rej(open.error)
 *       })
 *       const now = new Date().toISOString()
 *       const id = 'probe-' + role
 *       const tx = db.transaction(['users', 'appMeta'], 'readwrite')
 *       tx.objectStore('users').put({
 *         id, username: 'probe.' + role.toLowerCase(),
 *         passwordHash: '', passwordSalt: '', iterations: 1,
 *         role, name: 'Probe ' + role, preferredLanguage: 'en',
 *         status: 'ACTIVE', createdAt: now,
 *       })
 *       tx.objectStore('appMeta').put({
 *         key: 'session',
 *         value: { userId: id, startedAt: now, lastActivityAt: now },
 *       })
 *       // Demo mode on, so seeded screens have something to render.
 *       tx.objectStore('appMeta').put({ key: 'demoMode', value: true })
 *       await new Promise((res) => (tx.oncomplete = res))
 *     }, 'PRACTITIONER')
 *
 * Then reload the page and every route for that role is reachable.
 */

let db: AuscultaDB

beforeEach(() => {
  db = new AuscultaDB(`ausculta-browser-seed-${crypto.randomUUID()}`)
})

/** Exactly what the snippet above writes, and nothing more. */
async function seedSessionDirectly(role: (typeof ROLES)[keyof typeof ROLES]) {
  const now = new Date().toISOString()
  const id = `probe-${role}`

  await db.users.put({
    id,
    username: `probe.${role.toLowerCase()}`,
    // Deliberately empty: no password is verified on this path.
    passwordHash: '',
    passwordSalt: '',
    iterations: 1,
    role,
    name: `Probe ${role}`,
    preferredLanguage: 'en',
    status: USER_STATUSES.ACTIVE,
    createdAt: now,
  })
  await db.appMeta.put({
    key: SESSION_META_KEY,
    value: { userId: id, startedAt: now, lastActivityAt: now },
  })
  return id
}

describe('seeding a session without logging in', () => {
  it.each(Object.values(ROLES))('arrives signed in as %s', async (role) => {
    const id = await seedSessionDirectly(role)

    const current = await createAuthService(db).getCurrentUser()

    expect(current?.id).toBe(id)
    expect(current?.role).toBe(role)
  })

  it('needs no password hash, because this path never verifies one', async () => {
    await seedSessionDirectly(ROLES.PRACTITIONER)

    // If restoring a session ever started checking credentials, this would
    // fail and the probe's seed would need rewriting — which is worth knowing
    // from a test rather than from a silently unauthenticated audit run.
    await expect(createAuthService(db).getCurrentUser()).resolves.not.toBeNull()
  })

  it('is refused when the account is not ACTIVE', async () => {
    const id = await seedSessionDirectly(ROLES.PATIENT)
    await db.users.update(id, { status: USER_STATUSES.DISABLED })

    // The seed cannot be used to reach screens a real account could not.
    await expect(createAuthService(db).getCurrentUser()).resolves.toBeNull()
  })

  it('names the two stores and the one key an external tool has to write', async () => {
    const id = await seedSessionDirectly(ROLES.ADMIN)

    expect(await db.users.get(id)).toBeDefined()
    expect(await db.appMeta.get(SESSION_META_KEY)).toBeDefined()
    // Two rows. Anything more in the snippet is a mistake waiting to drift.
    expect(await db.users.count()).toBe(1)
    expect(await db.appMeta.count()).toBe(1)
  })
})
