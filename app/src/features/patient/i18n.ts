import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enPatient from '../../i18n/locales/en/patient.json'
import filPatient from '../../i18n/locales/fil/patient.json'
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
  // Filipino is a DRAFT PENDING REVIEW and covers navigation, screen titles,
  // empty states and the read-only profile only. Everything that interprets a
  // recording — `results.breakdown`, the quality and not-analysed wording, the
  // whole `review` block, the trend chart captions, the consent lines and the
  // rehabilitation safety copy — is absent on purpose, so i18next falls back to
  // the reviewed English and records the miss.
  if (!instance.hasResourceBundle('fil', PATIENT_NS)) {
    instance.addResourceBundle('fil', PATIENT_NS, filPatient, true, true)
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
