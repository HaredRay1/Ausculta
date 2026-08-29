import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enAdmin from '../../i18n/locales/en/admin.json'
import filAdmin from '../../i18n/locales/fil/admin.json'

/**
 * Registers the `admin` namespace, following `auth/i18n.ts` exactly.
 *
 * `src/i18n/index.ts` declares only `common` and `codes`, so this feature adds
 * its bundle at import time rather than editing it. Idempotent.
 */
export const ADMIN_NS = 'admin'

export function registerAdminResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', ADMIN_NS)) {
    instance.addResourceBundle('en', ADMIN_NS, enAdmin, true, true)
  }
  // Filipino is a DRAFT PENDING REVIEW covering navigation, the activity log
  // and the translation worklist. The severity-band editor and the
  // analysis-threshold notice are absent on purpose and fall back to English:
  // both describe the numbers that decide whether a recording is called a
  // possible finding, which is clinical wording.
  if (!instance.hasResourceBundle('fil', ADMIN_NS)) {
    instance.addResourceBundle('fil', ADMIN_NS, filAdmin, true, true)
  }
  return instance
}

registerAdminResources(appI18n)

/** `useTranslation('admin')` plus `codes`, since actions and roles are codes. */
export function useAdminTranslation() {
  return useTranslation([ADMIN_NS, 'codes'], { useSuspense: false })
}
