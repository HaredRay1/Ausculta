import { db as defaultDb, type AuscultaDB } from '../db/db'
import { ROLES, USER_STATUSES, type Role, type UserStatus } from '../db/codes'
import type { User } from '../db/types'
import { ANONYMOUS_ACTOR, AUDIT_ACTIONS, createAuditLogger } from '../audit/audit'
import { PBKDF2_ITERATIONS, hashPassword, simulateVerifyDelay, verifyPassword } from './crypto'
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  createSessionStore,
  isSessionExpired,
  type SessionStore,
} from './session'

/**
 * Offline authentication and account lifecycle.
 *
 * There is no server: the `users` table on the device *is* the identity store,
 * and an administrator physically present at that device is the only authority
 * that can verify a professional account. That shapes every rule below.
 */

/** Machine-readable failure reasons. Each maps to `auth:error.<CODE>` for display. */
export const AUTH_ERRORS = {
  /** Username unknown *or* password wrong — deliberately not distinguished. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_PENDING_VERIFICATION: 'ACCOUNT_PENDING_VERIFICATION',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  USERNAME_INVALID: 'USERNAME_INVALID',
  USERNAME_RESERVED: 'USERNAME_RESERVED',
  PASSWORD_TOO_SHORT: 'PASSWORD_TOO_SHORT',
  NAME_REQUIRED: 'NAME_REQUIRED',
  ROLE_NOT_SELF_REGISTRABLE: 'ROLE_NOT_SELF_REGISTRABLE',
  ADMIN_ALREADY_BOOTSTRAPPED: 'ADMIN_ALREADY_BOOTSTRAPPED',
  NOT_AUTHORISED: 'NOT_AUTHORISED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
} as const

export type AuthErrorCode = (typeof AUTH_ERRORS)[keyof typeof AUTH_ERRORS]

/**
 * Every rejection from this service. `code` is the contract; `message` is a
 * developer-facing echo of it and must never be shown to a user — screens
 * render `t('auth:error.' + code)` instead.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode) {
    super(code)
    this.name = 'AuthError'
    this.code = code
  }
}

/** Minimum for every account, including the bootstrap administrator. */
export const MIN_PASSWORD_LENGTH = 8

/** 3-32 chars, starting alphanumeric. Applied *after* lower-casing. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/

/** The one account `bootstrapAdmin` may create - and that nobody may register. */
export const ADMIN_USERNAME = 'admin'

/** `appMeta` key proving first-run admin setup already happened. */
export const ADMIN_BOOTSTRAP_META_KEY = 'adminBootstrapped'

/** Roles a person may pick for themselves on the registration screen. */
export const SELF_REGISTRABLE_ROLES: readonly Role[] = [
  ROLES.PATIENT,
  ROLES.PRACTITIONER,
  ROLES.HEALTH_WORKER,
  ROLES.RESEARCHER,
]

/**
 * Roles whose claim to a professional identity has to be checked by a human
 * before it grants access to patient data. These register as
 * PENDING_VERIFICATION and stay locked out until an admin activates them.
 */
export const ROLES_REQUIRING_VERIFICATION: readonly Role[] = [
  ROLES.PRACTITIONER,
  ROLES.HEALTH_WORKER,
  ROLES.RESEARCHER,
]

/** Case-insensitive comparison is implemented by storing the normalised form. */
export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function initialStatusForRole(role: Role): UserStatus {
  return ROLES_REQUIRING_VERIFICATION.includes(role)
    ? USER_STATUSES.PENDING_VERIFICATION
    : USER_STATUSES.ACTIVE
}

export interface RegisterInput {
  username: string
  password: string
  role: Role
  name: string
  professionalDesignation?: string
  organization?: string
  preferredLanguage?: string
}

export interface BootstrapAdminInput {
  password: string
  name: string
  preferredLanguage?: string
}

export interface AdminActionInput {
  actingUserId: string
  targetUserId: string
}

export interface ResetPasswordInput extends AdminActionInput {
  newPassword: string
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'ConstraintError'
  )
}

export interface AuthServiceOptions {
  /** Idle window used when restoring a persisted session. */
  idleTimeoutMs?: number
  /** Overridable so tests can drive the clock. */
  now?: () => number
  /**
   * PBKDF2 work factor for passwords hashed by this service.
   *
   * Defaults to the production PBKDF2_ITERATIONS and should stay there in the
   * app — the cost *is* the protection. It is injectable purely so test suites
   * can run a cheap factor: a suite that hashes dozens of passwords at full
   * cost spends seconds on deliberate slowness and turns UI assertions into a
   * race against their own timeout.
   *
   * Lowering this only affects passwords hashed from now on. Verification
   * always uses the factor recorded on the row it is checking, so accounts
   * created at one cost keep working after the default changes.
   */
  passwordIterations?: number
}

export function createAuthService(
  database: AuscultaDB = defaultDb,
  options: AuthServiceOptions = {},
) {
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
  const now = options.now ?? (() => Date.now())
  const passwordIterations = options.passwordIterations ?? PBKDF2_ITERATIONS
  const sessions: SessionStore = createSessionStore(database)
  const audit = createAuditLogger(database)

  function validatePassword(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AuthError(AUTH_ERRORS.PASSWORD_TOO_SHORT)
    }
  }

  function validateUsername(username: string): string {
    const normalised = normaliseUsername(username)
    if (!USERNAME_PATTERN.test(normalised)) throw new AuthError(AUTH_ERRORS.USERNAME_INVALID)
    return normalised
  }

  async function findByUsername(username: string): Promise<User | undefined> {
    return database.users.where('username').equals(normaliseUsername(username)).first()
  }

  async function getUserOrThrow(userId: string): Promise<User> {
    const user = await database.users.get(userId)
    if (user === undefined) throw new AuthError(AUTH_ERRORS.USER_NOT_FOUND)
    return user
  }

  /** An admin action is only valid from an account that is ADMIN *and* ACTIVE. */
  async function requireAdmin(actingUserId: string): Promise<User> {
    const actor = await database.users.get(actingUserId)
    if (actor === undefined || actor.role !== ROLES.ADMIN || actor.status !== USER_STATUSES.ACTIVE) {
      throw new AuthError(AUTH_ERRORS.NOT_AUTHORISED)
    }
    return actor
  }

  async function isAdminBootstrapped(): Promise<boolean> {
    return (await database.appMeta.get(ADMIN_BOOTSTRAP_META_KEY)) !== undefined
  }

  /**
   * Creates the one and only first-run administrator.
   *
   * The check-and-set of the `adminBootstrapped` flag happens inside a single
   * Dexie read-write transaction, so two callers racing (a double-tapped
   * button, two open tabs) cannot both pass the check. The password is hashed
   * *before* the transaction opens: awaiting a non-Dexie promise inside a
   * transaction lets it commit out from under us.
   *
   * There is no default password anywhere - the operator picks one, and until
   * they do, no account exists on the device at all.
   */
  async function bootstrapAdmin(input: BootstrapAdminInput): Promise<User> {
    validatePassword(input.password)
    const name = input.name.trim()
    if (name.length === 0) throw new AuthError(AUTH_ERRORS.NAME_REQUIRED)
    if (await isAdminBootstrapped()) throw new AuthError(AUTH_ERRORS.ADMIN_ALREADY_BOOTSTRAPPED)

    const credentials = await hashPassword(input.password, passwordIterations)
    const admin: User = {
      id: crypto.randomUUID(),
      username: ADMIN_USERNAME,
      passwordHash: credentials.passwordHash,
      passwordSalt: credentials.passwordSalt,
      iterations: credentials.iterations,
      role: ROLES.ADMIN,
      name,
      preferredLanguage: input.preferredLanguage ?? 'en',
      status: USER_STATUSES.ACTIVE,
      createdAt: new Date(now()).toISOString(),
    }

    try {
      await database.transaction('rw', database.appMeta, database.users, async () => {
        if ((await database.appMeta.get(ADMIN_BOOTSTRAP_META_KEY)) !== undefined) {
          throw new AuthError(AUTH_ERRORS.ADMIN_ALREADY_BOOTSTRAPPED)
        }
        await database.users.add(admin)
        await database.appMeta.put({
          key: ADMIN_BOOTSTRAP_META_KEY,
          value: { at: admin.createdAt, userId: admin.id },
        })
      })
    } catch (error) {
      if (error instanceof AuthError) throw error
      // The `&username` unique index is the backstop if the flag were cleared
      // by hand but the account survived.
      if (isUniqueConstraintViolation(error)) {
        throw new AuthError(AUTH_ERRORS.ADMIN_ALREADY_BOOTSTRAPPED)
      }
      throw error
    }

    await audit({
      userId: admin.id,
      actionCode: AUDIT_ACTIONS.ADMIN_BOOTSTRAPPED,
      entityType: 'user',
      entityId: admin.id,
      detail: { username: admin.username, role: admin.role },
    })
    await audit({
      userId: admin.id,
      actionCode: AUDIT_ACTIONS.ACCOUNT_CREATED,
      entityType: 'user',
      entityId: admin.id,
      detail: { username: admin.username, role: admin.role, status: admin.status },
    })

    return admin
  }

  /**
   * Self-service registration.
   *
   * PATIENT accounts are usable immediately - a patient claiming to be
   * themselves grants no access to anyone else's data. PRACTITIONER,
   * HEALTH_WORKER and RESEARCHER accounts land in PENDING_VERIFICATION and
   * cannot log in until an admin activates them. ADMIN is never self-assignable.
   */
  async function register(input: RegisterInput): Promise<User> {
    const username = validateUsername(input.username)
    validatePassword(input.password)

    const name = input.name.trim()
    if (name.length === 0) throw new AuthError(AUTH_ERRORS.NAME_REQUIRED)
    if (!SELF_REGISTRABLE_ROLES.includes(input.role)) {
      throw new AuthError(AUTH_ERRORS.ROLE_NOT_SELF_REGISTRABLE)
    }
    if (username === ADMIN_USERNAME) throw new AuthError(AUTH_ERRORS.USERNAME_RESERVED)
    if ((await findByUsername(username)) !== undefined) {
      throw new AuthError(AUTH_ERRORS.USERNAME_TAKEN)
    }

    const credentials = await hashPassword(input.password, passwordIterations)
    const user: User = {
      id: crypto.randomUUID(),
      username,
      passwordHash: credentials.passwordHash,
      passwordSalt: credentials.passwordSalt,
      iterations: credentials.iterations,
      role: input.role,
      name,
      ...(input.professionalDesignation !== undefined && {
        professionalDesignation: input.professionalDesignation,
      }),
      ...(input.organization !== undefined && { organization: input.organization }),
      preferredLanguage: input.preferredLanguage ?? 'en',
      status: initialStatusForRole(input.role),
      createdAt: new Date(now()).toISOString(),
    }

    try {
      await database.users.add(user)
    } catch (error) {
      // Lost the race against a concurrent registration of the same name.
      if (isUniqueConstraintViolation(error)) throw new AuthError(AUTH_ERRORS.USERNAME_TAKEN)
      throw error
    }

    await audit({
      userId: user.id,
      actionCode: AUDIT_ACTIONS.ACCOUNT_CREATED,
      entityType: 'user',
      entityId: user.id,
      detail: { username: user.username, role: user.role, status: user.status },
    })

    return user
  }

  /**
   * Verifies credentials and opens a session.
   *
   * Ordering is deliberate: the password is checked *before* the account
   * status, so someone who does not know the password learns nothing about
   * which usernames exist or what state they are in. Only once the password is
   * proven does the caller get the distinct, actionable PENDING_VERIFICATION /
   * DISABLED reason.
   */
  async function login(username: string, password: string): Promise<User> {
    const normalised = normaliseUsername(username)
    const user = await findByUsername(normalised)

    if (user === undefined) {
      // Burn a comparable amount of work so a bad username and a bad password
      // are indistinguishable by response time.
      await simulateVerifyDelay(passwordIterations)
      await audit({
        userId: ANONYMOUS_ACTOR,
        actionCode: AUDIT_ACTIONS.LOGIN_FAILED,
        detail: { username: normalised, reason: AUTH_ERRORS.INVALID_CREDENTIALS },
      })
      throw new AuthError(AUTH_ERRORS.INVALID_CREDENTIALS)
    }

    if (!(await verifyPassword(password, user))) {
      await audit({
        userId: user.id,
        actionCode: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        detail: { username: normalised, reason: AUTH_ERRORS.INVALID_CREDENTIALS },
      })
      throw new AuthError(AUTH_ERRORS.INVALID_CREDENTIALS)
    }

    if (user.status !== USER_STATUSES.ACTIVE) {
      const reason =
        user.status === USER_STATUSES.PENDING_VERIFICATION
          ? AUTH_ERRORS.ACCOUNT_PENDING_VERIFICATION
          : AUTH_ERRORS.ACCOUNT_DISABLED
      await audit({
        userId: user.id,
        actionCode: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        detail: { username: normalised, reason, status: user.status },
      })
      throw new AuthError(reason)
    }

    await sessions.start(user.id, now())
    await audit({
      userId: user.id,
      actionCode: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entityType: 'user',
      entityId: user.id,
      detail: { username: user.username, role: user.role },
    })

    return user
  }

  /**
   * Ends the session. Idempotent: logging out twice, or on a device whose
   * session record is already gone, is a no-op rather than an error.
   */
  async function logout(): Promise<void> {
    const session = await sessions.read()
    await sessions.clear()
    if (session === null) return
    await audit({
      userId: session.userId,
      actionCode: AUDIT_ACTIONS.LOGOUT,
      entityType: 'user',
      entityId: session.userId,
    })
  }

  /**
   * Restores the persisted session, or resolves `null` and clears it.
   *
   * Re-reads the user row every time, so an account disabled by an admin
   * mid-session loses access at the next restore rather than at next login.
   */
  async function getCurrentUser(): Promise<User | null> {
    const session = await sessions.read()
    if (session === null) return null

    if (isSessionExpired(session, idleTimeoutMs, now())) {
      await sessions.clear()
      await audit({
        userId: session.userId,
        actionCode: AUDIT_ACTIONS.SESSION_EXPIRED,
        entityType: 'user',
        entityId: session.userId,
        detail: { idleTimeoutMs },
      })
      return null
    }

    const user = await database.users.get(session.userId)
    if (user === undefined || user.status !== USER_STATUSES.ACTIVE) {
      await sessions.clear()
      return null
    }
    return user
  }

  /** Changes one's own password. Requires proof of the current one. */
  async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await getUserOrThrow(userId)
    if (!(await verifyPassword(currentPassword, user))) {
      throw new AuthError(AUTH_ERRORS.INVALID_CREDENTIALS)
    }
    validatePassword(newPassword)

    const credentials = await hashPassword(newPassword, passwordIterations)
    await database.users.update(userId, credentials)
    await audit({
      userId,
      actionCode: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: 'user',
      entityId: userId,
    })
  }

  /**
   * Admin-only password reset for someone who has forgotten theirs.
   *
   * Offline and server-less means there is no reset email to fall back on: an
   * administrator at the device sets a new password directly. The audit row
   * recording who did it to whom is the only real check on that power.
   */
  async function resetPassword(input: ResetPasswordInput): Promise<void> {
    const actor = await requireAdmin(input.actingUserId)
    const target = await getUserOrThrow(input.targetUserId)
    validatePassword(input.newPassword)

    const credentials = await hashPassword(input.newPassword, passwordIterations)
    await database.users.update(target.id, credentials)
    await audit({
      userId: actor.id,
      actionCode: AUDIT_ACTIONS.PASSWORD_RESET,
      entityType: 'user',
      entityId: target.id,
      detail: { username: target.username },
    })
  }

  /** Admin-only: clears PENDING_VERIFICATION, or re-enables a disabled account. */
  async function activateUser(input: AdminActionInput): Promise<User> {
    const actor = await requireAdmin(input.actingUserId)
    const target = await getUserOrThrow(input.targetUserId)

    const wasDisabled = target.status === USER_STATUSES.DISABLED
    await database.users.update(target.id, { status: USER_STATUSES.ACTIVE })
    await audit({
      userId: actor.id,
      actionCode: wasDisabled ? AUDIT_ACTIONS.ACCOUNT_REENABLED : AUDIT_ACTIONS.ACCOUNT_VERIFIED,
      entityType: 'user',
      entityId: target.id,
      detail: { username: target.username, previousStatus: target.status },
    })
    return { ...target, status: USER_STATUSES.ACTIVE }
  }

  /**
   * Admin-only: revokes access. An admin cannot disable their own account -
   * that is the one move that can leave a device with no usable administrator
   * and no way back in.
   */
  async function disableUser(input: AdminActionInput): Promise<User> {
    const actor = await requireAdmin(input.actingUserId)
    if (actor.id === input.targetUserId) throw new AuthError(AUTH_ERRORS.NOT_AUTHORISED)
    const target = await getUserOrThrow(input.targetUserId)

    await database.users.update(target.id, { status: USER_STATUSES.DISABLED })
    await audit({
      userId: actor.id,
      actionCode: AUDIT_ACTIONS.ACCOUNT_DISABLED,
      entityType: 'user',
      entityId: target.id,
      detail: { username: target.username, previousStatus: target.status },
    })
    return { ...target, status: USER_STATUSES.DISABLED }
  }

  /** Admin-only listings backing the user-management queue. */
  async function listUsers(actingUserId: string): Promise<User[]> {
    await requireAdmin(actingUserId)
    return database.users.toArray()
  }

  async function listUsersByStatus(actingUserId: string, status: UserStatus): Promise<User[]> {
    await requireAdmin(actingUserId)
    return database.users.where('status').equals(status).toArray()
  }

  return {
    sessions,
    isAdminBootstrapped,
    bootstrapAdmin,
    register,
    login,
    logout,
    getCurrentUser,
    changePassword,
    resetPassword,
    activateUser,
    disableUser,
    listUsers,
    listUsersByStatus,
  }
}

export type AuthService = ReturnType<typeof createAuthService>

/** App-wide service, bound to the real Dexie database. */
export const authService = createAuthService()
