/**
 * Patient identifiers.
 *
 * Every patient carries two, and keeping them apart is the whole point:
 *
 * - `id` is the clinic-facing identifier. Health workers read it aloud, write
 *   it on paper forms and type it back into search, so it is short and uses an
 *   alphabet chosen to survive that. It is also the Dexie primary key.
 * - `studyId` is the de-identified identifier that travels with research
 *   exports. It is drawn from the CSPRNG and from nothing else — not from the
 *   patient's details, and not from `id` — so an export cannot be walked back
 *   to a person or joined against clinic records.
 *
 * Both are generated on this device while offline, so neither can be a
 * sequence number: two phones registering patients the same afternoon would
 * hand out the same one. Randomness is what makes them safe to merge later.
 */

/**
 * Crockford base32: the digits and uppercase letters, minus I, L, O and U.
 *
 * I/L/1 and O/0 are the errors people actually make reading an ID off a screen
 * onto a form; excluding them means those characters can only ever be a
 * mistake, which is what lets `normalisePatientId` correct them safely. U is
 * dropped by Crockford's convention to avoid accidental obscenities.
 */
export const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Character class form of ID_ALPHABET, for the validation patterns. */
const CHARS = '[0-9ABCDEFGHJKMNPQRSTVWXYZ]'

export const PATIENT_ID_PREFIX = 'PT'
export const STUDY_ID_PREFIX = 'ST'

/** 8 symbols = 40 bits. Ample for a clinic; short enough to say out loud. */
export const PATIENT_ID_BODY_LENGTH = 8

/**
 * 16 symbols = 80 bits. Larger than the clinic id because a study id must stay
 * unguessable across every site pooled into one dataset, and because a
 * collision there silently merges two people's data.
 */
export const STUDY_ID_BODY_LENGTH = 16

export const PATIENT_ID_PATTERN = new RegExp(`^${PATIENT_ID_PREFIX}-${CHARS}{4}-${CHARS}{4}$`)
export const STUDY_ID_PATTERN = new RegExp(`^${STUDY_ID_PREFIX}-${CHARS}{${STUDY_ID_BODY_LENGTH}}$`)

/**
 * `length` symbols drawn uniformly from ID_ALPHABET via `crypto.getRandomValues`.
 *
 * The modulo is unbiased because 256 is an exact multiple of the 32-symbol
 * alphabet, so no rejection sampling is needed. That stops being true if the
 * alphabet ever changes size — hence the assertion below.
 */
function randomBody(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length]
  }
  return out
}

if (256 % ID_ALPHABET.length !== 0) {
  throw new Error('ID_ALPHABET must divide 256 evenly, or randomBody becomes biased')
}

/** A fresh clinic-facing id, e.g. `PT-4K7M-92XQ`. */
export function generatePatientId(): string {
  const body = randomBody(PATIENT_ID_BODY_LENGTH)
  return `${PATIENT_ID_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`
}

/**
 * A fresh de-identified study id, e.g. `ST-4K7M92XQ4K7M92XQ`.
 *
 * Takes no arguments, and must keep taking no arguments. That is not a
 * convenience — it is the de-identification guarantee expressed in the type
 * system: a function with no inputs cannot encode the patient into its output.
 * `ids.test.ts` asserts the arity so this cannot be eroded by a later change.
 */
export function generateStudyId(): string {
  return `${STUDY_ID_PREFIX}-${randomBody(STUDY_ID_BODY_LENGTH)}`
}

export function isPatientId(value: string): boolean {
  return PATIENT_ID_PATTERN.test(value)
}

export function isStudyId(value: string): boolean {
  return STUDY_ID_PATTERN.test(value)
}

/**
 * Canonicalises what someone typed into a patient id, or `''` if it is not one.
 *
 * Tolerates lower case, surrounding space, missing or extra dashes, and the
 * I/L -> 1 and O -> 0 confusions. Returning `''` rather than throwing lets a
 * search box treat "not an id" and "no such patient" the same way.
 */
export function normalisePatientId(input: string): string {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')

  const compact = new RegExp(`^${PATIENT_ID_PREFIX}${CHARS}{${PATIENT_ID_BODY_LENGTH}}$`)
  if (!compact.test(cleaned)) return ''

  const body = cleaned.slice(PATIENT_ID_PREFIX.length)
  return `${PATIENT_ID_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`
}

/**
 * Grouped form for display. Falls back to the input unchanged so a record that
 * predates this format still renders something rather than an empty cell.
 */
export function formatPatientIdForDisplay(id: string): string {
  return normalisePatientId(id) || id
}
