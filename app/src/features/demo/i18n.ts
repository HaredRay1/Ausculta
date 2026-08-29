import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enDemo from '../../i18n/locales/en/demo.json'
import filDemo from '../../i18n/locales/fil/demo.json'

/**
 * Registers the `demo` translation namespace.
 *
 * `src/i18n/index.ts` is a frozen contract owned elsewhere and declares only
 * `common` and `codes`, so this feature adds its own bundle at import time
 * exactly as the auth layer does (see `src/auth/i18n.ts`). `addResourceBundle`
 * writes into the same resource store `t()` reads from, so
 * `useTranslation('demo')` resolves as if the namespace had been declared up
 * front.
 *
 * Idempotent, so importing it from several screens and from tests costs
 * nothing.
 *
 * The Filipino bundle is a DRAFT PENDING REVIEW by a native speaker. It covers
 * this namespace fully because nothing in it is clinical — every string is
 * about the fictional nature of the seeded data, which a Filipino-reading
 * clinician needs to understand more than anyone. Any key it lacks falls back
 * to English and is logged.
 */
export const DEMO_NS = 'demo'

export function registerDemoResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', DEMO_NS)) {
    instance.addResourceBundle('en', DEMO_NS, enDemo, true, true)
  }
  if (!instance.hasResourceBundle('fil', DEMO_NS)) {
    instance.addResourceBundle('fil', DEMO_NS, filDemo, true, true)
  }
  return instance
}

registerDemoResources(appI18n)

/** `useTranslation('demo')` with suspense off — every bundle is already in memory. */
export function useDemoTranslation() {
  return useTranslation(DEMO_NS, { useSuspense: false })
}
