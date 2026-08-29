import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enMonitoring from '../../i18n/locales/en/monitoring.json'

/**
 * Registers the `monitoring` namespace, following `auth/i18n.ts` exactly.
 * Idempotent, so importing from several screens and from tests costs nothing.
 */
export const MONITORING_NS = 'monitoring'

export function registerMonitoringResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', MONITORING_NS)) {
    instance.addResourceBundle('en', MONITORING_NS, enMonitoring, true, true)
  }
  return instance
}

registerMonitoringResources(appI18n)

/** `useTranslation('monitoring')` plus `codes`, for clinical values. */
export function useMonitoringTranslation() {
  return useTranslation([MONITORING_NS, 'codes'], { useSuspense: false })
}
