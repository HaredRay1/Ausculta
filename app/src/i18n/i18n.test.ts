import { describe, expect, it, beforeEach } from 'vitest'
import { AuscultaDB } from '../db/db'
import { createMissingKeyHandler } from './missingKeyHandler'
import { createI18n } from './index'

describe('createMissingKeyHandler', () => {
  let db: AuscultaDB

  beforeEach(() => {
    db = new AuscultaDB(`ausculta-i18n-test-${crypto.randomUUID()}`)
  })

  it('upserts a new missing key into missingTranslations with count 1', async () => {
    const handler = createMissingKeyHandler(db)

    await handler(['fil'], 'common', 'someUnknownKey', 'someUnknownKey')

    const row = await db.missingTranslations.get(['common:someUnknownKey', 'fil'])
    expect(row).toBeDefined()
    expect(row?.count).toBe(1)
    expect(row?.language).toBe('fil')
    expect(row?.key).toBe('common:someUnknownKey')
    expect(typeof row?.lastSeen).toBe('string')
  })

  it('increments count on a repeated miss of the same key+language', async () => {
    const handler = createMissingKeyHandler(db)

    await handler(['fil'], 'common', 'repeatedKey', 'repeatedKey')
    await handler(['fil'], 'common', 'repeatedKey', 'repeatedKey')

    const row = await db.missingTranslations.get(['common:repeatedKey', 'fil'])
    expect(row?.count).toBe(2)
  })

  it('never throws (or rejects) even if the db write fails', async () => {
    const throwingDb = {
      missingTranslations: {
        get: async () => {
          throw new Error('boom')
        },
        put: async () => {
          throw new Error('boom')
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const handler = createMissingKeyHandler(throwingDb)
    await expect(handler(['fil'], 'common', 'x', 'x')).resolves.toBeUndefined()
  })
})

describe('i18next fallback behavior', () => {
  it('falls back to English when a key is missing in the current language', async () => {
    const db = new AuscultaDB(`ausculta-i18n-fallback-test-${crypto.randomUUID()}`)
    const i18n = createI18n(db)
    await i18n.changeLanguage('fil')

    // "getStarted" only exists in en/common.json this phase; fil/common.json
    // is deliberately minimal (§5). The resolved string must be the English
    // value, never the raw "common:getStarted" key.
    const resolved = i18n.t('common:getStarted')
    expect(resolved).not.toBe('common:getStarted')
    expect(resolved).toBe(i18n.getResource('en', 'common', 'getStarted'))
  })

  it('resolves real strings before any changeLanguage call (LanguageSelect renders on first load)', () => {
    const db = new AuscultaDB(`ausculta-i18n-default-test-${crypto.randomUUID()}`)
    const i18n = createI18n(db)

    expect(i18n.t('common:languageNameEn')).toBe('English')
    expect(i18n.t('common:languageNameFil')).toBe('Filipino')
  })
})
