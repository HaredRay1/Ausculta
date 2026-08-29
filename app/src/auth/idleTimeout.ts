import { DEFAULT_IDLE_TIMEOUT_MS } from './session'

/**
 * The idle timeout actually in force, which an administrator can change.
 *
 * A module-level value rather than a service option because the app's
 * `authService` is constructed at import time, long before the database can be
 * read — and a configuration screen that changed a number without changing the
 * behaviour would be exactly the lying control this project refuses elsewhere.
 * The service reads through this on every expiry check, so a saved change takes
 * effect on the next one rather than at the next app launch.
 *
 * Null means "nobody has configured one", which resolves to the 30-minute
 * default rather than to no timeout at all. Failing open on a session timeout
 * would leave a shared clinic phone signed in indefinitely.
 */
let configuredIdleTimeoutMs: number | null = null

export function setConfiguredIdleTimeoutMs(ms: number | null): void {
  configuredIdleTimeoutMs = ms !== null && Number.isFinite(ms) && ms > 0 ? ms : null
}

export function currentIdleTimeoutMs(): number {
  return configuredIdleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
}
