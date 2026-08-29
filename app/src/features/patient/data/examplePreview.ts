/**
 * Whether this user has asked to browse a demonstration record.
 *
 * Exists because the patient screens used to substitute a seeded record for an
 * unlinked account automatically. A real person registering on a seeded device
 * was greeted by name as somebody fictional and shown that person's visits as
 * their own — the app presenting an invented PERSON as the signed-in user.
 *
 * Demonstration data is still reachable, because a validator with no record of
 * their own would otherwise meet nothing but empty states. The difference is
 * that they now ask for it, by name, and every screen keeps saying whose data
 * it is.
 *
 * Session-scoped rather than persisted: it is a way of looking round the app,
 * not a setting. Closing the app ends it, and it never survives to a point
 * where someone could forget they turned it on.
 */

const KEY = 'ausculta.patient.exampleRecord'

/** Reads the flag, tolerating storage being unavailable or blocked. */
export function isExampleRecordShown(): boolean {
  try {
    return sessionStorage.getItem(KEY) === 'true'
  } catch {
    // Private mode, blocked storage, a non-browser test environment. Failing
    // closed is right: the honest empty state is the safe default.
    return false
  }
}

export function setExampleRecordShown(shown: boolean): void {
  try {
    if (shown) sessionStorage.setItem(KEY, 'true')
    else sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to do. The caller re-renders either way and simply gets the
    // honest state, which is never the wrong thing to show.
  }
}
