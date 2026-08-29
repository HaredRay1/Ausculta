import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enResearch from '../../i18n/locales/en/research.json'
import filResearch from '../../i18n/locales/fil/research.json'

/**
 * Registers the `research` translation namespace.
 *
 * Same pattern as `src/auth/i18n.ts` and `src/features/demo/i18n.ts`:
 * `src/i18n/index.ts` is a frozen contract declaring only `common` and
 * `codes`, so this feature adds its own bundle at import time rather than
 * editing it.
 *
 * The Filipino bundle is a DRAFT PENDING REVIEW and covers only navigation,
 * the dashboard counts and the export screen — including the privacy statement,
 * which a Filipino-reading study team member has the most reason to read.
 * Deliberately absent, falling back to English: the whole `groundTruth` block
 * (a clinical labelling judgement), the `performance` statistics, and the
 * labelling instructions. The researcher screens are the one part of the app
 * whose audience is not the rural clinic, and inventing Filipino for terms like
 * "specificity" without a speaker to check it would be worse than the fallback.
 */
export const RESEARCH_NS = 'research'

export function registerResearchResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', RESEARCH_NS)) {
    instance.addResourceBundle('en', RESEARCH_NS, enResearch, true, true)
  }
  if (!instance.hasResourceBundle('fil', RESEARCH_NS)) {
    instance.addResourceBundle('fil', RESEARCH_NS, filResearch, true, true)
  }
  return instance
}

registerResearchResources(appI18n)

/** `useTranslation('research')` with suspense off — bundles are already in memory. */
export function useResearchTranslation() {
  return useTranslation(RESEARCH_NS, { useSuspense: false })
}
