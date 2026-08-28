/**
 * Password hashing for Ausculta's fully-offline authentication.
 *
 * Web Crypto API only — no libraries, nothing to bundle, nothing that needs a
 * network. PBKDF2-HMAC-SHA-256 with a per-user 16-byte random salt; the salt,
 * the derived key and the iteration count are all persisted on the user row
 * (see `User` in db/types.ts) so a future increase of PBKDF2_ITERATIONS can
 * still verify — and transparently re-hash — older accounts.
 */

/** OWASP's 2023+ PBKDF2-HMAC-SHA-256 floor. Stored per user, never assumed. */
export const PBKDF2_ITERATIONS = 210_000

/** 128 bits of salt, drawn from `crypto.getRandomValues`. */
export const SALT_BYTES = 16

/** Derived key length. Matches the SHA-256 output — no truncation, no stretch. */
export const DERIVED_BITS = 256

/** The three fields that together let `verifyPassword` reproduce a hash. */
export interface StoredPasswordHash {
  passwordHash: string
  passwordSalt: string
  iterations: number
}

function assertPositiveInteger(iterations: number): void {
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError(`iterations must be a positive integer, received ${iterations}`)
  }
}

/**
 * `Uint8Array` backed by a plain `ArrayBuffer`.
 *
 * Web Crypto's `BufferSource` excludes `SharedArrayBuffer`, so a bare
 * `Uint8Array` (which widens to `ArrayBufferLike`) is not assignable to it.
 * Naming the backing buffer keeps every value in this module directly usable
 * by `crypto.subtle` without casts.
 */
type Bytes = Uint8Array<ArrayBuffer>

function toHex(bytes: Bytes): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

function fromHex(hex: string): Bytes {
  if (hex.length % 2 !== 0) throw new TypeError('hex string must have an even length')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new TypeError('hex string contains a non-hex character')
    bytes[i] = byte
  }
  return bytes
}

/**
 * Encodes a password to the bytes PBKDF2 consumes.
 *
 * NFC-normalised first: the same password typed on two keyboards can produce
 * different UTF-16 for identical-looking accented characters, and a health
 * worker re-typing their password on a different device must not be locked
 * out by that.
 */
function encodePassword(password: string): Bytes {
  return new TextEncoder().encode(password.normalize('NFC')) as Bytes
}

async function deriveBits(
  password: string,
  salt: Bytes,
  iterations: number,
): Promise<Bytes> {
  assertPositiveInteger(iterations)
  const key = await crypto.subtle.importKey('raw', encodePassword(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    DERIVED_BITS,
  )
  return new Uint8Array(bits)
}

/**
 * Compares two byte arrays in time proportional to their length alone.
 *
 * A naive `===` on the hex strings bails at the first differing character,
 * which leaks how much of a guess was correct. This ORs every difference
 * together and only then tests the accumulator. Length is compared up front —
 * that is public information (it is always DERIVED_BITS / 8 here).
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Hashes `password` under a fresh random salt. */
export async function hashPassword(
  password: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<StoredPasswordHash> {
  assertPositiveInteger(iterations)
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const derived = await deriveBits(password, salt, iterations)
  return { passwordHash: toHex(derived), passwordSalt: toHex(salt), iterations }
}

/**
 * Re-derives `password` under a stored salt/iteration count and compares
 * without leaking timing. A malformed stored hash is a failed verification,
 * not an exception — a corrupt row must not become a crash on the login screen.
 */
export async function verifyPassword(
  password: string,
  stored: StoredPasswordHash,
): Promise<boolean> {
  try {
    const salt = fromHex(stored.passwordSalt)
    const expected = fromHex(stored.passwordHash)
    const derived = await deriveBits(password, salt, stored.iterations)
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/**
 * Burns roughly one `verifyPassword`'s worth of work against a throwaway salt.
 *
 * Called on the "no such user" login path so that a wrong username and a wrong
 * password cost the same wall-clock time, denying an attacker a cheap oracle
 * for which usernames exist on a shared clinic device.
 */
export async function simulateVerifyDelay(
  iterations: number = PBKDF2_ITERATIONS,
): Promise<boolean> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  await deriveBits('', salt, iterations)
  return false
}
