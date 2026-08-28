export interface TranslationManifestEntry {
  namespace: string
  language: string
  version: number
  status: 'approved' | 'draft'
}

/**
 * Tracks the review status of each locale bundle that actually exists under
 * `src/i18n/locales/`. `fil/codes.json` does not exist yet (deferred to a
 * later phase), so it has no entry here.
 */
export const TRANSLATION_MANIFEST: readonly TranslationManifestEntry[] = [
  { namespace: 'common', language: 'en', version: 1, status: 'approved' },
  { namespace: 'codes', language: 'en', version: 1, status: 'approved' },
  { namespace: 'common', language: 'fil', version: 1, status: 'draft' },
]
