import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enPatients from '../../i18n/locales/en/patients.json'
import filPatients from '../../i18n/locales/fil/patients.json'

/**
 * Registers the `patients` translation namespace.
 *
 * `src/i18n/index.ts` is a frozen contract owned elsewhere and declares only
 * `common` and `codes`, so this feature adds its own bundle at import time
 * rather than editing it — the same approach `auth/i18n.ts` takes.
 * `addResourceBundle` writes into the store `t()` already reads from, so
 * `useTranslation('patients')` resolves as if the namespace had been declared
 * up front.
 *
 * Idempotent, so importing it from several screens and from tests costs
 * nothing.
 */
export const PATIENTS_NS = 'patients'

export function registerPatientsResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', PATIENTS_NS)) {
    instance.addResourceBundle('en', PATIENTS_NS, enPatients, true, true)
  }
  // Filipino is a DRAFT PENDING REVIEW covering the register/search/detail
  // chrome and the form validation errors. The entire `consent` block, the
  // CONSENT_* errors, `card.consentMissing` and PATIENT_CONSENT_RECORDED are
  // absent on purpose: consent wording of any kind stays in the reviewed
  // English until a qualified translator and an ethics reviewer sign it off.
  if (!instance.hasResourceBundle('fil', PATIENTS_NS)) {
    instance.addResourceBundle('fil', PATIENTS_NS, filPatients, true, true)
  }
  return instance
}

registerPatientsResources(appI18n)

/**
 * `useTranslation('patients')` with suspense off — every bundle is already in
 * memory, so there is no load to suspend on.
 *
 * The second namespace is `codes`, because clinical values are stored as codes
 * and every screen here has to render them as words.
 */
export function usePatientsTranslation() {
  return useTranslation([PATIENTS_NS, 'codes'], { useSuspense: false })
}
