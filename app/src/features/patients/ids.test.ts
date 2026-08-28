import { describe, expect, it } from 'vitest'
import {
  ID_ALPHABET,
  PATIENT_ID_PATTERN,
  STUDY_ID_PATTERN,
  formatPatientIdForDisplay,
  generatePatientId,
  generateStudyId,
  isPatientId,
  isStudyId,
  normalisePatientId,
} from './ids'

describe('clinic-facing patient id', () => {
  it('matches the documented shape', () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePatientId()).toMatch(PATIENT_ID_PATTERN)
    }
  })

  it('omits characters that are misread when quoted aloud or written by hand', () => {
    // Crockford base32: no I, L, O or U. Health workers read these IDs to each
    // other and copy them onto paper forms, where 0/O and 1/I/L are the classic
    // transcription errors.
    expect(ID_ALPHABET).not.toMatch(/[ILOU]/)
    for (const forbidden of ['I', 'L', 'O', 'U']) {
      expect(ID_ALPHABET.includes(forbidden)).toBe(false)
    }
  })

  it('is unique across a clinic-sized population', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5000; i++) seen.add(generatePatientId())
    expect(seen.size).toBe(5000)
  })

  it('accepts its own output', () => {
    expect(isPatientId(generatePatientId())).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isPatientId('')).toBe(false)
    expect(isPatientId('PT-')).toBe(false)
    expect(isPatientId('ST-4K7M-92XQ')).toBe(false) // a study id is not a patient id
    expect(isPatientId('PT-4K7M-92X')).toBe(false) // too short
    expect(isPatientId('PT-4K7I-92XQ')).toBe(false) // I is not in the alphabet
    expect(isPatientId('PT-4k7m-92xq')).toBe(false) // lower case is not canonical
  })

  it('normalises what a human is likely to type back in', () => {
    const id = generatePatientId()
    expect(normalisePatientId(id.toLowerCase())).toBe(id)
    expect(normalisePatientId(` ${id} `)).toBe(id)
    expect(normalisePatientId(id.replace(/-/g, ''))).toBe(id)
  })

  it('displays in grouped form so it can be read aloud', () => {
    expect(formatPatientIdForDisplay('PT-4K7M-92XQ')).toBe('PT-4K7M-92XQ')
    expect(formatPatientIdForDisplay('PT4K7M92XQ')).toBe('PT-4K7M-92XQ')
  })

  it('recovers the classic handwriting confusions', () => {
    // I, L and O are never generated, so a typed one can only ever be a
    // mistyped 1, 1 and 0. Mapping them back is unambiguous, and it is the
    // difference between finding a patient and re-registering them by mistake.
    expect(normalisePatientId('PT-4K7I-92XQ')).toBe('PT-4K71-92XQ')
    expect(normalisePatientId('PT-4K7L-92XQ')).toBe('PT-4K71-92XQ')
    expect(normalisePatientId('PT-4K7O-92XQ')).toBe('PT-4K70-92XQ')
  })

  it('returns empty for something that is not a patient id at all', () => {
    expect(normalisePatientId('')).toBe('')
    expect(normalisePatientId('hello')).toBe('')
    expect(normalisePatientId('ST-4K7M92XQ4K7M92XQ')).toBe('')
    expect(normalisePatientId('PT-4K7M-92X')).toBe('')
  })
})

describe('de-identified study id', () => {
  it('matches the documented shape', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateStudyId()).toMatch(STUDY_ID_PATTERN)
    }
  })

  it('is unique across a research-sized population', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5000; i++) seen.add(generateStudyId())
    expect(seen.size).toBe(5000)
  })

  it('accepts its own output and rejects a patient id', () => {
    expect(isStudyId(generateStudyId())).toBe(true)
    expect(isStudyId(generatePatientId())).toBe(false)
  })

  // ---------------------------------------------------------------------
  // The de-identification property. Research data leaves the clinic; if the
  // study id carried anything derived from the patient, that export would be
  // re-identifiable and the ethics position collapses.
  // ---------------------------------------------------------------------

  it('takes no arguments, so it cannot derive anything from the patient', () => {
    // The structural guarantee, asserted so a future refactor that starts
    // passing demographics in fails here rather than silently shipping.
    expect(generateStudyId.length).toBe(0)
  })

  it('gives two identical patients different study ids', () => {
    // If the id were any kind of hash of the record, these would collide.
    const identical = Array.from({ length: 200 }, () => generateStudyId())
    expect(new Set(identical).size).toBe(200)
  })

  it('contains nothing drawn from name, birth date or contact details', () => {
    const patient = {
      name: 'Maria Dela Cruz',
      birthDate: '1978-03-14',
      contact: '09171234567',
      address: 'Barangay Bancao-Bancao, Puerto Princesa',
    }

    // Every token a naive implementation might splice in: name parts, initials,
    // and every run of digits from the date and phone number.
    const forbidden = [
      ...patient.name.toUpperCase().split(/\s+/),
      'MDC',
      'MARIA',
      'CRUZ',
      '1978',
      '0314',
      '19780314',
      '78',
      '0917',
      '1234567',
      '09171234567',
      'BANCAO',
    ]

    for (let i = 0; i < 500; i++) {
      const studyId = generateStudyId()
      const body = studyId.replace(/^ST-/, '')
      for (const token of forbidden) {
        // 2-char tokens would collide with random output by chance; only test
        // tokens long enough for a match to mean something.
        if (token.length >= 4) expect(body).not.toContain(token)
      }
    }
  })

  it('cannot be linked back to the clinic id', () => {
    // Issuing both from one seed would let anyone holding the research export
    // recover the clinic id, which is exactly what the split is meant to prevent.
    for (let i = 0; i < 500; i++) {
      const patientId = generatePatientId()
      const studyId = generateStudyId()
      const patientBody = patientId.replace(/^PT-/, '').replace(/-/g, '')
      const studyBody = studyId.replace(/^ST-/, '')
      expect(studyBody).not.toContain(patientBody)
      expect(patientBody).not.toContain(studyBody)
      expect(studyId).not.toBe(patientId)
    }
  })

  it('carries enough entropy that guessing one is not worth trying', () => {
    // 16 characters of a 32-symbol alphabet = 80 bits.
    const body = generateStudyId().replace(/^ST-/, '')
    expect(body).toHaveLength(16)
    expect(Math.log2(ID_ALPHABET.length) * body.length).toBeGreaterThanOrEqual(80)
  })

  it('draws on the whole alphabet rather than a lazy subset', () => {
    // Catches an implementation that only ever emits hex digits, which would
    // quietly cut the entropy by a third.
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      for (const ch of generateStudyId().replace(/^ST-/, '')) seen.add(ch)
    }
    expect(seen.size).toBe(ID_ALPHABET.length)
  })
})
