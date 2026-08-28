import i18next, { type i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { db as defaultDb, type AuscultaDB } from '../db/db'
import { createMissingKeyHandler, type MissingTranslationsTable } from './missingKeyHandler'

import enCommon from './locales/en/common.json'
import enCodes from './locales/en/codes.json'
import filCommon from './locales/fil/common.json'

export const SUPPORTED_LANGUAGES = ['en', 'fil'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const resources = {
  en: { common: enCommon, codes: enCodes },
  fil: { common: filCommon },
}

/**
 * Builds a fresh i18next instance wired to `db.missingTranslations`.
 *
 * Resources are static JSON (no backend plugin), so the resource store is
 * populated synchronously inside `.init()` — callers don't need to await
 * the returned promise before calling `t()`. Anything that must be certain
 * a specific language is fully active (tests included) should await
 * `changeLanguage()` instead, which i18next queues correctly even if
 * `.init()` hasn't settled yet.
 */
export function createI18n(
  db: { missingTranslations: MissingTranslationsTable } | AuscultaDB = defaultDb,
): I18nInstance {
  const instance = i18next.createInstance()
  void instance.use(initReactI18next).init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    ns: ['common', 'codes'],
    defaultNS: 'common',
    saveMissing: true,
    missingKeyHandler: createMissingKeyHandler(db),
    interpolation: { escapeValue: false },
  })
  return instance
}

/** App-wide singleton, bound to the real Dexie database. */
export const i18n = createI18n()
