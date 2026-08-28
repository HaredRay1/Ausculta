import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enAssessment from '../../i18n/locales/en/assessment.json'

/**
 * Registers the `assessment` translation namespace on an i18next instance.
 *
 * Same shape as `src/auth/i18n.ts`, and for the same reason: `src/i18n/index.ts`
 * is a frozen contract that declares only `common` and `codes`, so this feature
 * adds its own bundle at import time instead of editing it. `addResourceBundle`
 * writes into the store `t()` already reads from, so `useTranslation('assessment')`
 * resolves exactly as if the namespace had been declared up front.
 *
 * Idempotent — importing this module from every screen and every test costs
 * nothing after the first time.
 */
export const ASSESSMENT_NS = 'assessment'

export function registerAssessmentResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', ASSESSMENT_NS)) {
    instance.addResourceBundle('en', ASSESSMENT_NS, enAssessment, true, true)
  }
  return instance
}

registerAssessmentResources(appI18n)

/**
 * `useTranslation('assessment')` with suspense off.
 *
 * There is no i18next backend — every bundle is in memory before anything
 * renders — so suspending on namespace load would only add a Suspense boundary
 * requirement for an await that never happens.
 */
export function useAssessmentTranslation() {
  return useTranslation(ASSESSMENT_NS, { useSuspense: false })
}
