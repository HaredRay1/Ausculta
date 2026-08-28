/**
 * Registration validation.
 *
 * Two principles shape what is checked here.
 *
 * Errors are returned as CODES, never as sentences. The app is bilingual and
 * the same rule holds for error text as for clinical values: the data layer
 * says what is wrong, the UI says it in the user's language.
 *
 * Only what is genuinely required is required. Every extra mandatory field on
 * a form used by a health worker with a queue of patients is a field that gets
 * filled with junk to get past it, and junk in a required field is worse than
 * an honest blank in an optional one.
 */

import {
  FAMILY_HISTORY_CODES,
  RESPIRATORY_HISTORY_CODES,
  SEX_CODES,
  type FamilyHistoryCode,
  type RespiratoryHistoryCode,
  type SexCode,
} from '../../db/codes'
import type { HistoryEntry, PatientDemographics } from '../../db/types'

export const MAX_NAME_LENGTH = 120
export const MAX_ADDRESS_LENGTH = 240
export const MAX_CONTACT_LENGTH = 40
export const MAX_HISTORY_NOTES_LENGTH = 500

/** Above this, a birth date is a typo rather than a very old patient. */
export const MAX_PLAUSIBLE_AGE_YEARS = 130

export const PATIENT_ERRORS = {
  NAME_REQUIRED: 'NAME_REQUIRED',
  NAME_TOO_LONG: 'NAME_TOO_LONG',
  BIRTH_DATE_REQUIRED: 'BIRTH_DATE_REQUIRED',
  BIRTH_DATE_MALFORMED: 'BIRTH_DATE_MALFORMED',
  BIRTH_DATE_NOT_A_REAL_DATE: 'BIRTH_DATE_NOT_A_REAL_DATE',
  BIRTH_DATE_IN_FUTURE: 'BIRTH_DATE_IN_FUTURE',
  BIRTH_DATE_TOO_LONG_AGO: 'BIRTH_DATE_TOO_LONG_AGO',
  SEX_REQUIRED: 'SEX_REQUIRED',
  SEX_UNKNOWN_CODE: 'SEX_UNKNOWN_CODE',
  ADDRESS_TOO_LONG: 'ADDRESS_TOO_LONG',
  CONTACT_TOO_LONG: 'CONTACT_TOO_LONG',
  HISTORY_UNKNOWN_CODE: 'HISTORY_UNKNOWN_CODE',
  HISTORY_DUPLICATE_CODE: 'HISTORY_DUPLICATE_CODE',
  HISTORY_NOTES_TOO_LONG: 'HISTORY_NOTES_TOO_LONG',
} as const

export type PatientErrorCode = (typeof PATIENT_ERRORS)[keyof typeof PATIENT_ERRORS]

export type Validated<TValue, TErrors> =
  | { ok: true; value: TValue }
  | { ok: false; errors: TErrors }

export type DemographicsField = keyof PatientDemographics
export type DemographicsErrors = Partial<Record<DemographicsField, PatientErrorCode>>

/** Raw form values, all optional and all strings — this is what an input gives you. */
export interface DemographicsInput {
  name?: string
  birthDate?: string
  sex?: string
  address?: string
  contact?: string
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const SEX_VALUES: readonly string[] = Object.values(SEX_CODES)
const RESPIRATORY_VALUES: readonly string[] = Object.values(RESPIRATORY_HISTORY_CODES)
const FAMILY_VALUES: readonly string[] = Object.values(FAMILY_HISTORY_CODES)

export interface ParsedDate {
  year: number
  month: number
  day: number
  utcMs: number
}

/**
 * Parses `YYYY-MM-DD` strictly, returning null for a date that does not exist.
 *
 * The round-trip check is the point. `new Date('2025-02-30')` and
 * `Date.UTC(2025, 1, 30)` both silently roll over into March and report
 * success, so a naive parse accepts a birth date the patient cannot have.
 */
export function parseIsoDate(value: string): ParsedDate | null {
  const match = ISO_DATE.exec(value)
  if (match === null) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  const utcMs = Date.UTC(year, month - 1, day)
  const roundTrip = new Date(utcMs)
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day, utcMs }
}

/**
 * Completed years between `birthDate` and `now`, or null if the date is unusable.
 *
 * Null rather than NaN: NaN propagates silently through comparisons and would
 * put a nonsense age on a clinical screen.
 */
export function ageInYears(birthDate: string, now: Date = new Date()): number | null {
  const parsed = parseIsoDate(birthDate)
  if (parsed === null) return null

  let age = now.getUTCFullYear() - parsed.year
  const monthDelta = now.getUTCMonth() + 1 - parsed.month
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < parsed.day)) {
    age -= 1
  }
  return age
}

function isSexCode(value: string): value is SexCode {
  return SEX_VALUES.includes(value)
}

function validateBirthDate(raw: string, now: Date): PatientErrorCode | undefined {
  if (raw === '') return PATIENT_ERRORS.BIRTH_DATE_REQUIRED
  if (ISO_DATE.exec(raw) === null) return PATIENT_ERRORS.BIRTH_DATE_MALFORMED

  const parsed = parseIsoDate(raw)
  if (parsed === null) return PATIENT_ERRORS.BIRTH_DATE_NOT_A_REAL_DATE

  // Compare date to date, not instant to instant, so a birth recorded earlier
  // today is not "in the future" because of the clock time.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (parsed.utcMs > today) return PATIENT_ERRORS.BIRTH_DATE_IN_FUTURE

  const age = ageInYears(raw, now)
  if (age !== null && age > MAX_PLAUSIBLE_AGE_YEARS) {
    return PATIENT_ERRORS.BIRTH_DATE_TOO_LONG_AGO
  }
  return undefined
}

/**
 * Validates demographics, reporting every bad field at once.
 *
 * All-at-once matters on a phone: revealing problems one at a time means one
 * scroll, one fix and one resubmit each, and users abandon the form.
 */
export function validateDemographics(
  input: DemographicsInput,
  now: Date = new Date(),
): Validated<PatientDemographics, DemographicsErrors> {
  const errors: DemographicsErrors = {}

  const name = (input.name ?? '').trim()
  if (name === '') errors.name = PATIENT_ERRORS.NAME_REQUIRED
  else if (name.length > MAX_NAME_LENGTH) errors.name = PATIENT_ERRORS.NAME_TOO_LONG

  const birthDate = (input.birthDate ?? '').trim()
  const birthDateError = validateBirthDate(birthDate, now)
  if (birthDateError !== undefined) errors.birthDate = birthDateError

  const sex = (input.sex ?? '').trim()
  if (sex === '') errors.sex = PATIENT_ERRORS.SEX_REQUIRED
  else if (!isSexCode(sex)) errors.sex = PATIENT_ERRORS.SEX_UNKNOWN_CODE

  // No format check on contact. A rural patient's contact may be a neighbour's
  // mobile, a landline, or an instruction to ask at the barangay health
  // station; a phone-number regex would reject the only way to reach them.
  const address = (input.address ?? '').trim()
  if (address.length > MAX_ADDRESS_LENGTH) errors.address = PATIENT_ERRORS.ADDRESS_TOO_LONG

  const contact = (input.contact ?? '').trim()
  if (contact.length > MAX_CONTACT_LENGTH) errors.contact = PATIENT_ERRORS.CONTACT_TOO_LONG

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      name,
      birthDate,
      sex: sex as SexCode,
      // Omitted rather than stored empty: `undefined` reads as "not recorded",
      // an empty string reads as "recorded as nothing".
      ...(address !== '' && { address }),
      ...(contact !== '' && { contact }),
    },
  }
}

/** Index in the submitted array -> what is wrong with that entry. */
export type HistoryErrors = Record<number, PatientErrorCode>

function validateHistory<TCode extends string>(
  entries: readonly HistoryEntry<TCode>[],
  allowed: readonly string[],
): Validated<HistoryEntry<TCode>[], HistoryErrors> {
  const errors: HistoryErrors = {}
  const seen = new Set<string>()
  const value: HistoryEntry<TCode>[] = []

  entries.forEach((entry, index) => {
    if (!allowed.includes(entry.code)) {
      errors[index] = PATIENT_ERRORS.HISTORY_UNKNOWN_CODE
      return
    }
    if (seen.has(entry.code)) {
      errors[index] = PATIENT_ERRORS.HISTORY_DUPLICATE_CODE
      return
    }
    seen.add(entry.code)

    const notes = entry.notes?.trim() ?? ''
    if (notes.length > MAX_HISTORY_NOTES_LENGTH) {
      errors[index] = PATIENT_ERRORS.HISTORY_NOTES_TOO_LONG
      return
    }

    value.push({
      code: entry.code,
      present: entry.present,
      ...(notes !== '' && { notes }),
    })
  })

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value }
}

/**
 * Validates standing respiratory history.
 *
 * An empty array is valid and means nothing was asked. This function never
 * requires the array to be exhaustive, because an absent entry ("not asked")
 * carries different clinical meaning from `present: false` ("asked, answered
 * no") — see the HistoryEntry contract in db/types.ts.
 */
export function validateRespiratoryHistory(
  entries: readonly HistoryEntry<RespiratoryHistoryCode>[],
): Validated<HistoryEntry<RespiratoryHistoryCode>[], HistoryErrors> {
  return validateHistory(entries, RESPIRATORY_VALUES)
}

/** As above, for family/household history. The two vocabularies never mix. */
export function validateFamilyHistory(
  entries: readonly HistoryEntry<FamilyHistoryCode>[],
): Validated<HistoryEntry<FamilyHistoryCode>[], HistoryErrors> {
  return validateHistory(entries, FAMILY_VALUES)
}
