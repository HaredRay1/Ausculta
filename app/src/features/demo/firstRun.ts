import { db as defaultDb, type AuscultaDB } from '../../db/db'
import { syncDemoAssignments } from './assignments'
import { setDemoMode } from './demoMode'
import { seedDemoData } from './seed'
import { DEMO } from './visibility'

/**
 * First-run demo data.
 *
 * The prototype is about to be handed to validators who will navigate it
 * unaided, and an empty app is scored as a navigation failure rather than as
 * an unbuilt feature. So a device that has never held a real patient starts
 * with the fictional clinic loaded and visible.
 *
 * Two guards keep that from ever happening to a clinic:
 *
 * - **Any real patient on the device and this does nothing, permanently.** A
 *   device with actual records is a device in use, and fictional patients must
 *   never appear beside them uninvited.
 * - **It runs at most once.** The marker is written even in the cases where
 *   nothing is seeded, so a health worker who switches demo mode off does not
 *   find it switched back on at the next launch. Nothing is more corrosive to
 *   trust than a setting that will not stay where it was put.
 *
 * Everything it does is reversible from the demo settings screen, and the
 * seeded records are marked as fictional wherever they appear.
 */

/** `appMeta` key recording that first-run demo setup has already been decided. */
export const DEMO_FIRST_RUN_META_KEY = 'demoFirstRunDone'

export type FirstRunOutcome =
  /** Already decided on a previous launch. */
  | 'already-decided'
  /** Real records present — demo data was not offered and never will be. */
  | 'declined-real-data-present'
  /** Fresh device: the fictional clinic was seeded and switched on. */
  | 'seeded'

export interface FirstRunResult {
  outcome: FirstRunOutcome
  demoEnabled: boolean
}

/**
 * Seeds and enables demo data on a device that has never held a real patient.
 *
 * Call once during app start-up, before the first screen renders. Idempotent
 * and safe to call on every launch.
 */
export async function ensureFirstRunDemo(
  db: AuscultaDB = defaultDb,
  now: number = Date.now(),
): Promise<FirstRunResult> {
  const decided = await db.appMeta.get(DEMO_FIRST_RUN_META_KEY)
  if (decided !== undefined) {
    // Runs on every launch, not just the first. Seeding happens before anyone
    // has an account, so the accounts created afterwards have to be granted
    // access to the fictional clinic at some later start-up or the patient
    // list renders empty for every role but admin.
    await syncDemoAssignments(db)
    return { outcome: 'already-decided', demoEnabled: false }
  }

  const realPatients = await db.patients.filter((patient) => patient.isDemo !== DEMO).count()
  if (realPatients > 0) {
    // Record the decision so this check does not run again, and so demo data
    // can never appear on this device by default later.
    await db.appMeta.put({ key: DEMO_FIRST_RUN_META_KEY, value: 'declined-real-data-present' })
    return { outcome: 'declined-real-data-present', demoEnabled: false }
  }

  await seedDemoData(db, { now })
  await syncDemoAssignments(db)
  await setDemoMode(true, db)
  await db.appMeta.put({ key: DEMO_FIRST_RUN_META_KEY, value: 'seeded' })
  return { outcome: 'seeded', demoEnabled: true }
}
