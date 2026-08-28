import { db as defaultDb, type AuscultaDB } from '../../../db/db'

/**
 * Small, durable user preferences for the assessment flow.
 *
 * Stored in `appMeta` rather than localStorage, following the auth layer's
 * session: the app is offline-first and everything else it remembers lives in
 * the same database, so a device wipe or an export sees one store, not two.
 */

/** True once the health worker has ticked "don't show this guide again". */
export const SKIP_DEVICE_GUIDE_KEY = 'assessment.skipDeviceGuide'

export async function getSkipDeviceGuide(database: AuscultaDB = defaultDb): Promise<boolean> {
  try {
    return (await database.appMeta.get(SKIP_DEVICE_GUIDE_KEY))?.value === true
  } catch {
    // A preference is never worth failing a clinical screen over: showing the
    // guide again is the harmless outcome.
    return false
  }
}

export async function setSkipDeviceGuide(
  value: boolean,
  database: AuscultaDB = defaultDb,
): Promise<void> {
  try {
    await database.appMeta.put({ key: SKIP_DEVICE_GUIDE_KEY, value })
  } catch {
    // Same reasoning: losing a preference must not break the wizard.
  }
}
