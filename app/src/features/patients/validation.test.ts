import { describe, expect, it } from 'vitest'
import {
  FAMILY_HISTORY_CODES,
  RESPIRATORY_HISTORY_CODES,
  SEX_CODES,
} from '../../db/codes'
import {
  MAX_ADDRESS_LENGTH,
  MAX_CONTACT_LENGTH,
  MAX_HISTORY_NOTES_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PLAUSIBLE_AGE_YEARS,
  PATIENT_ERRORS,
  ageInYears,
  validateDemographics,
  validateFamilyHistory,
  validateRespiratoryHistory,
} from './validation'

const NOW = new Date('2026-08-29T00:00:00.000Z')

const validInput = {
  name: 'Maria Dela Cruz',
  birthDate: '1978-03-14',
  sex: SEX_CODES.FEMALE,
  address: 'Barangay Bancao-Bancao, Puerto Princesa',
  contact: '09171234567',
}

function errorsFor(patch: Record<string, unknown>) {
  const result = validateDemographics({ ...validInput, ...patch }, NOW)
  if (result.ok) return {}
  return result.errors
}

describe('validateDemographics', () => {
  it('accepts a complete record and returns trimmed values', () => {
    const result = validateDemographics(
      { ...validInput, name: '  Maria Dela Cruz  ' },
      NOW,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('Maria Dela Cruz')
    expect(result.value.birthDate).toBe('1978-03-14')
    expect(result.value.sex).toBe(SEX_CODES.FEMALE)
  })

  it('accepts a record with only the genuinely required fields', () => {
    // Address and contact are optional in the Patient contract, and a patient
    // walking into a rural clinic may have neither. Demanding them would just
    // teach staff to type junk.
    const result = validateDemographics(
      { name: 'Juan Santos', birthDate: '1990-01-01', sex: SEX_CODES.MALE },
      NOW,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.address).toBeUndefined()
    expect(result.value.contact).toBeUndefined()
  })

  it('drops blank optional fields rather than storing empty strings', () => {
    const result = validateDemographics({ ...validInput, address: '   ', contact: '' }, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.address).toBeUndefined()
    expect(result.value.contact).toBeUndefined()
  })

  describe('name', () => {
    it('is required', () => {
      expect(errorsFor({ name: '' }).name).toBe(PATIENT_ERRORS.NAME_REQUIRED)
      expect(errorsFor({ name: '   ' }).name).toBe(PATIENT_ERRORS.NAME_REQUIRED)
    })

    it('is capped in length', () => {
      expect(errorsFor({ name: 'x'.repeat(MAX_NAME_LENGTH) }).name).toBeUndefined()
      expect(errorsFor({ name: 'x'.repeat(MAX_NAME_LENGTH + 1) }).name).toBe(
        PATIENT_ERRORS.NAME_TOO_LONG,
      )
    })

    it('accepts the punctuation real Filipino names contain', () => {
      for (const name of ['Ma. Corazon Dela Cruz-Reyes', "Jose O'Brien", 'Ñito Peña']) {
        expect(errorsFor({ name }).name).toBeUndefined()
      }
    })
  })

  describe('birthDate', () => {
    it('is required', () => {
      expect(errorsFor({ birthDate: '' }).birthDate).toBe(PATIENT_ERRORS.BIRTH_DATE_REQUIRED)
    })

    it('must be an ISO calendar date', () => {
      for (const bad of ['14/03/1978', '1978-3-14', '1978-03', 'yesterday', '19780314']) {
        expect(errorsFor({ birthDate: bad }).birthDate).toBe(
          PATIENT_ERRORS.BIRTH_DATE_MALFORMED,
        )
      }
    })

    it('rejects dates that look well-formed but do not exist', () => {
      // The bug a plain `new Date(...)` parse hides: JS rolls 2025-02-30 over
      // into 2025-03-02 and reports success.
      for (const impossible of ['2025-02-30', '2025-13-01', '2025-00-10', '2025-04-31']) {
        expect(errorsFor({ birthDate: impossible }).birthDate).toBe(
          PATIENT_ERRORS.BIRTH_DATE_NOT_A_REAL_DATE,
        )
      }
    })

    it('gets leap years right', () => {
      expect(errorsFor({ birthDate: '2024-02-29' }).birthDate).toBeUndefined()
      expect(errorsFor({ birthDate: '2023-02-29' }).birthDate).toBe(
        PATIENT_ERRORS.BIRTH_DATE_NOT_A_REAL_DATE,
      )
      expect(errorsFor({ birthDate: '2000-02-29' }).birthDate).toBeUndefined() // divisible by 400
      expect(errorsFor({ birthDate: '1900-02-29' }).birthDate).toBe(
        PATIENT_ERRORS.BIRTH_DATE_NOT_A_REAL_DATE, // divisible by 100, not 400
      )
    })

    it('rejects the future', () => {
      expect(errorsFor({ birthDate: '2026-08-30' }).birthDate).toBe(
        PATIENT_ERRORS.BIRTH_DATE_IN_FUTURE,
      )
    })

    it('accepts a birth today, because newborns get auscultated', () => {
      expect(errorsFor({ birthDate: '2026-08-29' }).birthDate).toBeUndefined()
    })

    it('rejects an implausible age', () => {
      expect(errorsFor({ birthDate: '1850-01-01' }).birthDate).toBe(
        PATIENT_ERRORS.BIRTH_DATE_TOO_LONG_AGO,
      )
    })
  })

  describe('sex', () => {
    it('is required', () => {
      expect(errorsFor({ sex: '' }).sex).toBe(PATIENT_ERRORS.SEX_REQUIRED)
    })

    it('must be a code from the registry, never free text', () => {
      expect(errorsFor({ sex: 'Female' }).sex).toBe(PATIENT_ERRORS.SEX_UNKNOWN_CODE)
      expect(errorsFor({ sex: 'babae' }).sex).toBe(PATIENT_ERRORS.SEX_UNKNOWN_CODE)
    })

    it('accepts every registered code, including refusal to answer', () => {
      for (const code of Object.values(SEX_CODES)) {
        expect(errorsFor({ sex: code }).sex).toBeUndefined()
      }
    })
  })

  describe('optional fields', () => {
    it('caps address and contact length', () => {
      expect(errorsFor({ address: 'x'.repeat(MAX_ADDRESS_LENGTH + 1) }).address).toBe(
        PATIENT_ERRORS.ADDRESS_TOO_LONG,
      )
      expect(errorsFor({ contact: 'x'.repeat(MAX_CONTACT_LENGTH + 1) }).contact).toBe(
        PATIENT_ERRORS.CONTACT_TOO_LONG,
      )
    })

    it('does not impose a phone number format', () => {
      // A rural patient's contact may be a neighbour's mobile, a landline, or
      // "ask at the barangay hall". Rejecting those loses the only way to
      // reach them.
      for (const contact of ['09171234567', '+63 917 123 4567', '(048) 433-2100', 'ask at BHS']) {
        expect(errorsFor({ contact }).contact).toBeUndefined()
      }
    })
  })

  it('reports every bad field at once, not just the first', () => {
    const errors = errorsFor({ name: '', birthDate: 'nope', sex: 'x' })
    expect(errors.name).toBe(PATIENT_ERRORS.NAME_REQUIRED)
    expect(errors.birthDate).toBe(PATIENT_ERRORS.BIRTH_DATE_MALFORMED)
    expect(errors.sex).toBe(PATIENT_ERRORS.SEX_UNKNOWN_CODE)
  })
})

describe('ageInYears', () => {
  it('counts completed years', () => {
    expect(ageInYears('1978-03-14', NOW)).toBe(48)
  })

  it('does not round a birthday up before it happens', () => {
    expect(ageInYears('1978-08-30', NOW)).toBe(47) // tomorrow
    expect(ageInYears('1978-08-29', NOW)).toBe(48) // today
  })

  it('is zero for an infant', () => {
    expect(ageInYears('2026-08-01', NOW)).toBe(0)
  })

  it('returns null for an unusable date rather than NaN', () => {
    expect(ageInYears('', NOW)).toBeNull()
    expect(ageInYears('2025-02-30', NOW)).toBeNull()
  })
})

describe('history validation', () => {
  it('accepts an empty array, meaning nothing was asked yet', () => {
    expect(validateRespiratoryHistory([]).ok).toBe(true)
    expect(validateFamilyHistory([]).ok).toBe(true)
  })

  it('accepts answered entries in both directions', () => {
    const result = validateRespiratoryHistory([
      { code: RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, present: true },
      { code: RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT, present: false },
    ])
    expect(result.ok).toBe(true)
  })

  it('rejects a code outside the registry', () => {
    const result = validateRespiratoryHistory([
      { code: 'HAS_A_COUGH_SOMETIMES', present: true } as never,
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toBe(PATIENT_ERRORS.HISTORY_UNKNOWN_CODE)
  })

  it('rejects the same question answered twice', () => {
    const result = validateRespiratoryHistory([
      { code: RESPIRATORY_HISTORY_CODES.ALLERGIES, present: true },
      { code: RESPIRATORY_HISTORY_CODES.ALLERGIES, present: false },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[1]).toBe(PATIENT_ERRORS.HISTORY_DUPLICATE_CODE)
  })

  it('caps note length', () => {
    const result = validateRespiratoryHistory([
      {
        code: RESPIRATORY_HISTORY_CODES.OTHER,
        present: true,
        notes: 'x'.repeat(MAX_HISTORY_NOTES_LENGTH + 1),
      },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toBe(PATIENT_ERRORS.HISTORY_NOTES_TOO_LONG)
  })

  it('keeps the two vocabularies apart', () => {
    // A family code in the respiratory list would sail through a shared check
    // and land wrong in the research export.
    const result = validateRespiratoryHistory([
      { code: FAMILY_HISTORY_CODES.FAMILY_ASTHMA, present: true } as never,
    ])
    expect(result.ok).toBe(false)

    const reverse = validateFamilyHistory([
      { code: RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, present: true } as never,
    ])
    expect(reverse.ok).toBe(false)
  })

  it('accepts every registered code in its own vocabulary', () => {
    for (const code of Object.values(RESPIRATORY_HISTORY_CODES)) {
      expect(validateRespiratoryHistory([{ code, present: true }]).ok).toBe(true)
    }
    for (const code of Object.values(FAMILY_HISTORY_CODES)) {
      expect(validateFamilyHistory([{ code, present: true }]).ok).toBe(true)
    }
  })

  it('does not require the array to be exhaustive', () => {
    // Absent means "not asked", which is deliberately different from
    // present: false. Validation must never push callers toward pre-filling.
    const result = validateRespiratoryHistory([
      { code: RESPIRATORY_HISTORY_CODES.CHRONIC_COUGH, present: true },
    ])
    expect(result.ok).toBe(true)
    expect(MAX_PLAUSIBLE_AGE_YEARS).toBeGreaterThan(100)
  })
})
