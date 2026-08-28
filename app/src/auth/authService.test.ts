import { beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../db/db'
import { ROLES, USER_STATUSES } from '../db/codes'
import { AUDIT_ACTIONS, ANONYMOUS_ACTOR } from '../audit/audit'
import {
  ADMIN_BOOTSTRAP_META_KEY,
  AUTH_ERRORS,
  AuthError,
  createAuthService,
  type AuthErrorCode,
  type AuthService,
} from './authService'
import { PBKDF2_ITERATIONS } from './crypto'
import { SESSION_META_KEY } from './session'
import { TEST_PASSWORD_ITERATIONS, createTestAuthService } from './testing'

let db: AuscultaDB
let auth: AuthService

/** A password comfortably over MIN_PASSWORD_LENGTH, reused for readability. */
const PASSWORD = 'clinic-pass-1'

beforeEach(() => {
  db = new AuscultaDB(`ausculta-auth-test-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
})

/** Asserts a promise rejects with a specific AuthError code. */
async function expectAuthError(promise: Promise<unknown>, code: AuthErrorCode): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AuthError)
  await expect(promise).rejects.toMatchObject({ code })
}

async function actionCodes(): Promise<string[]> {
  const rows = await db.auditLogs.orderBy('seq').toArray()
  return rows.map((row) => row.actionCode)
}

async function seedAdmin() {
  return auth.bootstrapAdmin({ password: 'admin-pass-1', name: 'Site Administrator' })
}

async function seedPatient(username = 'juan') {
  return auth.register({
    username,
    password: PASSWORD,
    role: ROLES.PATIENT,
    name: 'Juan Dela Cruz',
  })
}

describe('register', () => {
  it('creates a PATIENT as ACTIVE and lets them log in immediately', async () => {
    const patient = await seedPatient()

    expect(patient.status).toBe(USER_STATUSES.ACTIVE)
    expect(patient.role).toBe(ROLES.PATIENT)
    await expect(auth.login('juan', PASSWORD)).resolves.toMatchObject({ id: patient.id })
  })

  it.each([ROLES.PRACTITIONER, ROLES.HEALTH_WORKER, ROLES.RESEARCHER])(
    'creates a %s as PENDING_VERIFICATION',
    async (role) => {
      const user = await auth.register({
        username: 'pending.user',
        password: PASSWORD,
        role,
        name: 'Pending Person',
      })

      expect(user.status).toBe(USER_STATUSES.PENDING_VERIFICATION)
    },
  )

  it('stores the password as a PBKDF2 hash, never in the clear', async () => {
    const patient = await seedPatient()
    const row = await db.users.get(patient.id)

    expect(row?.passwordHash).not.toContain(PASSWORD)
    expect(row?.passwordHash).toMatch(/^[0-9a-f]{64}$/)
    expect(row?.passwordSalt).toMatch(/^[0-9a-f]{32}$/)
    expect(row?.iterations).toBe(TEST_PASSWORD_ITERATIONS)
    expect(JSON.stringify(row)).not.toContain(PASSWORD)
  })

  it('hashes at the full production work factor unless one is injected', async () => {
    // The rest of this suite runs a deliberately cheap factor. This is the
    // guard that the *default* — what the app actually ships — stays at the
    // OWASP floor, so the test seam cannot quietly weaken production.
    const production = createAuthService(db)

    const patient = await production.register({
      username: 'costcheck',
      password: PASSWORD,
      role: ROLES.PATIENT,
      name: 'Cost Check',
    })

    expect(PBKDF2_ITERATIONS).toBe(210_000)
    expect((await db.users.get(patient.id))?.iterations).toBe(210_000)
  })

  it('normalises the username to lower case', async () => {
    const user = await auth.register({
      username: '  MariaSantos  ',
      password: PASSWORD,
      role: ROLES.PATIENT,
      name: 'Maria Santos',
    })

    expect(user.username).toBe('mariasantos')
  })

  it('rejects a username already taken in different casing', async () => {
    await seedPatient('alice')

    await expectAuthError(
      auth.register({
        username: 'ALICE',
        password: PASSWORD,
        role: ROLES.PATIENT,
        name: 'Other Alice',
      }),
      AUTH_ERRORS.USERNAME_TAKEN,
    )
    expect(await db.users.count()).toBe(1)
  })

  it('rejects the reserved administrator username', async () => {
    await expectAuthError(
      auth.register({
        username: 'Admin',
        password: PASSWORD,
        role: ROLES.PATIENT,
        name: 'Impostor',
      }),
      AUTH_ERRORS.USERNAME_RESERVED,
    )
  })

  it('refuses to let anyone self-assign the ADMIN role', async () => {
    await expectAuthError(
      auth.register({
        username: 'wannabe',
        password: PASSWORD,
        role: ROLES.ADMIN,
        name: 'Wannabe Admin',
      }),
      AUTH_ERRORS.ROLE_NOT_SELF_REGISTRABLE,
    )
    expect(await db.users.count()).toBe(0)
  })

  it('rejects a password under the minimum length', async () => {
    await expectAuthError(
      auth.register({
        username: 'shorty',
        password: '1234567',
        role: ROLES.PATIENT,
        name: 'Shorty',
      }),
      AUTH_ERRORS.PASSWORD_TOO_SHORT,
    )
  })

  it.each(['ab', 'has space', 'sym#bol', '.leadingdot', 'x'.repeat(33)])(
    'rejects the malformed username %o',
    async (username) => {
      await expectAuthError(
        auth.register({ username, password: PASSWORD, role: ROLES.PATIENT, name: 'Nope' }),
        AUTH_ERRORS.USERNAME_INVALID,
      )
    },
  )

  it('rejects a blank display name', async () => {
    await expectAuthError(
      auth.register({ username: 'nameless', password: PASSWORD, role: ROLES.PATIENT, name: '   ' }),
      AUTH_ERRORS.NAME_REQUIRED,
    )
  })

  it('writes an ACCOUNT_CREATED audit row', async () => {
    const patient = await seedPatient()
    const rows = await db.auditLogs.toArray()

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: patient.id,
      actionCode: AUDIT_ACTIONS.ACCOUNT_CREATED,
      entityType: 'user',
      entityId: patient.id,
    })
    expect(rows[0].detail).toMatchObject({ role: ROLES.PATIENT, status: USER_STATUSES.ACTIVE })
  })
})

describe('login', () => {
  it('accepts the username in any casing', async () => {
    await seedPatient('alice')

    await expect(auth.login('ALICE', PASSWORD)).resolves.toMatchObject({ username: 'alice' })
    await expect(auth.login('  Alice ', PASSWORD)).resolves.toMatchObject({ username: 'alice' })
  })

  it('rejects a wrong password', async () => {
    await seedPatient()

    await expectAuthError(auth.login('juan', 'wrong-password'), AUTH_ERRORS.INVALID_CREDENTIALS)
  })

  it('gives an unknown username the same reason as a wrong password', async () => {
    await expectAuthError(auth.login('nobody', PASSWORD), AUTH_ERRORS.INVALID_CREDENTIALS)
  })

  it('blocks a PENDING_VERIFICATION practitioner with a distinct reason', async () => {
    await auth.register({
      username: 'dr.ricardo',
      password: PASSWORD,
      role: ROLES.PRACTITIONER,
      name: 'Dr Ricardo',
    })

    await expectAuthError(
      auth.login('dr.ricardo', PASSWORD),
      AUTH_ERRORS.ACCOUNT_PENDING_VERIFICATION,
    )
    expect(await db.appMeta.get(SESSION_META_KEY)).toBeUndefined()
  })

  it('blocks a DISABLED account with a distinct reason', async () => {
    const admin = await seedAdmin()
    const patient = await seedPatient()
    await auth.disableUser({ actingUserId: admin.id, targetUserId: patient.id })

    await expectAuthError(auth.login('juan', PASSWORD), AUTH_ERRORS.ACCOUNT_DISABLED)
  })

  it('reports invalid credentials before account status, so status never leaks', async () => {
    await auth.register({
      username: 'dr.ricardo',
      password: PASSWORD,
      role: ROLES.PRACTITIONER,
      name: 'Dr Ricardo',
    })

    // Right username, wrong password on a pending account: the caller must not
    // learn that the account is merely awaiting verification.
    await expectAuthError(auth.login('dr.ricardo', 'wrong-password'), AUTH_ERRORS.INVALID_CREDENTIALS)
  })

  it('persists a session on success', async () => {
    const patient = await seedPatient()
    await auth.login('juan', PASSWORD)

    const row = await db.appMeta.get(SESSION_META_KEY)
    expect(row?.value).toMatchObject({ userId: patient.id })
    await expect(auth.getCurrentUser()).resolves.toMatchObject({ id: patient.id })
  })

  it('writes a LOGIN_SUCCESS audit row', async () => {
    const patient = await seedPatient()
    await auth.login('juan', PASSWORD)

    const row = await db.auditLogs.where('actionCode').equals(AUDIT_ACTIONS.LOGIN_SUCCESS).first()
    expect(row).toMatchObject({ userId: patient.id, entityId: patient.id })
    expect(typeof row?.timestamp).toBe('string')
    expect(Number.isNaN(Date.parse(row?.timestamp ?? ''))).toBe(false)
  })

  it('writes a LOGIN_FAILED audit row for a wrong password, naming the account', async () => {
    const patient = await seedPatient()
    await expect(auth.login('juan', 'wrong-password')).rejects.toThrow()

    const row = await db.auditLogs.where('actionCode').equals(AUDIT_ACTIONS.LOGIN_FAILED).first()
    expect(row).toMatchObject({ userId: patient.id })
    expect(row?.detail).toMatchObject({ reason: AUTH_ERRORS.INVALID_CREDENTIALS })
  })

  it('writes a LOGIN_FAILED audit row for an unknown username, without inventing a user id', async () => {
    await expect(auth.login('ghost', PASSWORD)).rejects.toThrow()

    const row = await db.auditLogs.where('actionCode').equals(AUDIT_ACTIONS.LOGIN_FAILED).first()
    expect(row?.userId).toBe(ANONYMOUS_ACTOR)
    expect(row?.detail).toMatchObject({ username: 'ghost' })
  })

  it('records the blocking reason when a pending account is turned away', async () => {
    await auth.register({
      username: 'dr.ricardo',
      password: PASSWORD,
      role: ROLES.PRACTITIONER,
      name: 'Dr Ricardo',
    })
    await expect(auth.login('dr.ricardo', PASSWORD)).rejects.toThrow()

    const row = await db.auditLogs.where('actionCode').equals(AUDIT_ACTIONS.LOGIN_FAILED).first()
    expect(row?.detail).toMatchObject({
      reason: AUTH_ERRORS.ACCOUNT_PENDING_VERIFICATION,
      status: USER_STATUSES.PENDING_VERIFICATION,
    })
  })

  it('never writes the submitted password into the audit trail', async () => {
    await seedPatient()
    await expect(auth.login('juan', 'super-secret-typo')).rejects.toThrow()

    const rows = await db.auditLogs.toArray()
    expect(JSON.stringify(rows)).not.toContain('super-secret-typo')
  })
})

describe('logout', () => {
  it('clears the session and audits it', async () => {
    const patient = await seedPatient()
    await auth.login('juan', PASSWORD)

    await auth.logout()

    expect(await db.appMeta.get(SESSION_META_KEY)).toBeUndefined()
    await expect(auth.getCurrentUser()).resolves.toBeNull()
    const row = await db.auditLogs.where('actionCode').equals(AUDIT_ACTIONS.LOGOUT).first()
    expect(row).toMatchObject({ userId: patient.id })
  })

  it('is a no-op when nobody is logged in', async () => {
    await expect(auth.logout()).resolves.toBeUndefined()
    expect(await actionCodes()).not.toContain(AUDIT_ACTIONS.LOGOUT)
  })
})

describe('admin bootstrap', () => {
  it('is available on a fresh device', async () => {
    await expect(auth.isAdminBootstrapped()).resolves.toBe(false)
  })

  it('creates exactly one admin account and can log in as it', async () => {
    const admin = await seedAdmin()

    expect(admin.username).toBe('admin')
    expect(admin.role).toBe(ROLES.ADMIN)
    expect(admin.status).toBe(USER_STATUSES.ACTIVE)
    await expect(auth.login('admin', 'admin-pass-1')).resolves.toMatchObject({ id: admin.id })
  })

  it('sets the appMeta flag so it can never run again', async () => {
    await seedAdmin()

    await expect(auth.isAdminBootstrapped()).resolves.toBe(true)
    expect(await db.appMeta.get(ADMIN_BOOTSTRAP_META_KEY)).toBeDefined()
    await expectAuthError(
      auth.bootstrapAdmin({ password: 'second-pass-1', name: 'Second Admin' }),
      AUTH_ERRORS.ADMIN_ALREADY_BOOTSTRAPPED,
    )
    expect(await db.users.count()).toBe(1)
  })

  it('creates only one admin even when two callers race', async () => {
    const results = await Promise.allSettled([
      auth.bootstrapAdmin({ password: 'race-pass-1', name: 'First' }),
      auth.bootstrapAdmin({ password: 'race-pass-2', name: 'Second' }),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.users.count()).toBe(1)
  })

  it('enforces the 8 character minimum password', async () => {
    await expectAuthError(
      auth.bootstrapAdmin({ password: 'short7!', name: 'Admin' }),
      AUTH_ERRORS.PASSWORD_TOO_SHORT,
    )
    await expect(auth.isAdminBootstrapped()).resolves.toBe(false)
    expect(await db.users.count()).toBe(0)
  })

  it('requires a name for the audit trail', async () => {
    await expectAuthError(
      auth.bootstrapAdmin({ password: 'admin-pass-1', name: '' }),
      AUTH_ERRORS.NAME_REQUIRED,
    )
  })

  it('audits the bootstrap and the account creation', async () => {
    await seedAdmin()

    expect(await actionCodes()).toEqual([
      AUDIT_ACTIONS.ADMIN_BOOTSTRAPPED,
      AUDIT_ACTIONS.ACCOUNT_CREATED,
    ])
  })
})

describe('admin account management', () => {
  it('activates a pending practitioner, who can then log in', async () => {
    const admin = await seedAdmin()
    const doctor = await auth.register({
      username: 'dr.ricardo',
      password: PASSWORD,
      role: ROLES.PRACTITIONER,
      name: 'Dr Ricardo',
    })

    await auth.activateUser({ actingUserId: admin.id, targetUserId: doctor.id })

    expect((await db.users.get(doctor.id))?.status).toBe(USER_STATUSES.ACTIVE)
    await expect(auth.login('dr.ricardo', PASSWORD)).resolves.toMatchObject({ id: doctor.id })
    const row = await db.auditLogs.where('actionCode').equals(AUDIT_ACTIONS.ACCOUNT_VERIFIED).first()
    expect(row).toMatchObject({ userId: admin.id, entityId: doctor.id })
  })

  it('disables an account, blocking further logins', async () => {
    const admin = await seedAdmin()
    const patient = await seedPatient()

    await auth.disableUser({ actingUserId: admin.id, targetUserId: patient.id })

    expect((await db.users.get(patient.id))?.status).toBe(USER_STATUSES.DISABLED)
    await expectAuthError(auth.login('juan', PASSWORD), AUTH_ERRORS.ACCOUNT_DISABLED)
    const row = await db.auditLogs.where('actionCode').equals(AUDIT_ACTIONS.ACCOUNT_DISABLED).first()
    expect(row).toMatchObject({ userId: admin.id, entityId: patient.id })
  })

  it('audits a re-enable distinctly from a first verification', async () => {
    const admin = await seedAdmin()
    const patient = await seedPatient()
    await auth.disableUser({ actingUserId: admin.id, targetUserId: patient.id })

    await auth.activateUser({ actingUserId: admin.id, targetUserId: patient.id })

    expect(await actionCodes()).toContain(AUDIT_ACTIONS.ACCOUNT_REENABLED)
    expect(await actionCodes()).not.toContain(AUDIT_ACTIONS.ACCOUNT_VERIFIED)
  })

  it('will not let an admin disable their own account', async () => {
    const admin = await seedAdmin()

    await expectAuthError(
      auth.disableUser({ actingUserId: admin.id, targetUserId: admin.id }),
      AUTH_ERRORS.NOT_AUTHORISED,
    )
    expect((await db.users.get(admin.id))?.status).toBe(USER_STATUSES.ACTIVE)
  })

  it('refuses every admin action from a non-admin account', async () => {
    await seedAdmin()
    const patient = await seedPatient()
    const doctor = await auth.register({
      username: 'dr.ricardo',
      password: PASSWORD,
      role: ROLES.PRACTITIONER,
      name: 'Dr Ricardo',
    })
    const acting = { actingUserId: patient.id, targetUserId: doctor.id }

    await expectAuthError(auth.activateUser(acting), AUTH_ERRORS.NOT_AUTHORISED)
    await expectAuthError(auth.disableUser(acting), AUTH_ERRORS.NOT_AUTHORISED)
    await expectAuthError(
      auth.resetPassword({ ...acting, newPassword: 'new-password-1' }),
      AUTH_ERRORS.NOT_AUTHORISED,
    )
    await expectAuthError(auth.listUsers(patient.id), AUTH_ERRORS.NOT_AUTHORISED)
    expect((await db.users.get(doctor.id))?.status).toBe(USER_STATUSES.PENDING_VERIFICATION)
  })

  it('refuses admin actions from a disabled admin', async () => {
    const admin = await seedAdmin()
    const patient = await seedPatient()
    await db.users.update(admin.id, { status: USER_STATUSES.DISABLED })

    await expectAuthError(
      auth.disableUser({ actingUserId: admin.id, targetUserId: patient.id }),
      AUTH_ERRORS.NOT_AUTHORISED,
    )
  })

  it('reports a missing target rather than silently doing nothing', async () => {
    const admin = await seedAdmin()

    await expectAuthError(
      auth.activateUser({ actingUserId: admin.id, targetUserId: 'no-such-user' }),
      AUTH_ERRORS.USER_NOT_FOUND,
    )
  })

  it('lists the pending-verification queue', async () => {
    const admin = await seedAdmin()
    await seedPatient()
    await auth.register({
      username: 'dr.ricardo',
      password: PASSWORD,
      role: ROLES.PRACTITIONER,
      name: 'Dr Ricardo',
    })

    const pending = await auth.listUsersByStatus(admin.id, USER_STATUSES.PENDING_VERIFICATION)

    expect(pending.map((u) => u.username)).toEqual(['dr.ricardo'])
    await expect(auth.listUsers(admin.id)).resolves.toHaveLength(3)
  })
})

describe('resetPassword', () => {
  it('lets an admin set a new password that replaces the old one', async () => {
    const admin = await seedAdmin()
    const patient = await seedPatient()

    await auth.resetPassword({
      actingUserId: admin.id,
      targetUserId: patient.id,
      newPassword: 'reset-pass-1',
    })

    await expect(auth.login('juan', 'reset-pass-1')).resolves.toMatchObject({ id: patient.id })
    await expectAuthError(auth.login('juan', PASSWORD), AUTH_ERRORS.INVALID_CREDENTIALS)
  })

  it('re-salts, so the stored hash never repeats a previous one', async () => {
    const admin = await seedAdmin()
    const patient = await seedPatient()
    const before = await db.users.get(patient.id)

    await auth.resetPassword({
      actingUserId: admin.id,
      targetUserId: patient.id,
      newPassword: PASSWORD,
    })

    const after = await db.users.get(patient.id)
    expect(after?.passwordSalt).not.toBe(before?.passwordSalt)
    expect(after?.passwordHash).not.toBe(before?.passwordHash)
  })

  it('enforces the minimum length on the new password', async () => {
    const admin = await seedAdmin()
    const patient = await seedPatient()

    await expectAuthError(
      auth.resetPassword({ actingUserId: admin.id, targetUserId: patient.id, newPassword: 'short' }),
      AUTH_ERRORS.PASSWORD_TOO_SHORT,
    )
    await expect(auth.login('juan', PASSWORD)).resolves.toBeDefined()
  })

  it('audits the reset against the admin who performed it', async () => {
    const admin = await seedAdmin()
    const patient = await seedPatient()

    await auth.resetPassword({
      actingUserId: admin.id,
      targetUserId: patient.id,
      newPassword: 'reset-pass-1',
    })

    const row = await db.auditLogs.where('actionCode').equals(AUDIT_ACTIONS.PASSWORD_RESET).first()
    expect(row).toMatchObject({ userId: admin.id, entityType: 'user', entityId: patient.id })
  })
})

describe('changePassword', () => {
  it('replaces the password once the current one is proven', async () => {
    const patient = await seedPatient()

    await auth.changePassword(patient.id, PASSWORD, 'brand-new-pass-1')

    await expect(auth.login('juan', 'brand-new-pass-1')).resolves.toBeDefined()
    await expectAuthError(auth.login('juan', PASSWORD), AUTH_ERRORS.INVALID_CREDENTIALS)
    const row = await db.auditLogs.where('actionCode').equals(AUDIT_ACTIONS.PASSWORD_CHANGED).first()
    expect(row).toMatchObject({ userId: patient.id })
  })

  it('rejects a wrong current password and leaves the old one working', async () => {
    const patient = await seedPatient()

    await expectAuthError(
      auth.changePassword(patient.id, 'not-my-password', 'brand-new-pass-1'),
      AUTH_ERRORS.INVALID_CREDENTIALS,
    )
    await expect(auth.login('juan', PASSWORD)).resolves.toBeDefined()
  })

  it('rejects a too-short new password', async () => {
    const patient = await seedPatient()

    await expectAuthError(
      auth.changePassword(patient.id, PASSWORD, 'tiny'),
      AUTH_ERRORS.PASSWORD_TOO_SHORT,
    )
  })
})

describe('getCurrentUser', () => {
  it('resolves null with no session', async () => {
    await expect(auth.getCurrentUser()).resolves.toBeNull()
  })

  it('drops a session that has been idle past the timeout, and audits it', async () => {
    let clock = Date.parse('2026-08-29T08:00:00.000Z')
    const shortLived = createTestAuthService(db, { idleTimeoutMs: 60_000, now: () => clock })
    await shortLived.register({
      username: 'juan',
      password: PASSWORD,
      role: ROLES.PATIENT,
      name: 'Juan Dela Cruz',
    })
    await shortLived.login('juan', PASSWORD)

    clock += 59_000
    await expect(shortLived.getCurrentUser()).resolves.not.toBeNull()

    clock += 2_000
    await expect(shortLived.getCurrentUser()).resolves.toBeNull()
    expect(await db.appMeta.get(SESSION_META_KEY)).toBeUndefined()
    expect(await actionCodes()).toContain(AUDIT_ACTIONS.SESSION_EXPIRED)
  })

  it('drops the session of a user disabled mid-session', async () => {
    const admin = await seedAdmin()
    const patient = await seedPatient()
    await auth.login('juan', PASSWORD)

    await auth.disableUser({ actingUserId: admin.id, targetUserId: patient.id })

    await expect(auth.getCurrentUser()).resolves.toBeNull()
    expect(await db.appMeta.get(SESSION_META_KEY)).toBeUndefined()
  })

  it('ignores a corrupt session record instead of throwing', async () => {
    await db.appMeta.put({ key: SESSION_META_KEY, value: { nonsense: true } })

    await expect(auth.getCurrentUser()).resolves.toBeNull()
  })
})
