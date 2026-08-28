import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enDemo from '../../i18n/locales/en/demo.json'

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
 * Filipino is not bundled yet: shipping a machine-translated clinical string
 * would be worse than falling back to English, which i18next does on its own.
 */
export const DEMO_NS = 'demo'

export function registerDemoResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', DEMO_NS)) {
    instance.addResourceBundle('en', DEMO_NS, enDemo, true, true)
  }
  return instance
}

registerDemoResources(appI18n)

/** `useTranslation('demo')` with suspense off — every bundle is already in memory. */
export function useDemoTranslation() {
  return useTranslation(DEMO_NS, { useSuspense: false })
}
