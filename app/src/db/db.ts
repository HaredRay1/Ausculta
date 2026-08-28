import Dexie, { type EntityTable, type Table } from 'dexie'
import type {
  Alert,
  Assessment,
  AudioBlobRecord,
  AppMetaEntry,
  AuditLog,
  ChangeLogEntry,
  ClinicalReview,
  MissingTranslationEntry,
  MonitoringPlan,
  Patient,
  Recording,
  RehabCompletion,
  RehabPlan,
  ResearchLabel,
  User,
} from './types'

/**
 * Ausculta's Dexie (IndexedDB) database — schema v1.
 *
 * This is the single source of truth for table/index shape. Later phases add
 * repositories on top of exactly these tables; they do not add new tables or
 * migrate this schema without a version bump.
 */
export class AuscultaDB extends Dexie {
  users!: EntityTable<User, 'id'>
  patients!: EntityTable<Patient, 'id'>
  assessments!: EntityTable<Assessment, 'id'>
  recordings!: EntityTable<Recording, 'id'>
  audioBlobs!: EntityTable<AudioBlobRecord, 'id'>
  clinicalReviews!: EntityTable<ClinicalReview, 'id'>
  monitoringPlans!: EntityTable<MonitoringPlan, 'id'>
  rehabPlans!: EntityTable<RehabPlan, 'id'>
  rehabCompletions!: EntityTable<RehabCompletion, 'id'>
  alerts!: EntityTable<Alert, 'id'>
  researchLabels!: EntityTable<ResearchLabel, 'id'>
  auditLogs!: EntityTable<AuditLog, 'seq'>
  // Compound primary key [key+language] — not a single keyof, so this can't
  // use EntityTable (which expects a single named PK field).
  missingTranslations!: Table<MissingTranslationEntry, [string, string]>
  changeLog!: EntityTable<ChangeLogEntry, 'seq'>
  appMeta!: EntityTable<AppMetaEntry, 'key'>

  constructor(name = 'ausculta') {
    super(name)

    this.version(1).stores({
      users: 'id, &username, role, status',
      patients:
        'id, studyId, linkedUserId, *assignedPractitionerIds, *assignedHealthWorkerIds, isDemo',
      assessments: 'id, patientId, assessorId, reviewStatus, date, [patientId+date], isDemo',
      recordings:
        'id, assessmentId, patientId, locationCode, aiStatus, [patientId+locationCode], isDemo',
      audioBlobs: 'id',
      clinicalReviews: 'id, assessmentId, recordingId, practitionerId, reviewedAt',
      monitoringPlans: 'id, patientId, practitionerId, status',
      rehabPlans: 'id, patientId, practitionerId, approvalStatus',
      rehabCompletions: 'id, rehabPlanId, patientId, completedAt',
      alerts: 'id, patientId, status, typeCode, createdAt',
      researchLabels: 'id, &recordingId, groundTruthStatus',
      auditLogs: '++seq, timestamp, userId, actionCode, patientId',
      missingTranslations: '&[key+language], lastSeen',
      changeLog: '++seq, entityType, entityId, timestamp',
      appMeta: '&key',
    })
  }
}

export const db = new AuscultaDB()
