import type { AuscultaDB } from '../db/db'
import { createAuthService, type AuthService, type AuthServiceOptions } from './authService'

/**
 * Test-only helpers for the auth layer. Nothing in the app imports this, so it
 * never reaches a bundle.
 */

/**
 * PBKDF2 work factor for tests.
 *
 * Production uses PBKDF2_ITERATIONS (210,000) and must keep doing so — that
 * cost is the whole point of the algorithm. But it is roughly 100ms of
 * deliberate CPU burn per password, and these suites hash dozens: at full cost
 * that is seconds of pure slowness, and it puts UI assertions in a race against
 * their own timeout once the wider suite is competing for the same cores.
 *
 * 1,000 exercises the identical code path — derive, hex-encode, timing-safe
 * compare — at a thousandth of the cost. The work factor itself is pinned by
 * its own assertion in authService.test.ts, so this cannot mask a production
 * regression.
 */
export const TEST_PASSWORD_ITERATIONS = 1_000

/** `createAuthService` at the cheap test work factor. */
export function createTestAuthService(
  database: AuscultaDB,
  options: AuthServiceOptions = {},
): AuthService {
  return createAuthService(database, {
    passwordIterations: TEST_PASSWORD_ITERATIONS,
    ...options,
  })
}
