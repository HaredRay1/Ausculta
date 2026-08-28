/**
 * Language-neutral clinical code registry.
 *
 * Clinical values (roles, locations, classifications, symptoms, …) are stored
 * ONLY as these codes — never as display strings. Display strings live in
 * `src/i18n/locales/{lang}/codes.json`, keyed `<namespace>.<CODE>` (see
 * CODE_REGISTRY below, which is the exhaustiveness source of truth the i18n
 * test suite checks every code against).
 */

export const ROLES = {
  PATIENT: 'PATIENT',
  PRACTITIONER: 'PRACTITIONER',
  HEALTH_WORKER: 'HEALTH_WORKER',
  RESEARCHER: 'RESEARCHER',
  ADMIN: 'ADMIN',
} as const

export const LOCATION_CODES = {
  R_UPPER: 'R_UPPER',
  R_MIDDLE: 'R_MIDDLE',
  R_LOWER: 'R_LOWER',
  L_UPPER: 'L_UPPER',
  L_MIDDLE: 'L_MIDDLE',
  L_LOWER: 'L_LOWER',
} as const

export const CLASSIFICATION_CODES = {
  ASTHMA: 'ASTHMA',
  BRONCHIOLITIS: 'BRONCHIOLITIS',
  HEALTHY: 'HEALTHY',
  PNEUMONIA: 'PNEUMONIA',
} as const

export const AI_STATUS = {
  PENDING: 'PENDING',
  ANALYZED: 'ANALYZED',
  MODEL_NOT_CONNECTED: 'MODEL_NOT_CONNECTED',
  INSUFFICIENT_QUALITY: 'INSUFFICIENT_QUALITY',
  ERROR: 'ERROR',
} as const

export const AUDIO_SOURCES = {
  DEVICE_WAV_IMPORT: 'DEVICE_WAV_IMPORT',
  MIC_TEST_MODE: 'MIC_TEST_MODE',
  DEMO_FICTIONAL: 'DEMO_FICTIONAL',
} as const

export const MEASUREMENT_CODES = {
  SPO2: 'SPO2',
  RESP_RATE_MANUAL: 'RESP_RATE_MANUAL',
  RESP_RATE_AUSC_DERIVED: 'RESP_RATE_AUSC_DERIVED',
  HEART_RATE: 'HEART_RATE',
  TEMP: 'TEMP',
  BP_SYS: 'BP_SYS',
  BP_DIA: 'BP_DIA',
} as const

export const MEASUREMENT_SOURCES = {
  MANUAL_ENTRY: 'MANUAL_ENTRY',
  AUSCULTATION_DERIVED: 'AUSCULTATION_DERIVED',
} as const

export const SYMPTOM_CODES = {
  COUGH: 'COUGH',
  PHLEGM: 'PHLEGM',
  SHORTNESS_OF_BREATH: 'SHORTNESS_OF_BREATH',
  DIFFICULTY_BREATHING: 'DIFFICULTY_BREATHING',
  WHEEZING_REPORTED: 'WHEEZING_REPORTED',
  CHEST_DISCOMFORT: 'CHEST_DISCOMFORT',
  FEVER: 'FEVER',
  FATIGUE: 'FATIGUE',
  NIGHT_SWEATS: 'NIGHT_SWEATS',
  HEMOPTYSIS: 'HEMOPTYSIS',
  WEIGHT_LOSS: 'WEIGHT_LOSS',
  OTHER: 'OTHER',
} as const

export const SYMPTOM_SEVERITIES = {
  MILD: 'MILD',
  MODERATE: 'MODERATE',
  SEVERE: 'SEVERE',
} as const

export const SYMPTOM_FREQUENCIES = {
  OCCASIONAL: 'OCCASIONAL',
  INTERMITTENT: 'INTERMITTENT',
  PERSISTENT: 'PERSISTENT',
} as const

export const SEVERITY_CATEGORIES = {
  MINIMAL: 'MINIMAL',
  MILD: 'MILD',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  VERY_HIGH: 'VERY_HIGH',
} as const

export const REVIEW_STATUSES = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  DISAPPROVED: 'DISAPPROVED',
  FURTHER_REVIEW_REQUESTED: 'FURTHER_REVIEW_REQUESTED',
} as const

export const INTERPRETATION_CODES = {
  CONFIRMED: 'CONFIRMED',
  DISAGREED: 'DISAGREED',
  MODIFIED: 'MODIFIED',
  UNCERTAIN: 'UNCERTAIN',
  REPEAT_REQUESTED: 'REPEAT_REQUESTED',
} as const

export const USER_STATUSES = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const

export const ALERT_TYPES = {
  NEW_ABNORMAL: 'NEW_ABNORMAL',
  PERSISTENT_ABNORMAL: 'PERSISTENT_ABNORMAL',
  SIGNIFICANT_CHANGE: 'SIGNIFICANT_CHANGE',
  MISSED_MONITORING: 'MISSED_MONITORING',
  REPEATED_POOR_QUALITY: 'REPEATED_POOR_QUALITY',
} as const

/**
 * Recorded because lung-function reference values are sex-specific, and it is a
 * research export variable. `UNDISCLOSED` covers refusal to answer — the field
 * is never mandatory. The research protocol owner may extend this list.
 */
export const SEX_CODES = {
  FEMALE: 'FEMALE',
  MALE: 'MALE',
  UNDISCLOSED: 'UNDISCLOSED',
} as const

/**
 * Consent lives here rather than inside the patients feature (as audit actions
 * do) because consent state leaves the device in research exports and governs
 * whether a record may be exported at all. It is a study variable, not an
 * operational one.
 */
export const CONSENT_STATUSES = {
  GRANTED: 'GRANTED',
  DECLINED: 'DECLINED',
  WITHDRAWN: 'WITHDRAWN',
} as const

/**
 * Standing respiratory history — a property of the person, asked once at
 * registration, distinct from SYMPTOM_CODES (what is true at a single visit).
 * Selected for this study's setting: TB is endemic in the Philippines, and
 * biomass cooking smoke is a major rural COPD risk factor.
 */
export const RESPIRATORY_HISTORY_CODES = {
  ASTHMA_DIAGNOSED: 'ASTHMA_DIAGNOSED',
  PNEUMONIA_PAST: 'PNEUMONIA_PAST',
  TUBERCULOSIS_PAST: 'TUBERCULOSIS_PAST',
  BRONCHIOLITIS_PAST: 'BRONCHIOLITIS_PAST',
  COPD_DIAGNOSED: 'COPD_DIAGNOSED',
  CHRONIC_COUGH: 'CHRONIC_COUGH',
  ALLERGIES: 'ALLERGIES',
  SMOKER_CURRENT: 'SMOKER_CURRENT',
  SMOKER_FORMER: 'SMOKER_FORMER',
  SECONDHAND_SMOKE: 'SECONDHAND_SMOKE',
  BIOMASS_SMOKE_EXPOSURE: 'BIOMASS_SMOKE_EXPOSURE',
  OCCUPATIONAL_DUST: 'OCCUPATIONAL_DUST',
  PRIOR_RESPIRATORY_HOSPITALIZATION: 'PRIOR_RESPIRATORY_HOSPITALIZATION',
  INHALER_USE: 'INHALER_USE',
  OTHER: 'OTHER',
} as const

/**
 * Family respiratory history. Household TB contact is the dominant
 * transmission route locally, so it is captured explicitly.
 */
export const FAMILY_HISTORY_CODES = {
  FAMILY_ASTHMA: 'FAMILY_ASTHMA',
  FAMILY_TUBERCULOSIS: 'FAMILY_TUBERCULOSIS',
  FAMILY_COPD: 'FAMILY_COPD',
  FAMILY_ALLERGIES: 'FAMILY_ALLERGIES',
  FAMILY_OTHER_RESPIRATORY: 'FAMILY_OTHER_RESPIRATORY',
  FAMILY_NONE_KNOWN: 'FAMILY_NONE_KNOWN',
} as const

/**
 * Rehabilitation activities a practitioner may assign.
 *
 * Deliberately short. The master spec also listed huff coughing, which the
 * clinical research found to be part of a mucus-clearance protocol evidenced
 * for cystic fibrosis and COPD — and contraindicated in bronchospasm, i.e. in
 * exactly this app's population. It is absent on purpose; do not add it back
 * without a clinician's written say-so.
 */
export const REHAB_ACTIVITY_CODES = {
  PURSED_LIP_BREATHING: 'PURSED_LIP_BREATHING',
  DIAPHRAGMATIC_BREATHING: 'DIAPHRAGMATIC_BREATHING',
  BREATHING_RELAXATION_RETRAINING: 'BREATHING_RELAXATION_RETRAINING',
  EXERCISE_WARM_UP: 'EXERCISE_WARM_UP',
} as const

export const ALERT_STATUSES = {
  NEW: 'NEW',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  CLOSED: 'CLOSED',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]
export type LocationCode = (typeof LOCATION_CODES)[keyof typeof LOCATION_CODES]
export type ClassificationCode = (typeof CLASSIFICATION_CODES)[keyof typeof CLASSIFICATION_CODES]
export type AiStatus = (typeof AI_STATUS)[keyof typeof AI_STATUS]
export type AudioSource = (typeof AUDIO_SOURCES)[keyof typeof AUDIO_SOURCES]
export type MeasurementCode = (typeof MEASUREMENT_CODES)[keyof typeof MEASUREMENT_CODES]
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[keyof typeof MEASUREMENT_SOURCES]
export type SymptomCode = (typeof SYMPTOM_CODES)[keyof typeof SYMPTOM_CODES]
export type SymptomSeverity = (typeof SYMPTOM_SEVERITIES)[keyof typeof SYMPTOM_SEVERITIES]
export type SymptomFrequency = (typeof SYMPTOM_FREQUENCIES)[keyof typeof SYMPTOM_FREQUENCIES]
export type SeverityCategory = (typeof SEVERITY_CATEGORIES)[keyof typeof SEVERITY_CATEGORIES]
export type ReviewStatus = (typeof REVIEW_STATUSES)[keyof typeof REVIEW_STATUSES]
export type InterpretationCode = (typeof INTERPRETATION_CODES)[keyof typeof INTERPRETATION_CODES]
export type UserStatus = (typeof USER_STATUSES)[keyof typeof USER_STATUSES]
export type AlertType = (typeof ALERT_TYPES)[keyof typeof ALERT_TYPES]
export type AlertStatus = (typeof ALERT_STATUSES)[keyof typeof ALERT_STATUSES]
export type SexCode = (typeof SEX_CODES)[keyof typeof SEX_CODES]
export type ConsentStatus = (typeof CONSENT_STATUSES)[keyof typeof CONSENT_STATUSES]
export type RespiratoryHistoryCode =
  (typeof RESPIRATORY_HISTORY_CODES)[keyof typeof RESPIRATORY_HISTORY_CODES]
export type FamilyHistoryCode = (typeof FAMILY_HISTORY_CODES)[keyof typeof FAMILY_HISTORY_CODES]
export type RehabActivityCode = (typeof REHAB_ACTIVITY_CODES)[keyof typeof REHAB_ACTIVITY_CODES]

/**
 * Namespace key -> its code list. Drives the i18n exhaustiveness test: every
 * code in every list below must have a display string in
 * `locales/en/codes.json` at `<namespace>.<CODE>`.
 */
export const CODE_REGISTRY: Record<string, readonly string[]> = {
  role: Object.values(ROLES),
  location: Object.values(LOCATION_CODES),
  classification: Object.values(CLASSIFICATION_CODES),
  aiStatus: Object.values(AI_STATUS),
  audioSource: Object.values(AUDIO_SOURCES),
  measurement: Object.values(MEASUREMENT_CODES),
  measurementSource: Object.values(MEASUREMENT_SOURCES),
  symptom: Object.values(SYMPTOM_CODES),
  symptomSeverity: Object.values(SYMPTOM_SEVERITIES),
  symptomFrequency: Object.values(SYMPTOM_FREQUENCIES),
  severityCategory: Object.values(SEVERITY_CATEGORIES),
  reviewStatus: Object.values(REVIEW_STATUSES),
  interpretation: Object.values(INTERPRETATION_CODES),
  userStatus: Object.values(USER_STATUSES),
  alertType: Object.values(ALERT_TYPES),
  alertStatus: Object.values(ALERT_STATUSES),
  sex: Object.values(SEX_CODES),
  consentStatus: Object.values(CONSENT_STATUSES),
  respiratoryHistory: Object.values(RESPIRATORY_HISTORY_CODES),
  familyHistory: Object.values(FAMILY_HISTORY_CODES),
  rehabActivity: Object.values(REHAB_ACTIVITY_CODES),
}
