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
}
