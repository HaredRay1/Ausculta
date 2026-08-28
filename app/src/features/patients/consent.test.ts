import { describe, expect, it } from 'vitest'
import { CONSENT_STATUSES } from '../../db/codes'
import {
  CONSENT_DOCUMENTS,
  CONSENT_ERRORS,
  DRAFT_EN_CONSENT_VERSION,
  buildPatientConsent,
  consentDocumentVersions,
  getConsentDocument,
  isConsentDocumentApproved,
  latestConsentDocumentFor,
  outstandingEthicsReviewItems,
} from './consent'

const NOW = new Date('2026-08-29T09:30:00.000Z')

describe('consent document registry', () => {
  it('holds exactly one document, and it is the English draft', () => {
    expect(consentDocumentVersions()).toEqual([DRAFT_EN_CONSENT_VERSION])
  })

  it('has NO Filipino document', () => {
    // The project spec forbids machine- or LLM-translated consent text. A
    // Filipino version must be produced by a qualified human translator and
    // back-translated before it appears here. This assertion is the tripwire:
    // if someone adds one without going through that process, this fails.
    expect(latestConsentDocumentFor('fil')).toBeUndefined()
    expect(latestConsentDocumentFor('tl')).toBeUndefined()
    for (const version of consentDocumentVersions()) {
      expect(getConsentDocument(version)?.language).toBe('en')
    }
  })

  it('is marked DRAFT, not approved', () => {
    const doc = getConsentDocument(DRAFT_EN_CONSENT_VERSION)
    expect(doc).toBeDefined()
    expect(doc?.approvalStatus).toBe('DRAFT')
    expect(isConsentDocumentApproved(DRAFT_EN_CONSENT_VERSION)).toBe(false)
  })

  it('names no approver, because nobody has approved it', () => {
    const doc = getConsentDocument(DRAFT_EN_CONSENT_VERSION)
    expect(doc?.approvedBy).toBeUndefined()
    expect(doc?.approvedAt).toBeUndefined()
  })

  it('declares the English text as original, not translated', () => {
    expect(getConsentDocument(DRAFT_EN_CONSENT_VERSION)?.translationProvenance).toBe('ORIGINAL')
  })

  it('lists the questions a reviewer still has to answer', () => {
    const outstanding = outstandingEthicsReviewItems(DRAFT_EN_CONSENT_VERSION)
    expect(outstanding.length).toBeGreaterThan(0)
    // Each is a real unresolved question, not a placeholder string.
    for (const item of outstanding) {
      expect(item.trim().length).toBeGreaterThan(20)
    }
  })

  it('has non-empty headings and bodies throughout', () => {
    const doc = getConsentDocument(DRAFT_EN_CONSENT_VERSION)
    expect(doc?.sections.length).toBeGreaterThan(5)
    for (const section of doc?.sections ?? []) {
      expect(section.heading.trim()).not.toBe('')
      expect(section.body.trim().length).toBeGreaterThan(30)
    }
  })

  it('states plainly that the app does not diagnose', () => {
    // This is the single claim the whole regulatory position rests on. If a
    // future edit softens or drops it, this test is the alarm.
    const doc = getConsentDocument(DRAFT_EN_CONSENT_VERSION)
    const text = (doc?.sections ?? []).map((s) => s.body).join(' ').toLowerCase()
    expect(text).toContain('not a diagnosis')
    expect(text).toContain('does not replace')
  })

  it('tells the participant they can decline and withdraw without losing care', () => {
    const doc = getConsentDocument(DRAFT_EN_CONSENT_VERSION)
    const text = (doc?.sections ?? []).map((s) => s.body).join(' ').toLowerCase()
    expect(text).toContain('withdraw')
    expect(text).toContain('will not affect')
  })
})

describe('buildPatientConsent', () => {
  const base = {
    status: CONSENT_STATUSES.GRANTED,
    documentVersion: DRAFT_EN_CONSENT_VERSION,
    recordedBy: 'user-1',
  }

  it('records status, version, language, time and recorder', () => {
    const result = buildPatientConsent(base, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      status: CONSENT_STATUSES.GRANTED,
      language: 'en',
      textVersion: DRAFT_EN_CONSENT_VERSION,
      presentedAt: NOW.toISOString(),
      recordedBy: 'user-1',
    })
  })

  it('derives the language from the document rather than taking it as input', () => {
    // Structural, not incidental: because the caller cannot pass a language,
    // `consent.language` can never disagree with the document actually shown.
    // That mismatch is precisely how a patient ends up recorded as having
    // consented in a language they were never shown.
    expect(buildPatientConsent.length).toBeLessThanOrEqual(2)
    const result = buildPatientConsent(base, NOW)
    if (!result.ok) return
    expect(result.value.language).toBe(getConsentDocument(DRAFT_EN_CONSENT_VERSION)?.language)
  })

  it('records a refusal just as carefully as an agreement', () => {
    const result = buildPatientConsent({ ...base, status: CONSENT_STATUSES.DECLINED }, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe(CONSENT_STATUSES.DECLINED)
    expect(result.value.textVersion).toBe(DRAFT_EN_CONSENT_VERSION)
  })

  it('records a withdrawal', () => {
    const result = buildPatientConsent({ ...base, status: CONSENT_STATUSES.WITHDRAWN }, NOW)
    expect(result.ok).toBe(true)
  })

  it('refuses a document version that is not in the registry', () => {
    // Blocks the failure this whole module exists to prevent: consent recorded
    // against text nobody can produce afterwards.
    const result = buildPatientConsent({ ...base, documentVersion: 'en-2099-invented' }, NOW)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(CONSENT_ERRORS.DOCUMENT_UNKNOWN)
  })

  it('refuses an empty document version', () => {
    const result = buildPatientConsent({ ...base, documentVersion: '' }, NOW)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(CONSENT_ERRORS.DOCUMENT_UNKNOWN)
  })

  it('refuses a status outside the registry', () => {
    const result = buildPatientConsent({ ...base, status: 'PROBABLY' as never }, NOW)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(CONSENT_ERRORS.STATUS_INVALID)
  })

  it('refuses to record consent with no named recorder', () => {
    // Consent with no accountable person attached is not consent.
    for (const recordedBy of ['', '   ']) {
      const result = buildPatientConsent({ ...base, recordedBy }, NOW)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe(CONSENT_ERRORS.RECORDER_REQUIRED)
    }
  })

  it('stores presentedAt as an ISO-8601 UTC instant', () => {
    const result = buildPatientConsent(base, NOW)
    if (!result.ok) return
    expect(result.value.presentedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(new Date(result.value.presentedAt).toISOString()).toBe(result.value.presentedAt)
  })

  it('keeps every registry document usable, so none is orphaned', () => {
    for (const version of consentDocumentVersions()) {
      const result = buildPatientConsent({ ...base, documentVersion: version }, NOW)
      expect(result.ok).toBe(true)
    }
  })
})

describe('CONSENT_DOCUMENTS integrity', () => {
  it('keys every document by its own version, so lookups cannot drift', () => {
    for (const [key, doc] of Object.entries(CONSENT_DOCUMENTS)) {
      expect(doc.version).toBe(key)
    }
  })
})
