import type {
  AiStatus,
  AlertStatus,
  AlertType,
  AudioSource,
  ClassificationCode,
  InterpretationCode,
  LocationCode,
  MeasurementCode,
  MeasurementSource,
  ReviewStatus,
  Role,
  SymptomCode,
  SymptomFrequency,
  SymptomSeverity,
  UserStatus,
} from './codes'

/**
 * Dexie cannot index a boolean value. Every `isDemo` field below is stored as
 * 0 | 1 (not `boolean`) specifically because it is part of an index (see
 * db.ts schema `isDemo` index on patients/assessments/recordings).
 */
export type DemoFlag = 0 | 1

export interface User {
  id: string
  username: string
  passwordHash: string
  passwordSalt: string
  iterations: number
  role: Role
  name: string
  professionalDesignation?: string
  organization?: string
  preferredLanguage: string
  status: UserStatus
  createdAt: string
}

export interface PatientConsent {
  status: string
  language: string
  textVersion: string
  presentedAt: string
  recordedBy: string
}

export interface PatientDemographics {
  name: string
  birthDate: string
  sex: string
  address?: string
  contact?: string
}

export interface Patient extends PatientDemographics {
  id: string
  studyId: string
  linkedUserId?: string
  assignedPractitionerIds: string[]
  assignedHealthWorkerIds: string[]
  consent: PatientConsent | null
  preferredLanguage: string
  isDemo: DemoFlag
  createdAt: string
}

export interface Measurement {
  code: MeasurementCode
  value: number
  unit: string
  source: MeasurementSource
  enteredBy: string
  enteredAt: string
  device?: string
  note?: string
}

export interface SymptomEntry {
  code: SymptomCode
  present: boolean
  severityCode?: SymptomSeverity
  durationDays?: number
  frequencyCode?: SymptomFrequency
  notes?: string
}

export interface AssessmentAiSeverity {
  score: number | null
  category: string | null
  modelVersion: string | null
  calculatedAt: string | null
  thresholdConfigVersion: number
  status: 'MODEL_NOT_CONNECTED' | 'CALCULATED'
}

export interface AssessmentPractitionerSeverity {
  interpretation: InterpretationCode
  adjustedCategory?: string
  notes: string
  reviewedAt: string
}

export interface Assessment {
  id: string
  patientId: string
  assessorId: string
  practitionerReviewerId?: string
  date: string
  symptoms: SymptomEntry[]
  vitals: Measurement[]
  reviewStatus: ReviewStatus
  interfaceLanguage: string
  questionnaireLanguage: string
  questionnaireVersion: string
  aiSeverity: AssessmentAiSeverity
  practitionerSeverity?: AssessmentPractitionerSeverity
  isDemo: DemoFlag
  createdAt: string
}

export interface Recording {
  id: string
  assessmentId: string
  patientId: string
  locationCode: LocationCode
  audioBlobId: string
  audioSource: AudioSource
  originalFileName?: string
  importedSampleRate: number
  bitDepth: number
  channels: number
  durationSec: number
  quality: unknown | null
  aiStatus: AiStatus
  aiClassification?: ClassificationCode
  aiConfidence?: number
  uncertainFlag?: boolean
  perWindowResults?: unknown
  modelVersion?: string
  isDemo: DemoFlag
  createdAt: string
}

export interface AudioBlobRecord {
  id: string
  blob: Blob
}

export interface ClinicalReview {
  id: string
  assessmentId: string
  recordingId?: string
  practitionerId: string
  aiResultSnapshot: unknown
  interpretationCode: InterpretationCode
  modifiedClassificationCode?: ClassificationCode
  notes: string
  reviewedAt: string
}

/**
 * Fleshed out in a later phase — this phase only needs enough shape for the
 * Dexie schema (§4) to hold rows and for later phases to build on without a
 * migration.
 */
export interface MonitoringPlan {
  id: string
  patientId: string
  practitionerId: string
  status: string
  createdAt: string
  details: unknown
}

export interface RehabPlan {
  id: string
  patientId: string
  practitionerId: string
  approvalStatus: string
  createdAt: string
  details: unknown
}

export interface RehabCompletion {
  id: string
  rehabPlanId: string
  patientId: string
  completedAt: string
  details: unknown
}

export interface Alert {
  id: string
  patientId: string
  typeCode: AlertType
  status: AlertStatus
  message?: string
  createdAt: string
  acknowledgedBy?: string
  acknowledgedAt?: string
}

export interface ResearchLabel {
  id: string
  recordingId: string
  groundTruthStatus: string
  labelCode?: ClassificationCode
  labeledBy: string
  labeledAt: string
}

export interface AuditLog {
  seq?: number
  timestamp: string
  userId: string
  actionCode: string
  entityType?: string
  entityId?: string
  patientId?: string
  detail?: unknown
}

export interface ChangeLogEntry {
  seq?: number
  entityType: string
  entityId: string
  op: string
  timestamp: string
}

export interface AppMetaEntry {
  key: string
  value: unknown
}

/** Row shape for the `missingTranslations` table (see i18n/index.ts). */
export interface MissingTranslationEntry {
  key: string
  language: string
  count: number
  lastSeen: string
}
