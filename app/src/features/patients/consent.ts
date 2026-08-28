/**
 * Informed consent: the versioned document registry and the record of what a
 * given patient was actually shown.
 *
 * The thing this module exists to prevent is a consent record that cannot be
 * reconstructed. "The patient consented" is worthless on its own; what an
 * ethics reviewer needs, possibly years later, is *which text* the patient was
 * shown, *in which language*, *when*, and *who* recorded it. So consent is
 * never stored as a bare boolean — it is stored as a pointer to an immutable,
 * versioned document plus the circumstances of its presentation.
 *
 * Two rules are enforced structurally rather than by convention:
 *
 * 1. `buildPatientConsent` does not accept a language. It reads the language
 *    off the document, so `consent.language` cannot disagree with the text
 *    that was on screen.
 * 2. `TranslationProvenance` has no value meaning "machine translated". The
 *    project spec forbids machine- or LLM-translated consent text, so there is
 *    deliberately no way to declare one. A translation must be produced by a
 *    qualified human translator and back-translated before it can be added.
 *
 * Documents are append-only. Correcting the text means adding a new version,
 * never editing an existing one — patients consented to the old wording and
 * that record has to stay true.
 */

import { CONSENT_STATUSES, type ConsentStatus } from '../../db/codes'
import type { PatientConsent } from '../../db/types'

export type ConsentApprovalStatus = 'DRAFT' | 'APPROVED'

/**
 * How this text came to exist. There is no machine-translation value, and one
 * must not be added: a consent form a patient cannot be shown to have
 * understood is not consent.
 */
export type TranslationProvenance = 'ORIGINAL' | 'HUMAN_TRANSLATED_AND_BACK_TRANSLATED'

export interface ConsentSection {
  heading: string
  body: string
}

export interface ConsentDocument {
  /** Immutable identifier stored on every consent record. */
  version: string
  /** BCP-47 tag of the language this text is written in. */
  language: string
  approvalStatus: ConsentApprovalStatus
  translationProvenance: TranslationProvenance
  title: string
  sections: ConsentSection[]
  /**
   * Questions a practitioner or ethics reviewer must answer before this
   * document can be marked APPROVED. Non-empty means not ready for real use.
   */
  outstandingReviewItems: string[]
  approvedBy?: string
  approvedAt?: string
}

/**
 * The current English draft.
 *
 * The word DRAFT is inside the version string on purpose. It is copied verbatim
 * into every `PatientConsent.textVersion`, so any consent captured against
 * unapproved text is self-identifying in the research export and can be
 * filtered out later without guesswork.
 */
export const DRAFT_EN_CONSENT_VERSION = 'en-DRAFT-2026-08-29'

const DRAFT_EN_CONSENT: ConsentDocument = {
  version: DRAFT_EN_CONSENT_VERSION,
  language: 'en',
  approvalStatus: 'DRAFT',
  translationProvenance: 'ORIGINAL',
  title: 'Taking part in the Ausculta lung sound study',
  sections: [
    {
      heading: 'What this is',
      body:
        'Ausculta is a research project. It uses a small electronic stethoscope to ' +
        'record the sound of your breathing, and a computer program that looks for ' +
        'patterns in that sound. We are studying whether this can help health ' +
        'workers notice breathing problems earlier. You are being invited to take ' +
        'part. Please take as much time as you need to decide.',
    },
    {
      heading: 'What will happen',
      body:
        'A health worker will place the stethoscope on your chest and back, in a ' +
        'few positions, and record your breathing for a short time. They will also ' +
        'ask you some questions about your breathing, your health, and your ' +
        "family's health. Nothing is injected, and nothing enters your body. The " +
        'whole visit usually takes less than fifteen minutes.',
    },
    {
      heading: 'This is not a diagnosis',
      body:
        'The result the program gives is not a diagnosis. It is a suggestion for a ' +
        'doctor, nurse or midwife to look at. It can be wrong in both directions: ' +
        'it may point to a problem that is not there, and it may miss one that is. ' +
        'It does not replace being examined by a health professional. If you feel ' +
        'unwell, seek care as you normally would, whatever this program says.',
    },
    {
      heading: 'What we record about you',
      body:
        'We record the sound of your breathing, your name, your date of birth, ' +
        'your sex, and if you give them, your address and a contact number. We ' +
        'also record your answers about your breathing history and your family ' +
        "or household's breathing history.",
    },
    {
      heading: 'Where your information is kept',
      body:
        'Your information is kept on the clinic phone or tablet itself. It is not ' +
        'sent over the internet by this app. The device is used by clinic staff ' +
        'and is meant to be kept in the clinic.',
    },
    {
      heading: 'Who can see it',
      body:
        'The health worker who registers you, and the doctor, nurse or midwife ' +
        'responsible for reviewing your recordings, can see your information with ' +
        'your name attached. Clinic administrators can manage accounts on the ' +
        'device.',
    },
    {
      heading: 'How your information is used for research',
      body:
        'For research, your records are used without your name, date of birth, ' +
        'address or contact number. Each participant is given a separate study ' +
        'number that is not built from any of your personal details, so the ' +
        'research data cannot be traced back to you by the researchers.',
    },
    {
      heading: 'Taking part is your choice',
      body:
        'You do not have to take part. You may say no, and you may change your ' +
        'mind and withdraw at any time, without giving a reason. Your decision ' +
        'will not affect the care you receive at this clinic now or in the ' +
        'future, and it will not affect how you are treated by the staff here.',
    },
    {
      heading: 'Risks and benefits',
      body:
        'There is no physical risk from the recording itself. The main risk is to ' +
        'your privacy, if the device were lost or seen by someone who should not ' +
        'see it. You may not benefit personally from taking part. The study may ' +
        'help health workers in rural clinics notice breathing problems earlier.',
    },
    {
      heading: 'Questions',
      body:
        'You can ask the health worker any question before you decide, and at any ' +
        'time afterwards. If you want to withdraw, or want your information ' +
        'removed, tell any member of the clinic staff.',
    },
  ],
  outstandingReviewItems: [
    'Whether anyone under 18 may be enrolled. This document is written for an adult participant and does NOT cover parental or guardian consent, nor child assent. Bronchiolitis is largely a paediatric condition, so a paediatric pathway is very likely needed before any fieldwork.',
    'The named principal investigator, the sponsoring institution, and the ethics committee that reviewed this study, together with the approval reference number. All three are currently absent from the text.',
    'A named contact person and a way to reach them, for questions, complaints or withdrawal requests, independent of the health worker taking the consent.',
    'How long the data is kept, what happens to it when the study ends, and whether de-identified recordings may be reused in future studies or shared outside the immediate research team.',
    'Whether identifiable data ever leaves the clinic device, who the data controller is, and what happens if the device is lost or stolen.',
    'Whether participants are told their own results, who tells them, and within what timeframe. The current text is silent on this.',
    'Whether any accuracy or performance figure for the classifier may be stated to participants, and if so what figure is defensible.',
    'Whether participants incur any cost, and whether any reimbursement or compensation is offered.',
    'The consent process for a participant who cannot read: whether a witness signature or thumbprint is required, and who may act as witness.',
    'The Filipino translation: it must be produced by a qualified human translator and independently back-translated, then reviewed and signed off. Machine or LLM translation is not acceptable for this text and no Filipino version exists yet.',
    'Whether the phrase "not a diagnosis" is strong enough, or whether a formal statement that this is an investigational tool not registered with the FDA Philippines is required.',
  ],
}

/** Version -> document. Append-only; never edit a published entry in place. */
export const CONSENT_DOCUMENTS: Record<string, ConsentDocument> = {
  [DRAFT_EN_CONSENT_VERSION]: DRAFT_EN_CONSENT,
}

export const CONSENT_ERRORS = {
  DOCUMENT_UNKNOWN: 'CONSENT_DOCUMENT_UNKNOWN',
  STATUS_INVALID: 'CONSENT_STATUS_INVALID',
  RECORDER_REQUIRED: 'CONSENT_RECORDER_REQUIRED',
} as const

export type ConsentErrorCode = (typeof CONSENT_ERRORS)[keyof typeof CONSENT_ERRORS]

export function consentDocumentVersions(): string[] {
  return Object.keys(CONSENT_DOCUMENTS)
}

export function getConsentDocument(version: string): ConsentDocument | undefined {
  return CONSENT_DOCUMENTS[version]
}

/**
 * The newest document for a language, or undefined if none exists.
 *
 * Undefined is the correct and important answer for a language with no
 * reviewed text: it stops the UI offering consent in a language the patient
 * would then be asked to agree to on the basis of an ad-hoc translation.
 */
export function latestConsentDocumentFor(language: string): ConsentDocument | undefined {
  const matches = Object.values(CONSENT_DOCUMENTS).filter((doc) => doc.language === language)
  if (matches.length === 0) return undefined
  return matches.sort((a, b) => a.version.localeCompare(b.version))[matches.length - 1]
}

export function isConsentDocumentApproved(version: string): boolean {
  return getConsentDocument(version)?.approvalStatus === 'APPROVED'
}

export function outstandingEthicsReviewItems(version: string): string[] {
  return getConsentDocument(version)?.outstandingReviewItems ?? []
}

export interface RecordConsentInput {
  status: ConsentStatus
  /** Which document the patient was actually shown. */
  documentVersion: string
  /** The signed-in user who presented it and recorded the answer. */
  recordedBy: string
}

export type ConsentResult =
  | { ok: true; value: PatientConsent }
  | { ok: false; error: ConsentErrorCode }

const CONSENT_STATUS_VALUES: readonly string[] = Object.values(CONSENT_STATUSES)

/**
 * Builds the consent record to store on a patient.
 *
 * Deliberately takes no `language`: it is read off the document, so the stored
 * language always matches the text presented.
 *
 * Recording GRANTED against a DRAFT document is permitted, because blocking it
 * would make the app untestable before ethics approval lands. The safeguard is
 * that the draft's version string contains the word DRAFT and is copied onto
 * the record, so such consents are identifiable and excludable downstream.
 * The UI is responsible for showing an unmissable warning while the document
 * is unapproved — see `isConsentDocumentApproved`.
 */
export function buildPatientConsent(
  input: RecordConsentInput,
  now: Date = new Date(),
): ConsentResult {
  const document = getConsentDocument(input.documentVersion)
  if (document === undefined) {
    return { ok: false, error: CONSENT_ERRORS.DOCUMENT_UNKNOWN }
  }

  if (!CONSENT_STATUS_VALUES.includes(input.status)) {
    return { ok: false, error: CONSENT_ERRORS.STATUS_INVALID }
  }

  const recordedBy = input.recordedBy.trim()
  if (recordedBy === '') {
    // Consent with nobody accountable for having taken it is not consent.
    return { ok: false, error: CONSENT_ERRORS.RECORDER_REQUIRED }
  }

  return {
    ok: true,
    value: {
      status: input.status,
      language: document.language,
      textVersion: document.version,
      presentedAt: now.toISOString(),
      recordedBy,
    },
  }
}
