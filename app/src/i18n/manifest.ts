export interface TranslationManifestEntry {
  namespace: string
  language: string
  version: number
  status: 'approved' | 'draft'
}

/**
 * Tracks the review status of each locale bundle that actually exists under
 * `src/i18n/locales/`.
 *
 * `fil/codes.json` and `fil/rehab.json` do not exist and have no entries:
 * clinical code display names and the whole rehabilitation namespace are
 * clinical vocabulary and safety copy, which this project forbids translating
 * without a qualified human translator and a practitioner. Every `fil` bundle
 * listed below is `draft` — partial by design, interface chrome only, awaiting
 * review by a native Filipino speaker. Clinical, consent, verdict and safety
 * keys are deliberately absent from them so i18next falls back to English and
 * logs the miss.
 */
export const TRANSLATION_MANIFEST: readonly TranslationManifestEntry[] = [
  { namespace: 'common', language: 'en', version: 1, status: 'approved' },
  { namespace: 'codes', language: 'en', version: 1, status: 'approved' },
  { namespace: 'common', language: 'fil', version: 1, status: 'draft' },
  { namespace: 'design', language: 'fil', version: 1, status: 'draft' },
  { namespace: 'demo', language: 'fil', version: 1, status: 'draft' },
  { namespace: 'patient', language: 'fil', version: 1, status: 'draft' },
]
