import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../i18n'
import enAuth from '../i18n/locales/en/auth.json'
import filAuth from '../i18n/locales/fil/auth.json'

/**
 * Registers the `auth` translation namespace on an i18next instance.
 *
 * The app's i18next setup (`src/i18n/index.ts`) is a frozen contract owned by
 * another part of the codebase and declares only `common` and `codes`. Rather
 * than edit it, this feature adds its own bundle at import time —
 * `addResourceBundle` puts the strings in the same resource store `t()` reads
 * from, so `useTranslation('auth')` resolves exactly as if the namespace had
 * been declared up front.
 *
 * Idempotent: re-registering is skipped, so importing this module from several
 * screens (and from tests) costs nothing.
 */
export const AUTH_NS = 'auth'

export function registerAuthResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', AUTH_NS)) {
    instance.addResourceBundle('en', AUTH_NS, enAuth, true, true)
  }
  // Filipino is a DRAFT PENDING REVIEW. Nothing in this namespace is clinical,
  // so it is translated in full apart from the few field labels that Philippine
  // practice says in English anyway (username, password, patient ID); those are
  // absent so i18next falls back to the English term people actually use.
  if (!instance.hasResourceBundle('fil', AUTH_NS)) {
    instance.addResourceBundle('fil', AUTH_NS, filAuth, true, true)
  }
  return instance
}

registerAuthResources(appI18n)

/**
 * `useTranslation('auth')` with suspense off.
 *
 * There is no i18next backend — every bundle is already in memory by the time
 * anything renders — so suspending on namespace load would only add a
 * Suspense boundary requirement for an await that never happens.
 */
export function useAuthTranslation() {
  return useTranslation(AUTH_NS, { useSuspense: false })
}
