import { describe, expect, it } from 'vitest'
import {
  DERIVED_BITS,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
  hashPassword,
  timingSafeEqual,
  verifyPassword,
} from './crypto'

describe('hashPassword', () => {
  it('round-trips: the password that produced a hash verifies against it', async () => {
    const stored = await hashPassword('correct horse battery staple')

    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple')

    await expect(verifyPassword('correct horse battery stapl', stored)).resolves.toBe(false)
    await expect(verifyPassword('', stored)).resolves.toBe(false)
    await expect(verifyPassword('CORRECT HORSE BATTERY STAPLE', stored)).resolves.toBe(false)
  })

  it('records the salt and iteration count it actually used', async () => {
    const stored = await hashPassword('hunter2hunter2')

    expect(stored.iterations).toBe(PBKDF2_ITERATIONS)
    expect(stored.passwordSalt).toHaveLength(SALT_BYTES * 2)
    expect(stored.passwordHash).toHaveLength((DERIVED_BITS / 8) * 2)
    expect(stored.passwordSalt).toMatch(/^[0-9a-f]+$/)
    expect(stored.passwordHash).toMatch(/^[0-9a-f]+$/)
  })

  it('salts per call, so the same password never yields the same stored hash', async () => {
    const a = await hashPassword('same password here')
    const b = await hashPassword('same password here')

    expect(a.passwordSalt).not.toBe(b.passwordSalt)
    expect(a.passwordHash).not.toBe(b.passwordHash)
    await expect(verifyPassword('same password here', a)).resolves.toBe(true)
    await expect(verifyPassword('same password here', b)).resolves.toBe(true)
  })

  it('verifies against the stored iteration count, not the current default', async () => {
    // Simulates a row written before PBKDF2_ITERATIONS was raised.
    const legacy = await hashPassword('legacy password', 1_000)

    expect(legacy.iterations).toBe(1_000)
    await expect(verifyPassword('legacy password', legacy)).resolves.toBe(true)
    await expect(verifyPassword('wrong', legacy)).resolves.toBe(false)
  })

  it('treats visually identical Unicode spellings of a password as equal', async () => {
    // "é" as one code point vs. "e" + combining acute — the same password typed
    // on two different keyboards.
    const stored = await hashPassword('cafépass1')

    await expect(verifyPassword('cafépass1', stored)).resolves.toBe(true)
  })

  it('rejects a nonsensical iteration count instead of silently weakening', async () => {
    await expect(hashPassword('x', 0)).rejects.toThrow(RangeError)
    await expect(hashPassword('x', -1)).rejects.toThrow(RangeError)
    await expect(hashPassword('x', 1.5)).rejects.toThrow(RangeError)
  })
})

describe('verifyPassword', () => {
  it('returns false rather than throwing on a corrupt stored row', async () => {
    await expect(
      verifyPassword('anything', { passwordHash: 'zz', passwordSalt: 'zz', iterations: 1_000 }),
    ).resolves.toBe(false)
    await expect(
      verifyPassword('anything', { passwordHash: 'abc', passwordSalt: 'ab', iterations: 1_000 }),
    ).resolves.toBe(false)
    await expect(
      verifyPassword('anything', { passwordHash: '', passwordSalt: '', iterations: 0 }),
    ).resolves.toBe(false)
  })

  it('fails a hash of the right password under a different salt', async () => {
    const a = await hashPassword('shared password', 1_000)
    const b = await hashPassword('shared password', 1_000)

    await expect(
      verifyPassword('shared password', { ...a, passwordSalt: b.passwordSalt }),
    ).resolves.toBe(false)
  })
})

describe('timingSafeEqual', () => {
  it('is true only for identical byte arrays', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    // Differs in the first byte only — must not be distinguishable by early exit.
    expect(timingSafeEqual(new Uint8Array([9, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(false)
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
    expect(timingSafeEqual(new Uint8Array(), new Uint8Array())).toBe(true)
  })
})
