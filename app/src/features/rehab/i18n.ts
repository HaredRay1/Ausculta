import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enRehab from '../../i18n/locales/en/rehab.json'
// Every screen here renders design-system components whose fixed safety
// wording lives in the design bundle.
import '../../design/i18n'

/**
 * Registers the `rehab` translation namespace.
 *
 * `src/i18n/index.ts` is a frozen contract owned elsewhere and declares only
 * `common` and `codes`, so this feature adds its own bundle at import time —
 * the same approach `auth/i18n.ts` and `features/patient/i18n.ts` take.
 * Idempotent, so importing it from every screen and from tests costs nothing.
 *
 * ## English only, on purpose
 *
 * Everything in this namespace is clinical or safety text. The project forbids
 * machine translation of clinical, consent and safety wording: it must be
 * translated by a qualified human and reviewed by a practitioner before it
 * ships in another language. So there is deliberately no `fil` bundle here, and
 * `REHAB_CONTENT_VERSION` below is the stamp an approved translation would be
 * pinned against (add a matching row to `i18n/manifest.ts` when one exists —
 * that file is owned elsewhere).
 *
 * Draft Filipino source wording that came out of the clinical research lives in
 * `content/tagalogDraft.ts`, is marked as unreviewed, and is deliberately not
 * registered as a resource bundle — nothing can render it by accident.
 */
export const REHAB_NS = 'rehab'

/**
 * Version stamp for the clinical copy in this namespace.
 *
 * Bump it whenever safety wording, red-flag content or technique copy changes.
 * An approved translation is approved against a specific version; without a
 * stamp there is no way to tell a reviewed translation from a stale one.
 */
export const REHAB_CONTENT_VERSION = 1

/**
 * Whether a practitioner has signed this content off.
 *
 * Hard-coded to `false` and rendered as a visible notice on every screen in the
 * feature. The wording is drawn from published guidelines, but the study's
 * clinician has not reviewed it, and a validator scoring patient safety must be
 * able to see that from the screen rather than from a commit message.
 */
export const REHAB_CLINICIAN_REVIEWED = false

export function registerRehabResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', REHAB_NS)) {
    instance.addResourceBundle('en', REHAB_NS, enRehab, true, true)
  }
  return instance
}

registerRehabResources(appI18n)

/**
 * `useTranslation('rehab')` with suspense off — every bundle is already in
 * memory, so there is no load to suspend on.
 *
 * `design` comes along because a few screens quote the design system's fixed
 * safety sentences outside a component that already owns them.
 */
export function useRehabTranslation() {
  return useTranslation([REHAB_NS, 'design'], { useSuspense: false })
}
