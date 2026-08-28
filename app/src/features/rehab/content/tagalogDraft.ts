/**
 * Filipino source wording — DRAFT, NOT APPROVED, NOT RENDERED.
 *
 * ## Read this before using any string in this file
 *
 * The strings below are transcribed from the Philippine national pediatric
 * asthma guideline's own Tagalog Written Asthma Action Plan (PAPP 2021,
 * Appendix 1A). They come from an official Philippine source, so they are worth
 * keeping — but this project forbids shipping clinical, consent or safety text
 * in another language until a qualified human translator has worked on it and a
 * practitioner and the ethics review have signed it off. The guideline itself
 * describes its version as "only a sample WAAP" that readers should culturally
 * adapt to their own setting and dialect, which is a second reason not to treat
 * it as finished copy.
 *
 * So this module is a holding pen, deliberately built so nothing can render it
 * by accident:
 *
 * - it is **not** registered as an i18next resource bundle (see `../i18n.ts`);
 * - it exports plain data with an explicit `status` of `DRAFT_PENDING_REVIEW`;
 * - `assertApprovedForDisplay` throws if anything tries to display it.
 *
 * When an approved Filipino translation exists, it becomes a real
 * `locales/fil/rehab.json` bundle with its own row in `i18n/manifest.ts`
 * (`status: 'approved'`), pinned to the `REHAB_CONTENT_VERSION` it was reviewed
 * against. This file is then deleted, not promoted.
 */

export const DRAFT_TRANSLATION_STATUS = 'DRAFT_PENDING_REVIEW' as const

export interface DraftTranslationBundle {
  language: 'fil'
  status: typeof DRAFT_TRANSLATION_STATUS
  /** The `REHAB_CONTENT_VERSION` this draft was transcribed against. */
  againstContentVersion: number
  sourceCitationId: 'PAPP_2021'
  /** Everything that must happen before a single string here reaches a user. */
  blockedBy: readonly string[]
  strings: Record<string, string>
}

export const TAGALOG_WAAP_DRAFT: DraftTranslationBundle = {
  language: 'fil',
  status: DRAFT_TRANSLATION_STATUS,
  againstContentVersion: 1,
  sourceCitationId: 'PAPP_2021',
  blockedBy: [
    'Qualified human translator review',
    'Practitioner review of the clinical meaning in Filipino',
    'Ethics review sign-off',
    'A version-stamped fil/rehab.json bundle and a manifest row',
  ],
  strings: {
    'plan.zone.GREEN.name': 'Berdeng Sona',
    'plan.zone.GREEN.state': 'Hika ay kontrolado',
    'plan.zone.YELLOW.name': 'Dilaw na Sona',
    'plan.zone.YELLOW.state': 'Atake ay Banayad – Katamtaman',
    'plan.zone.RED.name': 'Pulang Sona',
    'plan.zone.RED.state': 'Matinding Atake ng Hika',
    'plan.field.peakFlow.optionalPrefix': 'Kung mayroon nito: Peak flow',
    'plan.field.respiratoryRate.blank': 'hinga kada minuto',
    'plan.redAction.body':
      'KAAGAD tawagan ang iyong Doktor/Emergency Room. Kung walang matawagan, dahilin agad ang pasyente sa pinakamalapit na ospital.',
  },
}

/**
 * The guard. Call this before any code path that would put a draft string on
 * screen; it always throws while `status` is `DRAFT_PENDING_REVIEW`.
 *
 * A thrown error is the correct outcome: unreviewed clinical text in a second
 * language reaching a patient is a worse failure than a crashed screen, and
 * this way the mistake is caught in a test rather than in a clinic.
 */
export function assertApprovedForDisplay(bundle: DraftTranslationBundle): never {
  throw new Error(
    `Refusing to display ${bundle.language} clinical text: status is ${bundle.status}. ` +
      `Blocked by: ${bundle.blockedBy.join('; ')}.`,
  )
}
