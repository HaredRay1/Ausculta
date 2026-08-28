export const DEVICE_LANGUAGE_STORAGE_KEY = 'ausculta.deviceLanguage'

/** Reads the persisted device language choice, if any (never throws). */
export function getStoredDeviceLanguage(): string | null {
  try {
    return window.localStorage.getItem(DEVICE_LANGUAGE_STORAGE_KEY)
  } catch {
    return null
  }
}
