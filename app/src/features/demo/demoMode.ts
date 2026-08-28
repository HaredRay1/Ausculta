import { db as defaultDb, type AuscultaDB } from '../../db/db'

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
 */

/** `appMeta` key holding the demo-mode switch. */
export const DEMO_MODE_META_KEY = 'demoMode'

/** Minimal database surface this module needs (mirrors auth/session.ts). */
export type AppMetaTable = Pick<AuscultaDB['appMeta'], 'get' | 'put' | 'delete'>
export interface DemoModeCapableDb {
  appMeta: AppMetaTable
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

/** Turns demo mode on or off. Returns the value that was stored. */
export async function setDemoMode(
  enabled: boolean,
  db: DemoModeCapableDb = defaultDb,
): Promise<boolean> {
  await db.appMeta.put({ key: DEMO_MODE_META_KEY, value: enabled })
  return enabled
}

/** Flips the switch and returns the new value. */
export async function toggleDemoMode(db: DemoModeCapableDb = defaultDb): Promise<boolean> {
  return setDemoMode(!(await readDemoMode(db)), db)
}

/**
 * Removes the switch entirely, returning the device to the default (off).
 *
 * Used by `resetDemoData`: leaving demo mode on after the seeded records have
 * been deleted would present an empty demo experience that looks like a bug.
 */
export async function clearDemoMode(db: DemoModeCapableDb = defaultDb): Promise<void> {
  await db.appMeta.delete(DEMO_MODE_META_KEY)
}
