import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../i18n'
import enDesign from '../i18n/locales/en/design.json'
import filDesign from '../i18n/locales/fil/design.json'

/**
 * Registers the `design` translation namespace.
 *
 * `src/i18n/index.ts` is owned elsewhere and declares only `common` and
 * `codes`, so rather than edit it this system adds its own bundle at import
 * time. `addResourceBundle` puts the strings in the same store `t()` reads
 * from, so `useTranslation('design')` resolves exactly as if the namespace had
 * been declared up front. (The auth layer registers itself the same way.)
 *
 * Idempotent — importing this from every component costs nothing.
 */
export const DESIGN_NS = 'design'

export function registerDesignResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', DESIGN_NS)) {
    instance.addResourceBundle('en', DESIGN_NS, enDesign, true, true)
  }
  // The Filipino bundle is deliberately partial: it carries interface chrome
  // only. Every clinical string in this namespace — the verdict copy under
  // `result`, the confidence explanation, the disclaimers and the audio error
  // body — is absent by design, so i18next falls back to English and the miss
  // is logged. Machine-translated clinical wording is worse than English.
  if (!instance.hasResourceBundle('fil', DESIGN_NS)) {
    instance.addResourceBundle('fil', DESIGN_NS, filDesign, true, true)
  }
  return instance
}

registerDesignResources(appI18n)

/**
 * `useTranslation('design')` with suspense off — every bundle is already in
 * memory, so there is no load to suspend on.
 */
export function useDesignTranslation() {
  return useTranslation(DESIGN_NS, { useSuspense: false })
}
