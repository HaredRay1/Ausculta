import { describe, expect, it } from 'vitest'
import { DecodeError, WavParseError } from '../../../audio'
import enAssessment from '../../../i18n/locales/en/assessment.json'
import {
  DECODE_ERROR_CODES,
  IMPORT_ERROR_UNKNOWN_KEY,
  WAV_ERROR_CODES,
  importErrorKey,
} from './importErrors'

/** Resolves a dotted i18n key against the English bundle. */
function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined,
      enAssessment,
    )
}

const allErrors = [
  ...DECODE_ERROR_CODES.map((code) => new DecodeError(code, `decode: ${code}`)),
  ...WAV_ERROR_CODES.map((code) => new WavParseError(code, `wav: ${code}`)),
]

describe('importErrorKey', () => {
  it('gives every decode and WAV failure code a key of its own', () => {
    const keys = allErrors.map(importErrorKey)

    expect(keys).toHaveLength(DECODE_ERROR_CODES.length + WAV_ERROR_CODES.length)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('names the specific problem for the 16-bit case rather than "invalid file"', () => {
    expect(importErrorKey(new WavParseError('unsupported-bit-depth', 'x'))).toBe(
      'import.error.unsupported-bit-depth',
    )
    expect(importErrorKey(new DecodeError('too-long', 'x'))).toBe('import.error.too-long')
  })

  it('has English copy for every one of those keys', () => {
    for (const error of allErrors) {
      const message = lookup(importErrorKey(error))
      expect(typeof message, `missing copy for ${importErrorKey(error)}`).toBe('string')
      expect((message as string).length).toBeGreaterThan(0)
    }
  })

  it('falls back to one honest unknown message for anything else', () => {
    expect(importErrorKey(new Error('boom'))).toBe(IMPORT_ERROR_UNKNOWN_KEY)
    expect(importErrorKey(null)).toBe(IMPORT_ERROR_UNKNOWN_KEY)
    expect(typeof lookup(IMPORT_ERROR_UNKNOWN_KEY)).toBe('string')
  })

  it('does not mistake a decode code for a WAV code', () => {
    expect(importErrorKey(new DecodeError('decode-failed', 'x'))).not.toBe(
      importErrorKey(new WavParseError('unsupported-format', 'x')),
    )
  })
})
