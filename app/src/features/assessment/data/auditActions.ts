/**
 * Audit action codes emitted by the assessment flow.
 *
 * Deliberately NOT in `db/codes.ts`, following the precedent set by
 * `audit/audit.ts`: that registry is the clinical code vocabulary and its
 * CODE_REGISTRY drives an i18n exhaustiveness test. These are operational
 * codes, and their display strings live in
 * `i18n/locales/en/assessment.json` under `auditAction.*`.
 *
 * What is logged and why: a recording is a piece of evidence about a real
 * person, so the trail has to be able to answer who captured it, who replaced
 * it, and when it was handed to a practitioner. `RECORDING_REPLACED` is
 * separate from `RECORDING_SAVED` because replacing a position destroys the
 * audio that was there before, and that deletion should be visible.
 */
export const ASSESSMENT_AUDIT_ACTIONS = {
  ASSESSMENT_STARTED: 'ASSESSMENT_STARTED',
  RECORDING_SAVED: 'RECORDING_SAVED',
  RECORDING_REPLACED: 'RECORDING_REPLACED',
  ASSESSMENT_SUBMITTED: 'ASSESSMENT_SUBMITTED',
} as const

export type AssessmentAuditAction =
  (typeof ASSESSMENT_AUDIT_ACTIONS)[keyof typeof ASSESSMENT_AUDIT_ACTIONS]
