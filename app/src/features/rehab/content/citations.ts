/**
 * Where every clinical claim in this feature comes from.
 *
 * Nothing in the rehabilitation module renders a clinical statement without a
 * citation id pointing here, and the UI shows the citation to the user. A
 * pulmonologist scores clinical relevance and patient safety directly during
 * validation; "trust us" is not an answer they can score.
 *
 * `confidence` mirrors the tagging in the project's own clinical research
 * synthesis (`.superpowers/sdd/.../research-rehabilitation.md`):
 *
 * - `PRIMARY`   — read directly from the source document.
 * - `SECONDARY` — the source is reputable but was corroborated through a
 *                 summary rather than the original text.
 * - `UNVERIFIED` — the claim circulates widely but could not be confirmed
 *                 against an original document. Shown to the user as such, and
 *                 never used as the sole basis for an instruction.
 *
 * Display strings live in `locales/en/rehab.json` under `citation.<ID>` so the
 * reference can be translated (by a human) alongside the content it supports.
 */

export const CITATION_CONFIDENCE = {
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
  UNVERIFIED: 'UNVERIFIED',
} as const

export type CitationConfidence = (typeof CITATION_CONFIDENCE)[keyof typeof CITATION_CONFIDENCE]

export interface Citation {
  id: CitationId
  confidence: CitationConfidence
  url?: string
  /**
   * True when the research synthesis recorded the claim but not a complete,
   * checkable reference. The UI says so, and the report flags it for the
   * clinician reviewer.
   */
  needsVerification?: boolean
}

export const CITATION_IDS = [
  'PAPP_2021',
  'GINA_2023_POCKET',
  'GINA_2025_SUMMARY',
  'PAPWORTH_RCT',
  'STICKLAND_2012',
  'NCCIH_2022',
  'COCHRANE_BREATHING',
  'ASTHMA_LUNG_UK',
  'CDC_WHO_GINA_DANGER_SIGNS',
  'JOHNS_HOPKINS_CHEST_PAIN',
  'DOH_NTP_WHO_TB',
  'ACBT_CONTRAINDICATION',
] as const

export type CitationId = (typeof CITATION_IDS)[number]

export const CITATIONS: Record<CitationId, Citation> = {
  PAPP_2021: {
    id: 'PAPP_2021',
    confidence: CITATION_CONFIDENCE.PRIMARY,
    url: 'http://pps.org.ph/wp-content/uploads/2024/01/2.-PAPP-Clinical-Practice-Guidelines-for-Pediatric-Asthma-2021-Full-Version-1.pdf',
  },
  GINA_2023_POCKET: {
    id: 'GINA_2023_POCKET',
    confidence: CITATION_CONFIDENCE.PRIMARY,
    url: 'https://ginasthma.org/wp-content/uploads/2023/07/GINA-2023-Pocket-Guide-WMS.pdf',
  },
  GINA_2025_SUMMARY: {
    id: 'GINA_2025_SUMMARY',
    confidence: CITATION_CONFIDENCE.PRIMARY,
    url: 'https://ginasthma.org/wp-content/uploads/2025/11/GINA-Summary-Guide-2025-WEB_FINAL-WMS.pdf',
  },
  PAPWORTH_RCT: {
    id: 'PAPWORTH_RCT',
    confidence: CITATION_CONFIDENCE.SECONDARY,
  },
  STICKLAND_2012: {
    id: 'STICKLAND_2012',
    // Reached through the Philippine guideline, which was read directly and
    // grades this recommendation strong / high certainty.
    confidence: CITATION_CONFIDENCE.PRIMARY,
  },
  NCCIH_2022: {
    id: 'NCCIH_2022',
    confidence: CITATION_CONFIDENCE.SECONDARY,
  },
  COCHRANE_BREATHING: {
    id: 'COCHRANE_BREATHING',
    confidence: CITATION_CONFIDENCE.SECONDARY,
    needsVerification: true,
  },
  ASTHMA_LUNG_UK: {
    id: 'ASTHMA_LUNG_UK',
    confidence: CITATION_CONFIDENCE.PRIMARY,
  },
  CDC_WHO_GINA_DANGER_SIGNS: {
    id: 'CDC_WHO_GINA_DANGER_SIGNS',
    confidence: CITATION_CONFIDENCE.SECONDARY,
    needsVerification: true,
  },
  JOHNS_HOPKINS_CHEST_PAIN: {
    id: 'JOHNS_HOPKINS_CHEST_PAIN',
    confidence: CITATION_CONFIDENCE.SECONDARY,
  },
  DOH_NTP_WHO_TB: {
    id: 'DOH_NTP_WHO_TB',
    confidence: CITATION_CONFIDENCE.SECONDARY,
  },
  ACBT_CONTRAINDICATION: {
    id: 'ACBT_CONTRAINDICATION',
    confidence: CITATION_CONFIDENCE.SECONDARY,
    needsVerification: true,
  },
}

/** i18n key for a citation's short label. */
export function citationLabelKey(id: CitationId): string {
  return `rehab:citation.${id}.label`
}

/** i18n key for a citation's full reference. */
export function citationSourceKey(id: CitationId): string {
  return `rehab:citation.${id}.source`
}

/** i18n key for a citation's caveat, present only on some citations. */
export function citationNoteKey(id: CitationId): string {
  return `rehab:citation.${id}.note`
}
