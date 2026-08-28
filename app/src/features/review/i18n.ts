import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enReview from '../../i18n/locales/en/review.json'

/**
 * Registers the `review` namespace, following `auth/i18n.ts` exactly.
 *
 * `src/i18n/index.ts` is a frozen contract declaring only `common` and `codes`,
 * so this feature adds its bundle at import time rather than editing it.
 * Idempotent, so importing from several screens and from tests costs nothing.
 */
export const REVIEW_NS = 'review'

export function registerReviewResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', REVIEW_NS)) {
    instance.addResourceBundle('en', REVIEW_NS, enReview, true, true)
  }
  return instance
}

registerReviewResources(appI18n)

/** `useTranslation('review')` plus `codes`, since every clinical value is a code. */
export function useReviewTranslation() {
  return useTranslation([REVIEW_NS, 'codes'], { useSuspense: false })
}
