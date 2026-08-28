import {
  CLASSIFICATION_CODES,
  FAMILY_HISTORY_CODES,
  INTERPRETATION_CODES,
  LOCATION_CODES,
  MEASUREMENT_CODES,
  RESPIRATORY_HISTORY_CODES,
  REVIEW_STATUSES,
  SEVERITY_CATEGORIES,
  SEX_CODES,
  SYMPTOM_CODES,
  SYMPTOM_FREQUENCIES,
  SYMPTOM_SEVERITIES,
  type ClassificationCode,
  type FamilyHistoryCode,
  type InterpretationCode,
  type LocationCode,
  type MeasurementCode,
  type RespiratoryHistoryCode,
  type ReviewStatus,
  type SexCode,
} from '../../db/codes'
import type { HistoryEntry, SymptomEntry } from '../../db/types'
import { DEMO_HEALTH_WORKER_A, DEMO_HEALTH_WORKER_B, DEMO_PRACTITIONER } from './staff'

/**
 * The fictional clinic.
 *
 * A small barangay health station outside Puerto Princesa, seven patients,
 * twenty visits over roughly nine weeks. It is written as a story rather than
 * generated randomly because the validation protocol has people *navigating*
 * it: a validator asked to "find where you can view your respiratory
 * assessment results" needs results that mean something when they arrive, and
 * a pulmonologist scoring clinical relevance will read the histories.
 *
 * What the dataset deliberately contains:
 *
 * - A child, several working-age adults and two older adults, so age-dependent
 *   screens have something to be wrong about.
 * - Histories drawn from this study's actual setting: household TB contact and
 *   biomass cooking smoke are the local risk factors the code registry calls
 *   out, not incidental colour.
 * - One clearly improving patient (Marisol) and one clearly worsening one
 *   (Danilo), because longitudinal asthma monitoring is the app's stated
 *   purpose and a flat dataset would demonstrate none of it.
 * - Assessments on both sides of the review workflow, so the practitioner
 *   queue is neither empty nor fully cleared.
 * - Recordings that failed the quality gate, because a demo where every
 *   recording succeeds teaches the wrong expectation.
 *
 * Everything here is invented. No part of it is derived from the fieldwork
 * recordings or from any real patient.
 */

/** Version of the dataset shape. Bump to make `seedDemoData` re-seed. */
export const DEMO_DATASET_VERSION = 1

/**
 * Model identity stamped on seeded rows.
 *
 * Not a real model version string: nothing here came out of the impulse, and a
 * plausible-looking version would let seeded rows be mistaken for real
 * inference output in a research export.
 */
export const DEMO_MODEL_VERSION = 'DEMO_FICTIONAL@0'

export const DEMO_CONSENT_TEXT_VERSION = 'consent-v1'
export const DEMO_QUESTIONNAIRE_VERSION = 'v1'

/** The six zones, in the order the app's lung map numbers them. */
export const DEMO_LOCATION_ORDER: readonly LocationCode[] = [
  LOCATION_CODES.R_UPPER,
  LOCATION_CODES.L_UPPER,
  LOCATION_CODES.R_MIDDLE,
  LOCATION_CODES.L_MIDDLE,
  LOCATION_CODES.R_LOWER,
  LOCATION_CODES.L_LOWER,
]

/**
 * What one seeded recording claims about itself.
 *
 * `uncertain` and `insufficient` exist as separate kinds precisely because
 * they are the two that must never acquire a classification or a confidence —
 * see `toAiOutcome` in features/assessment/data/mapping.ts, which is the rule
 * this dataset mirrors.
 */
export type DemoFinding =
  | 'clear'
  | 'asthma'
  | 'pneumonia'
  | 'bronchiolitis'
  | 'uncertain'
  | 'insufficient'
  | 'pending'
  | 'offline'

export const FINDING_CLASSIFICATION: Readonly<
  Partial<Record<DemoFinding, ClassificationCode>>
> = {
  clear: CLASSIFICATION_CODES.HEALTHY,
  asthma: CLASSIFICATION_CODES.ASTHMA,
  pneumonia: CLASSIFICATION_CODES.PNEUMONIA,
  bronchiolitis: CLASSIFICATION_CODES.BRONCHIOLITIS,
}

export interface DemoReviewSpec {
  interpretation: InterpretationCode
  status: ReviewStatus
  notes: string
  adjustedCategory?: string
}

export interface DemoVisitSpec {
  /** Days before the seeding moment. Larger is older. */
  daysAgo: number
  assessorId: string
  language: string
  symptoms: SymptomEntry[]
  vitals: { code: MeasurementCode; value: number; unit: string }[]
  /** `null` seeds the MODEL_NOT_CONNECTED severity path. */
  severity: { score: number; category: string } | null
  /** One finding per zone, in `DEMO_LOCATION_ORDER`. */
  findings: readonly [
    DemoFinding,
    DemoFinding,
    DemoFinding,
    DemoFinding,
    DemoFinding,
    DemoFinding,
  ]
  review?: DemoReviewSpec
}

export interface DemoPatientSpec {
  /** 1-based; fixes this patient's deterministic ids. */
  seq: number
  name: string
  birthDate: string
  sex: SexCode
  address: string
  contact?: string
  preferredLanguage: string
  consentLanguage: string
  respiratoryHistory: HistoryEntry<RespiratoryHistoryCode>[]
  familyHistory: HistoryEntry<FamilyHistoryCode>[]
  /** The case a validator should be steered to first. Exactly one is marked. */
  walkthrough?: boolean
  visits: DemoVisitSpec[]
}

// --- compact constructors, so the clinic below reads as a story -------------

const hx = <T extends string>(code: T, present: boolean): HistoryEntry<T> => ({ code, present })

const sym = (
  code: SymptomEntry['code'],
  present: boolean,
  severityCode?: SymptomEntry['severityCode'],
  frequencyCode?: SymptomEntry['frequencyCode'],
): SymptomEntry => ({
  code,
  present,
  ...(severityCode !== undefined && { severityCode }),
  ...(frequencyCode !== undefined && { frequencyCode }),
})

const spo2 = (value: number) => ({ code: MEASUREMENT_CODES.SPO2, value, unit: '%' })
const resp = (value: number) => ({
  code: MEASUREMENT_CODES.RESP_RATE_MANUAL,
  value,
  unit: 'breaths/min',
})
const pulse = (value: number) => ({ code: MEASUREMENT_CODES.HEART_RATE, value, unit: 'bpm' })

const approved = (notes: string, interpretation: InterpretationCode): DemoReviewSpec => ({
  interpretation,
  status: REVIEW_STATUSES.APPROVED,
  notes,
})

export const DEMO_PATIENTS: readonly DemoPatientSpec[] = [
  {
    seq: 1,
    name: 'Marisol Agbayani',
    birthDate: '1992-03-14',
    sex: SEX_CODES.FEMALE,
    address: 'Barangay Macarascas, Puerto Princesa',
    contact: '0917-555-0142',
    preferredLanguage: 'fil',
    consentLanguage: 'fil',
    walkthrough: true,
    respiratoryHistory: [
      hx(RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, true),
      hx(RESPIRATORY_HISTORY_CODES.INHALER_USE, true),
      hx(RESPIRATORY_HISTORY_CODES.ALLERGIES, true),
      hx(RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT, false),
      hx(RESPIRATORY_HISTORY_CODES.BIOMASS_SMOKE_EXPOSURE, true),
    ],
    familyHistory: [
      hx(FAMILY_HISTORY_CODES.FAMILY_ASTHMA, true),
      hx(FAMILY_HISTORY_CODES.FAMILY_TUBERCULOSIS, false),
    ],
    visits: [
      {
        daysAgo: 63,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.WHEEZING_REPORTED, true, SYMPTOM_SEVERITIES.MODERATE, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.SHORTNESS_OF_BREATH, true, SYMPTOM_SEVERITIES.MODERATE, SYMPTOM_FREQUENCIES.INTERMITTENT),
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.INTERMITTENT),
          sym(SYMPTOM_CODES.FEVER, false),
        ],
        vitals: [spo2(94), resp(24), pulse(92)],
        severity: { score: 68, category: SEVERITY_CATEGORIES.HIGH },
        findings: ['asthma', 'asthma', 'clear', 'asthma', 'clear', 'uncertain'],
        review: approved(
          'Widespread expiratory wheeze consistent with reported history. Reliever technique reviewed with patient; follow up in three weeks.',
          INTERPRETATION_CODES.CONFIRMED,
        ),
      },
      {
        daysAgo: 42,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.WHEEZING_REPORTED, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.OCCASIONAL),
          sym(SYMPTOM_CODES.SHORTNESS_OF_BREATH, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.OCCASIONAL),
          sym(SYMPTOM_CODES.COUGH, false),
        ],
        vitals: [spo2(96), resp(20), pulse(84)],
        severity: { score: 54, category: SEVERITY_CATEGORIES.MODERATE },
        findings: ['asthma', 'clear', 'clear', 'asthma', 'clear', 'clear'],
        review: approved(
          'Improving on regular inhaled therapy. Fewer involved zones than the previous visit.',
          INTERPRETATION_CODES.CONFIRMED,
        ),
      },
      {
        daysAgo: 21,
        assessorId: DEMO_HEALTH_WORKER_B,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.WHEEZING_REPORTED, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.OCCASIONAL),
          sym(SYMPTOM_CODES.COUGH, false),
          sym(SYMPTOM_CODES.CHEST_DISCOMFORT, false),
        ],
        vitals: [spo2(97), resp(18), pulse(78)],
        severity: { score: 38, category: SEVERITY_CATEGORIES.MILD },
        findings: ['clear', 'clear', 'uncertain', 'clear', 'clear', 'clear'],
        review: approved(
          'Continued improvement. One zone inconclusive; not repeated as the remaining five were clear.',
          INTERPRETATION_CODES.CONFIRMED,
        ),
      },
      {
        daysAgo: 5,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.WHEEZING_REPORTED, false),
          sym(SYMPTOM_CODES.SHORTNESS_OF_BREATH, false),
          sym(SYMPTOM_CODES.COUGH, false),
        ],
        vitals: [spo2(98), resp(17), pulse(74)],
        severity: { score: 22, category: SEVERITY_CATEGORIES.MINIMAL },
        findings: ['clear', 'clear', 'clear', 'clear', 'clear', 'clear'],
      },
    ],
  },

  {
    seq: 2,
    name: 'Danilo Rustia',
    birthDate: '1968-07-02',
    sex: SEX_CODES.MALE,
    address: 'Barangay Bacungan, Puerto Princesa',
    contact: '0918-555-0177',
    preferredLanguage: 'fil',
    consentLanguage: 'fil',
    respiratoryHistory: [
      hx(RESPIRATORY_HISTORY_CODES.CHRONIC_COUGH, true),
      hx(RESPIRATORY_HISTORY_CODES.BIOMASS_SMOKE_EXPOSURE, true),
      hx(RESPIRATORY_HISTORY_CODES.SMOKER_FORMER, true),
      hx(RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, false),
      hx(RESPIRATORY_HISTORY_CODES.TUBERCULOSIS_PAST, false),
    ],
    familyHistory: [
      hx(FAMILY_HISTORY_CODES.FAMILY_TUBERCULOSIS, true),
      hx(FAMILY_HISTORY_CODES.FAMILY_ASTHMA, false),
    ],
    visits: [
      {
        daysAgo: 56,
        assessorId: DEMO_HEALTH_WORKER_B,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.PHLEGM, true, SYMPTOM_SEVERITIES.MILD),
          sym(SYMPTOM_CODES.FEVER, false),
        ],
        vitals: [spo2(96), resp(19), pulse(80)],
        severity: { score: 30, category: SEVERITY_CATEGORIES.MILD },
        findings: ['clear', 'clear', 'clear', 'clear', 'uncertain', 'clear'],
        review: approved(
          'Chronic productive cough on a background of cooking-smoke exposure. Auscultation unremarkable today.',
          INTERPRETATION_CODES.CONFIRMED,
        ),
      },
      {
        daysAgo: 28,
        assessorId: DEMO_HEALTH_WORKER_B,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.MODERATE, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.PHLEGM, true, SYMPTOM_SEVERITIES.MODERATE),
          sym(SYMPTOM_CODES.SHORTNESS_OF_BREATH, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.INTERMITTENT),
          sym(SYMPTOM_CODES.NIGHT_SWEATS, true, SYMPTOM_SEVERITIES.MILD),
        ],
        vitals: [spo2(94), resp(22), pulse(88)],
        severity: { score: 52, category: SEVERITY_CATEGORIES.MODERATE },
        findings: ['clear', 'clear', 'pneumonia', 'clear', 'pneumonia', 'insufficient'],
        review: approved(
          'New right-sided coarse crackles. Household TB contact noted — referred for sputum testing alongside symptomatic treatment.',
          INTERPRETATION_CODES.CONFIRMED,
        ),
      },
      {
        daysAgo: 7,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.SEVERE, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.SHORTNESS_OF_BREATH, true, SYMPTOM_SEVERITIES.MODERATE, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.WEIGHT_LOSS, true, SYMPTOM_SEVERITIES.MODERATE),
          sym(SYMPTOM_CODES.NIGHT_SWEATS, true, SYMPTOM_SEVERITIES.MODERATE),
        ],
        vitals: [spo2(92), resp(26), pulse(98)],
        severity: { score: 74, category: SEVERITY_CATEGORIES.HIGH },
        findings: ['pneumonia', 'clear', 'pneumonia', 'uncertain', 'pneumonia', 'clear'],
      },
    ],
  },

  {
    seq: 3,
    name: 'Liwayway Sarmiento',
    birthDate: '2019-01-22',
    sex: SEX_CODES.FEMALE,
    address: 'Barangay Sta. Lourdes, Puerto Princesa',
    preferredLanguage: 'fil',
    consentLanguage: 'fil',
    respiratoryHistory: [
      hx(RESPIRATORY_HISTORY_CODES.BRONCHIOLITIS_PAST, true),
      hx(RESPIRATORY_HISTORY_CODES.ALLERGIES, true),
      hx(RESPIRATORY_HISTORY_CODES.SECONDHAND_SMOKE, true),
      hx(RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, false),
    ],
    familyHistory: [hx(FAMILY_HISTORY_CODES.FAMILY_ASTHMA, true)],
    visits: [
      {
        daysAgo: 35,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.OCCASIONAL),
          sym(SYMPTOM_CODES.FEVER, false),
          sym(SYMPTOM_CODES.DIFFICULTY_BREATHING, false),
        ],
        vitals: [spo2(98), resp(22), pulse(96)],
        severity: { score: 24, category: SEVERITY_CATEGORIES.MINIMAL },
        // A seven-year-old will not hold still for six zones. Two failed the
        // quality gate, which is what actually happens in a clinic.
        findings: ['clear', 'insufficient', 'clear', 'clear', 'insufficient', 'clear'],
        review: approved(
          'Post-viral cough, settling. Auscultation clear in the zones that recorded cleanly.',
          INTERPRETATION_CODES.CONFIRMED,
        ),
      },
      {
        daysAgo: 12,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.COUGH, false),
          sym(SYMPTOM_CODES.WHEEZING_REPORTED, false),
        ],
        vitals: [spo2(99), resp(20), pulse(90)],
        severity: { score: 18, category: SEVERITY_CATEGORIES.MINIMAL },
        findings: ['clear', 'clear', 'clear', 'insufficient', 'clear', 'clear'],
        review: approved('Well. No follow-up needed unless symptoms return.', INTERPRETATION_CODES.CONFIRMED),
      },
    ],
  },

  {
    seq: 4,
    name: 'Efren Malabanan',
    birthDate: '1981-11-09',
    sex: SEX_CODES.MALE,
    address: 'Barangay Napsan, Puerto Princesa',
    contact: '0906-555-0231',
    preferredLanguage: 'fil',
    consentLanguage: 'fil',
    respiratoryHistory: [
      hx(RESPIRATORY_HISTORY_CODES.TUBERCULOSIS_PAST, true),
      hx(RESPIRATORY_HISTORY_CODES.OCCUPATIONAL_DUST, true),
      hx(RESPIRATORY_HISTORY_CODES.CHRONIC_COUGH, true),
      hx(RESPIRATORY_HISTORY_CODES.PRIOR_RESPIRATORY_HOSPITALIZATION, true),
    ],
    familyHistory: [hx(FAMILY_HISTORY_CODES.FAMILY_TUBERCULOSIS, true)],
    visits: [
      {
        daysAgo: 49,
        assessorId: DEMO_HEALTH_WORKER_B,
        language: 'en',
        symptoms: [
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.MODERATE, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.FATIGUE, true, SYMPTOM_SEVERITIES.MILD),
          sym(SYMPTOM_CODES.HEMOPTYSIS, false),
        ],
        vitals: [spo2(95), resp(20), pulse(86)],
        severity: { score: 46, category: SEVERITY_CATEGORIES.MODERATE },
        findings: ['clear', 'uncertain', 'clear', 'clear', 'insufficient', 'clear'],
        review: approved(
          'Post-TB changes expected. Baseline recorded for comparison.',
          INTERPRETATION_CODES.CONFIRMED,
        ),
      },
      {
        daysAgo: 30,
        assessorId: DEMO_HEALTH_WORKER_B,
        language: 'en',
        symptoms: [
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.MODERATE, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.CHEST_DISCOMFORT, true, SYMPTOM_SEVERITIES.MILD),
        ],
        vitals: [spo2(95), resp(21), pulse(88)],
        severity: { score: 49, category: SEVERITY_CATEGORIES.MODERATE },
        // Recorded beside a running generator: four of six unusable.
        findings: ['insufficient', 'insufficient', 'uncertain', 'insufficient', 'insufficient', 'clear'],
        review: {
          interpretation: INTERPRETATION_CODES.REPEAT_REQUESTED,
          status: REVIEW_STATUSES.FURTHER_REVIEW_REQUESTED,
          notes:
            'Four of six zones failed the quality check — background noise. Please repeat in a quiet room before I interpret this visit.',
        },
      },
      {
        daysAgo: 9,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'en',
        symptoms: [
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.INTERMITTENT),
          sym(SYMPTOM_CODES.FATIGUE, false),
        ],
        vitals: [spo2(96), resp(19), pulse(82)],
        severity: { score: 41, category: SEVERITY_CATEGORIES.MILD },
        findings: ['clear', 'clear', 'clear', 'uncertain', 'clear', 'clear'],
      },
    ],
  },

  {
    seq: 5,
    name: 'Corazon Villaflor',
    birthDate: '1955-05-30',
    sex: SEX_CODES.FEMALE,
    address: 'Barangay Simpocan, Puerto Princesa',
    preferredLanguage: 'fil',
    consentLanguage: 'fil',
    respiratoryHistory: [
      hx(RESPIRATORY_HISTORY_CODES.COPD_DIAGNOSED, true),
      hx(RESPIRATORY_HISTORY_CODES.BIOMASS_SMOKE_EXPOSURE, true),
      hx(RESPIRATORY_HISTORY_CODES.PRIOR_RESPIRATORY_HOSPITALIZATION, true),
      hx(RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT, false),
      hx(RESPIRATORY_HISTORY_CODES.INHALER_USE, true),
    ],
    familyHistory: [
      hx(FAMILY_HISTORY_CODES.FAMILY_COPD, true),
      hx(FAMILY_HISTORY_CODES.FAMILY_ASTHMA, false),
    ],
    visits: [
      {
        daysAgo: 60,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.SHORTNESS_OF_BREATH, true, SYMPTOM_SEVERITIES.MODERATE, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.FATIGUE, true, SYMPTOM_SEVERITIES.MODERATE),
        ],
        vitals: [spo2(93), resp(23), pulse(90)],
        severity: { score: 58, category: SEVERITY_CATEGORIES.MODERATE },
        findings: ['clear', 'asthma', 'clear', 'asthma', 'uncertain', 'clear'],
        review: {
          interpretation: INTERPRETATION_CODES.MODIFIED,
          status: REVIEW_STATUSES.APPROVED,
          notes:
            'Model suggests an asthma pattern; in this patient the wheeze is her known COPD. Recorded as modified so the trend stays usable.',
          adjustedCategory: SEVERITY_CATEGORIES.MODERATE,
        },
      },
      {
        daysAgo: 33,
        assessorId: DEMO_HEALTH_WORKER_B,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.SHORTNESS_OF_BREATH, true, SYMPTOM_SEVERITIES.MODERATE, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.INTERMITTENT),
        ],
        vitals: [spo2(93), resp(22), pulse(88)],
        // Imported from the recorder before the model had been connected on
        // this device — a real state the app has to render.
        severity: null,
        findings: ['offline', 'offline', 'offline', 'offline', 'offline', 'offline'],
      },
      {
        daysAgo: 11,
        assessorId: DEMO_HEALTH_WORKER_B,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.SHORTNESS_OF_BREATH, true, SYMPTOM_SEVERITIES.MODERATE, SYMPTOM_FREQUENCIES.PERSISTENT),
          sym(SYMPTOM_CODES.CHEST_DISCOMFORT, true, SYMPTOM_SEVERITIES.MILD),
        ],
        vitals: [spo2(94), resp(22), pulse(86)],
        severity: { score: 57, category: SEVERITY_CATEGORIES.MODERATE },
        findings: ['clear', 'asthma', 'clear', 'asthma', 'clear', 'uncertain'],
      },
    ],
  },

  {
    seq: 6,
    name: 'Jomar Padilla',
    birthDate: '2004-09-17',
    sex: SEX_CODES.MALE,
    address: 'Barangay San Jose, Puerto Princesa',
    contact: '0995-555-0388',
    preferredLanguage: 'en',
    consentLanguage: 'en',
    respiratoryHistory: [
      hx(RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, true),
      hx(RESPIRATORY_HISTORY_CODES.INHALER_USE, true),
      hx(RESPIRATORY_HISTORY_CODES.SECONDHAND_SMOKE, true),
      hx(RESPIRATORY_HISTORY_CODES.ALLERGIES, true),
    ],
    familyHistory: [hx(FAMILY_HISTORY_CODES.FAMILY_ALLERGIES, true)],
    visits: [
      {
        daysAgo: 40,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'en',
        symptoms: [
          sym(SYMPTOM_CODES.WHEEZING_REPORTED, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.INTERMITTENT),
          sym(SYMPTOM_CODES.SHORTNESS_OF_BREATH, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.OCCASIONAL),
        ],
        vitals: [spo2(97), resp(18), pulse(76)],
        severity: { score: 44, category: SEVERITY_CATEGORIES.MODERATE },
        findings: ['clear', 'asthma', 'clear', 'clear', 'clear', 'uncertain'],
        review: approved(
          'Exercise-related symptoms. Advised pre-exercise reliever use and reviewed technique.',
          INTERPRETATION_CODES.CONFIRMED,
        ),
      },
      {
        daysAgo: 14,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'en',
        symptoms: [sym(SYMPTOM_CODES.WHEEZING_REPORTED, false), sym(SYMPTOM_CODES.COUGH, false)],
        vitals: [spo2(98), resp(17), pulse(72)],
        severity: { score: 36, category: SEVERITY_CATEGORIES.MILD },
        findings: ['clear', 'clear', 'clear', 'clear', 'pending', 'pending'],
      },
    ],
  },

  {
    seq: 7,
    name: 'Teresita Bagunu',
    birthDate: '1963-02-11',
    sex: SEX_CODES.FEMALE,
    address: 'Barangay Luzviminda, Puerto Princesa',
    contact: '0927-555-0410',
    preferredLanguage: 'fil',
    consentLanguage: 'fil',
    respiratoryHistory: [
      hx(RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, true),
      hx(RESPIRATORY_HISTORY_CODES.INHALER_USE, true),
      hx(RESPIRATORY_HISTORY_CODES.PRIOR_RESPIRATORY_HOSPITALIZATION, true),
      hx(RESPIRATORY_HISTORY_CODES.ALLERGIES, false),
    ],
    familyHistory: [hx(FAMILY_HISTORY_CODES.FAMILY_NONE_KNOWN, true)],
    visits: [
      {
        daysAgo: 52,
        assessorId: DEMO_HEALTH_WORKER_B,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.WHEEZING_REPORTED, true, SYMPTOM_SEVERITIES.MODERATE, SYMPTOM_FREQUENCIES.INTERMITTENT),
          sym(SYMPTOM_CODES.COUGH, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.OCCASIONAL),
        ],
        vitals: [spo2(95), resp(20), pulse(84)],
        severity: { score: 50, category: SEVERITY_CATEGORIES.MODERATE },
        findings: ['asthma', 'clear', 'asthma', 'clear', 'clear', 'clear'],
        review: approved(
          'Long-standing asthma, currently moderately controlled. Continue preventer.',
          INTERPRETATION_CODES.CONFIRMED,
        ),
      },
      {
        daysAgo: 26,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.WHEEZING_REPORTED, true, SYMPTOM_SEVERITIES.MILD, SYMPTOM_FREQUENCIES.OCCASIONAL),
        ],
        vitals: [spo2(96), resp(19), pulse(80)],
        severity: { score: 46, category: SEVERITY_CATEGORIES.MODERATE },
        findings: ['clear', 'clear', 'asthma', 'clear', 'uncertain', 'clear'],
        review: approved('Stable. No change to therapy.', INTERPRETATION_CODES.CONFIRMED),
      },
      {
        daysAgo: 6,
        assessorId: DEMO_HEALTH_WORKER_A,
        language: 'fil',
        symptoms: [
          sym(SYMPTOM_CODES.WHEEZING_REPORTED, false),
          sym(SYMPTOM_CODES.CHEST_DISCOMFORT, false),
        ],
        vitals: [spo2(97), resp(18), pulse(78)],
        severity: { score: 41, category: SEVERITY_CATEGORIES.MILD },
        findings: ['clear', 'clear', 'clear', 'clear', 'clear', 'uncertain'],
      },
    ],
  },
] as const

/** The practitioner every seeded review is attributed to. */
export const DEMO_REVIEWER_ID = DEMO_PRACTITIONER

/** The patient a validator should be pointed at first. */
export function walkthroughPatientSpec(): DemoPatientSpec {
  const found = DEMO_PATIENTS.find((patient) => patient.walkthrough)
  if (found === undefined) throw new Error('demo dataset has no walkthrough patient')
  return found
}
