import { describe, expect, it } from 'vitest'
import { CODE_REGISTRY } from './codes'
import enCodes from '../i18n/locales/en/codes.json'

type CodesJson = Record<string, Record<string, unknown>>

/**
 * i18n exhaustiveness gate: every code in CODE_REGISTRY must have a
 * non-empty display string in locales/en/codes.json at
 * `<namespace>.<CODE>`. Future phases add codes to CODE_REGISTRY — this
 * test is what forces the matching translation to be added too.
 */
describe('CODE_REGISTRY / locales/en/codes.json exhaustiveness', () => {
  const namespaces = Object.keys(CODE_REGISTRY)

  it('has at least one namespace', () => {
    expect(namespaces.length).toBeGreaterThan(0)
  })

  it.each(namespaces)('namespace "%s" exists in codes.json', (namespace) => {
    expect(enCodes as CodesJson).toHaveProperty(namespace)
  })

  for (const namespace of namespaces) {
    const codes = CODE_REGISTRY[namespace]
    for (const code of codes) {
      it(`codes.${namespace}.${code} has a non-empty display string`, () => {
        const bundle = enCodes as CodesJson
        const value = bundle[namespace]?.[code]
        expect(typeof value).toBe('string')
        expect((value as string).trim().length).toBeGreaterThan(0)
      })
    }
  }
})
