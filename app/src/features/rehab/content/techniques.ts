import type { CitationId } from './citations'

/**
 * The technique library.
 *
 * ## Why this list is not the specification's list
 *
 * The master specification (§41) names five activities: pursed-lip breathing,
 * diaphragmatic breathing, controlled breathing, deep breathing, and huff
 * coughing. The commissioned clinical research checked all five against the
 * evidence and found one of them unsafe for this population:
 *
 * **Huff coughing is not offered.** It is the forced-expiration phase of the
 * Active Cycle of Breathing Technique — a mucus-clearance intervention with
 * evidence in cystic fibrosis, bronchiectasis and COPD, and none at all in
 * asthma. Physiotherapy sources list bronchospasm and hyper-reactive airways as
 * an explicit contraindication to ACBT, and asthma is by definition a
 * hyper-reactive-airway disease. Ausculta serves asthma patients, so shipping
 * it as a default self-directed daily activity would be the worst failure
 * available to this project. It appears in `EXCLUDED_TECHNIQUES` below and is
 * shown to the user only as an explicit *we do not offer this* note, so nobody
 * reinstates it from the specification without reading why.
 *
 * "Controlled breathing" and "deep breathing" are both vague, and the
 * best-evidenced thing they map onto is Papworth-style breathing-and-relaxation
 * retraining. They are merged into one technique under that framing, presented
 * as symptom, quality-of-life and relaxation support — never as a claim about
 * lung function, which is exactly what the trial behind it failed to show.
 *
 * One technique is *added* that the specification does not list: a pre-exercise
 * warm-up. It carries the strongest evidence of anything here — a strong,
 * high-certainty recommendation in the Philippine national pediatric guideline,
 * adopted from GINA — it needs no medication or equipment, and it is directly
 * relevant to school-age patients doing PE.
 *
 * Buteyko, ACBT as a named asthma technique, and inspiratory muscle training
 * are all excluded; see `EXCLUDED_TECHNIQUES` for the reason in each case.
 *
 * ## What the steps are and are not
 *
 * The step wording is written for this app, in plain language, from each
 * technique's definition. It is **not** quoted from a cited source, and the
 * research synthesis does not contain step-by-step protocols. So the steps
 * carry no counts, no breath ratios, no repetitions and no durations — every
 * number of that kind would be invented clinical content. How often and for how
 * long is a practitioner's decision under the specification's own approval
 * boundary, and the UI says so. `stepsProvenance` is rendered as a notice on
 * every technique screen.
 */

/**
 * Activity codes.
 *
 * Clinical values are stored as codes, never display strings — a `rehabPlans`
 * row records which of these a practitioner approved. These live here rather
 * than in `db/codes.ts` because that file is owned by another agent; if the
 * project wants them in the central registry (and so covered by the i18n
 * exhaustiveness test), the codes below are the exact list to adopt and this
 * const becomes a re-export.
 */
export const REHAB_ACTIVITY_CODES = {
  PURSED_LIP_BREATHING: 'PURSED_LIP_BREATHING',
  DIAPHRAGMATIC_BREATHING: 'DIAPHRAGMATIC_BREATHING',
  BREATHING_RELAXATION_RETRAINING: 'BREATHING_RELAXATION_RETRAINING',
  EXERCISE_WARM_UP: 'EXERCISE_WARM_UP',
} as const

export type RehabActivityCode =
  (typeof REHAB_ACTIVITY_CODES)[keyof typeof REHAB_ACTIVITY_CODES]

export const EVIDENCE_STRENGTH = {
  /** A strong, high-certainty recommendation in a national guideline. */
  STRONG: 'STRONG',
  /** One good trial, with real limits on what it demonstrated. */
  MODERATE: 'MODERATE',
  /** Plausible and very low risk, but the direct asthma evidence is weak. */
  LIMITED: 'LIMITED',
} as const

export type EvidenceStrength = (typeof EVIDENCE_STRENGTH)[keyof typeof EVIDENCE_STRENGTH]

/** Who a technique has actually been shown to suit. */
export const AUDIENCE = {
  /** Studied in adults; used informally with school-age children. */
  ADULTS_AND_TEENS: 'ADULTS_AND_TEENS',
  /** Trial population started at sixteen; never tested in children. */
  ADOLESCENT_AND_ADULT_ONLY: 'ADOLESCENT_AND_ADULT_ONLY',
  /** Evidence covers school-age children upward. */
  SCHOOL_AGE_AND_UP: 'SCHOOL_AGE_AND_UP',
} as const

export type Audience = (typeof AUDIENCE)[keyof typeof AUDIENCE]

export interface Technique {
  code: RehabActivityCode
  evidence: EvidenceStrength
  audience: Audience
  citations: readonly CitationId[]
  /** How many `steps` entries the locale bundle holds for this technique. */
  stepCount: number
  /** How many `cautions` entries the locale bundle holds. */
  cautionCount: number
  /**
   * Always `DESCRIPTIVE_PENDING_REVIEW` today: the steps are the build team's
   * plain-language description, not a quotation, and need clinician sign-off.
   */
  stepsProvenance: 'DESCRIPTIVE_PENDING_REVIEW'
}

/**
 * Order is deliberate: the strongest-evidenced item is not first, because the
 * two gentle breathing techniques are the ones a person reaches for when they
 * feel short of breath and both are the lowest-risk things on the list. The
 * warm-up is last because it is situational (before sport) rather than
 * something to do now.
 */
export const TECHNIQUES: readonly Technique[] = [
  {
    code: REHAB_ACTIVITY_CODES.PURSED_LIP_BREATHING,
    evidence: EVIDENCE_STRENGTH.LIMITED,
    audience: AUDIENCE.ADULTS_AND_TEENS,
    citations: ['COCHRANE_BREATHING', 'NCCIH_2022'],
    stepCount: 6,
    cautionCount: 3,
    stepsProvenance: 'DESCRIPTIVE_PENDING_REVIEW',
  },
  {
    code: REHAB_ACTIVITY_CODES.DIAPHRAGMATIC_BREATHING,
    evidence: EVIDENCE_STRENGTH.LIMITED,
    audience: AUDIENCE.ADULTS_AND_TEENS,
    citations: ['COCHRANE_BREATHING', 'NCCIH_2022'],
    stepCount: 6,
    cautionCount: 3,
    stepsProvenance: 'DESCRIPTIVE_PENDING_REVIEW',
  },
  {
    code: REHAB_ACTIVITY_CODES.BREATHING_RELAXATION_RETRAINING,
    evidence: EVIDENCE_STRENGTH.MODERATE,
    audience: AUDIENCE.ADOLESCENT_AND_ADULT_ONLY,
    citations: ['PAPWORTH_RCT', 'NCCIH_2022'],
    stepCount: 6,
    cautionCount: 3,
    stepsProvenance: 'DESCRIPTIVE_PENDING_REVIEW',
  },
  {
    code: REHAB_ACTIVITY_CODES.EXERCISE_WARM_UP,
    evidence: EVIDENCE_STRENGTH.STRONG,
    audience: AUDIENCE.SCHOOL_AGE_AND_UP,
    citations: ['PAPP_2021', 'STICKLAND_2012', 'JOHNS_HOPKINS_CHEST_PAIN'],
    stepCount: 6,
    cautionCount: 3,
    stepsProvenance: 'DESCRIPTIVE_PENDING_REVIEW',
  },
]

export function findTechnique(code: string): Technique | undefined {
  return TECHNIQUES.find((technique) => technique.code === code)
}

export function isRehabActivityCode(value: unknown): value is RehabActivityCode {
  return typeof value === 'string' && value in REHAB_ACTIVITY_CODES
}

/* ---- What we refuse to ship, and why ------------------------------------ */

export const EXCLUSION_REASON = {
  /** Actively unsafe for this population. Never a default suggestion. */
  CONTRAINDICATED_IN_ASTHMA: 'CONTRAINDICATED_IN_ASTHMA',
  /** Only a practitioner may prescribe it, for a specific indication. */
  CLINICIAN_PRESCRIBED_ONLY: 'CLINICIAN_PRESCRIBED_ONLY',
  /** The evidence is contested or absent. */
  EVIDENCE_TOO_WEAK: 'EVIDENCE_TOO_WEAK',
  /** Needs a physical device this product does not supply. */
  REQUIRES_EQUIPMENT: 'REQUIRES_EQUIPMENT',
} as const

export type ExclusionReason = (typeof EXCLUSION_REASON)[keyof typeof EXCLUSION_REASON]

export interface ExcludedTechnique {
  code: string
  reasons: readonly ExclusionReason[]
  citations: readonly CitationId[]
  /** True when the exclusion is explained to the user on the techniques screen. */
  shownToUser: boolean
}

/**
 * Kept in code, not just in a commit message.
 *
 * Huff coughing is named in the master specification, so the next person to
 * read the specification will look for it. Recording the exclusion — and
 * showing it — is what stops it being quietly added back.
 */
export const EXCLUDED_TECHNIQUES: readonly ExcludedTechnique[] = [
  {
    code: 'HUFF_COUGHING',
    reasons: [
      EXCLUSION_REASON.CONTRAINDICATED_IN_ASTHMA,
      EXCLUSION_REASON.CLINICIAN_PRESCRIBED_ONLY,
    ],
    citations: ['ACBT_CONTRAINDICATION'],
    shownToUser: true,
  },
  {
    code: 'ACBT',
    reasons: [
      EXCLUSION_REASON.CONTRAINDICATED_IN_ASTHMA,
      EXCLUSION_REASON.CLINICIAN_PRESCRIBED_ONLY,
    ],
    citations: ['ACBT_CONTRAINDICATION'],
    // Not surfaced separately: the huff-coughing note already explains that
    // huffing is ACBT's forced-expiration phase, and naming ACBT as an asthma
    // technique in its own right is exactly what the research warns against.
    shownToUser: false,
  },
  {
    code: 'BUTEYKO',
    reasons: [EXCLUSION_REASON.EVIDENCE_TOO_WEAK],
    citations: ['COCHRANE_BREATHING'],
    shownToUser: false,
  },
  {
    code: 'INSPIRATORY_MUSCLE_TRAINING',
    reasons: [EXCLUSION_REASON.EVIDENCE_TOO_WEAK, EXCLUSION_REASON.REQUIRES_EQUIPMENT],
    citations: ['COCHRANE_BREATHING'],
    shownToUser: false,
  },
]

export function excludedTechniquesShownToUser(): ExcludedTechnique[] {
  return EXCLUDED_TECHNIQUES.filter((entry) => entry.shownToUser)
}

/* ---- i18n key helpers ---------------------------------------------------- */

export function techniqueNameKey(code: string): string {
  return `rehab:techniques.item.${code}.name`
}

export function techniqueSummaryKey(code: string): string {
  return `rehab:techniques.item.${code}.summary`
}

export function techniqueStepsKey(code: string): string {
  return `rehab:techniques.item.${code}.steps`
}

export function techniqueSuitsKey(code: string): string {
  return `rehab:techniques.item.${code}.suits`
}

export function techniqueCautionsKey(code: string): string {
  return `rehab:techniques.item.${code}.cautions`
}
