import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enPatient from '../../i18n/locales/en/patient.json'
// Registering the design bundle here too, because every screen in this feature
// renders design-system components whose fixed safety wording lives in it.
import '../../design/i18n'

/**
 * Registers the `patient` translation namespace.
 *
 * `src/i18n/index.ts` is a frozen contract owned elsewhere and declares only
 * `common` and `codes`, so this feature adds its own bundle at import time
 * rather than editing it — the same approach `auth/i18n.ts` takes.
 * `addResourceBundle` writes into the store `t()` already reads from, so
 * `useTranslation('patient')` resolves as if the namespace had been declared up
 * front.
 *
 * Idempotent, so importing it from every screen and from tests costs nothing.
 */
export const PATIENT_NS = 'patient'

export function registerPatientResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', PATIENT_NS)) {
    instance.addResourceBundle('en', PATIENT_NS, enPatient, true, true)
  }
  return instance
}

registerPatientResources(appI18n)

/**
 * `useTranslation('patient')` with suspense off — every bundle is already in
 * memory, so there is no load to suspend on.
 *
 * `codes` comes along because clinical values are stored as codes and every
 * screen here has to render them as words; `design` because a few screens
 * quote the design system's fixed safety sentences outside a component that
 * already owns them.
 */
export function usePatientTranslation() {
  return useTranslation([PATIENT_NS, 'codes', 'design'], { useSuspense: false })
}
