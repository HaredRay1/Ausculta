import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enMonitoring from '../../i18n/locales/en/monitoring.json'
import filMonitoring from '../../i18n/locales/fil/monitoring.json'

/**
 * Registers the `monitoring` namespace, following `auth/i18n.ts` exactly.
 * Idempotent, so importing from several screens and from tests costs nothing.
 *
 * The Filipino bundle is a DRAFT PENDING REVIEW and carries form labels,
 * buttons, statuses, errors and audit names only. Everything under `alertType`
 * is absent on purpose — each one states a clinical observation about a
 * patient — as are the interpretive lines in `trend` and `alerts`
 * (`observationNote`, `whatThisMeans`, the severity-unavailable explanation and
 * the clinical parts of the plan form). Those fall back to the reviewed
 * English and the miss is logged.
 */
export const MONITORING_NS = 'monitoring'

export function registerMonitoringResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', MONITORING_NS)) {
    instance.addResourceBundle('en', MONITORING_NS, enMonitoring, true, true)
  }
  if (!instance.hasResourceBundle('fil', MONITORING_NS)) {
    instance.addResourceBundle('fil', MONITORING_NS, filMonitoring, true, true)
  }
  return instance
}

registerMonitoringResources(appI18n)

/** `useTranslation('monitoring')` plus `codes`, for clinical values. */
export function useMonitoringTranslation() {
  return useTranslation([MONITORING_NS, 'codes'], { useSuspense: false })
}
