import { logAction, type AuditLogTable } from '../../audit/audit'
import { db as defaultDb, type AuscultaDB } from '../../db/db'
import { DEMO_AUDIT_ACTIONS, DEMO_SYSTEM_ACTOR } from './audit'

/**
 * The demo-mode switch, persisted in `appMeta`.
 *
 * It lives in IndexedDB rather than React state or `localStorage` for the same
 * reason the session does: this is an installed offline PWA that gets killed
 * and relaunched constantly, and a validator who switched demo data on should
 * not find it gone after the tab is reaped. Keeping it in the same store as
 * the clinical data also means one place to look when asking "why can this
 * device see fictional patients?".
 *
 * Off is the default and the fallback for anything unreadable. A device that
 * cannot tell you whether demo mode is on is a device that shows real data
 * only.
 *
 * Flipping the switch is audited. It changes which patients appear on clinical
 * screens, so "when did this device start showing fictional records, and who
 * turned them on?" has to be answerable after the fact.
 */

/** `appMeta` key holding the demo-mode switch. */
export const DEMO_MODE_META_KEY = 'demoMode'

/** Minimal database surface this module needs (mirrors auth/session.ts). */
export type AppMetaTable = Pick<AuscultaDB['appMeta'], 'get' | 'put' | 'delete'>
export interface DemoModeCapableDb {
  appMeta: AppMetaTable
  /** Optional so a test can still pass an appMeta-only stub. */
  auditLogs?: AuditLogTable
}

/**
 * Reads the switch. Anything that is not exactly `true` reads as off, so a
 * corrupted or half-written value fails closed rather than exposing fictional
 * records.
 */
export async function readDemoMode(db: DemoModeCapableDb = defaultDb): Promise<boolean> {
  const row = await db.appMeta.get(DEMO_MODE_META_KEY)
  return row?.value === true
}

/**
 * Turns demo mode on or off. Returns the value that was stored.
 *
 * `actor` defaults to the system actor because the one caller with no person
 * behind it is first-run setup; every user-driven path passes the signed-in
 * user's id.
 */
export async function setDemoMode(
  enabled: boolean,
  db: DemoModeCapableDb = defaultDb,
  actor: string = DEMO_SYSTEM_ACTOR,
): Promise<boolean> {
  const previous = await readDemoMode(db)
  await db.appMeta.put({ key: DEMO_MODE_META_KEY, value: enabled })

  // Only a real change is worth a line in the trail: re-asserting the current
  // state on every render would bury the events that matter.
  if (db.auditLogs !== undefined && previous !== enabled) {
    await logAction(
      {
        userId: actor,
        actionCode: enabled
          ? DEMO_AUDIT_ACTIONS.DEMO_MODE_ENABLED
          : DEMO_AUDIT_ACTIONS.DEMO_MODE_DISABLED,
        entityType: 'demoMode',
        detail: { enabled },
      },
      { auditLogs: db.auditLogs },
    )
  }
  return enabled
}

/** Flips the switch and returns the new value. */
export async function toggleDemoMode(
  db: DemoModeCapableDb = defaultDb,
  actor: string = DEMO_SYSTEM_ACTOR,
): Promise<boolean> {
  return setDemoMode(!(await readDemoMode(db)), db, actor)
}

/**
 * Removes the switch entirely, returning the device to the default (off).
 *
 * Used by `resetDemoData`: leaving demo mode on after the seeded records have
 * been deleted would present an empty demo experience that looks like a bug.
 *
 * Deliberately unaudited — the reset that calls it writes its own entry, and a
 * second "demo mode disabled" line beside it would describe one action twice.
 */
export async function clearDemoMode(db: DemoModeCapableDb = defaultDb): Promise<void> {
  await db.appMeta.delete(DEMO_MODE_META_KEY)
}
