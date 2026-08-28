import type { AuscultaDB } from '../db/db'

/**
 * Minimal shape this handler needs from the database — lets tests pass a
 * stub instead of a full AuscultaDB.
 */
export type MissingTranslationsTable = Pick<AuscultaDB['missingTranslations'], 'get' | 'put'>

/**
 * Builds an i18next `missingKeyHandler` bound to a Dexie database.
 *
 * Every miss upserts `missingTranslations` keyed by `[ns:key, language]`,
 * incrementing `count` and refreshing `lastSeen`. i18next calls this
 * callback and discards its return value (fire-and-forget from render's
 * point of view) — the handler is async and returns its promise anyway so
 * tests can await it deterministically. A failed write is swallowed: it
 * must never throw into render.
 */
export function createMissingKeyHandler(db: { missingTranslations: MissingTranslationsTable }) {
  return async (
    languages: readonly string[],
    namespace: string,
    key: string,
    _fallbackValue?: string,
    _updateMissing?: boolean,
    _options?: unknown,
  ): Promise<void> => {
    const language = languages[0] ?? 'unknown'
    const compositeKey = `${namespace}:${key}`

    try {
      const existing = await db.missingTranslations.get([compositeKey, language])
      await db.missingTranslations.put({
        key: compositeKey,
        language,
        count: (existing?.count ?? 0) + 1,
        lastSeen: new Date().toISOString(),
      })
    } catch {
      // Swallow: a missing-translation log write must never throw into render.
    }
  }
}
