import { db as defaultDb, type AuscultaDB } from '../../db/db'
import type { ClassificationCode } from '../../db/codes'
import type { Recording, ResearchLabel } from '../../db/types'
import { visibleRows } from '../demo/visibility'
import {
  GROUND_TRUTH_STATUSES,
  labelViolation,
  suppliesTrueClass,
  type GroundTruthStatus,
} from './groundTruth'
import { buildPerformanceReport, type PerformanceReport, type ScoredPair } from './metrics'

/**
 * Reads for the researcher screens.
 *
 * Every number here is counted from the database. There are no estimates and
 * nothing is hardcoded — a dashboard that rounds or guesses is worse than one
 * that says zero, because a researcher will quote it.
 *
 * All reads go through `visibleRows` so that seeded fictional records obey the
 * demo switch here exactly as they do everywhere else.
 */

export interface ResearchCounts {
  patients: number
  assessments: number
  recordings: number
  /** Recordings the model gave a class to. */
  withPrediction: number
  /** Recordings carrying any reference label, whatever its status. */
  withReferenceLabel: number
  /** Recordings with both a prediction and a reference class — the scorable set. */
  scorable: number
  /** Labelled but unusable for scoring, by status. Never silently dropped. */
  labelledNotScorable: number
}

export const EMPTY_COUNTS: ResearchCounts = {
  patients: 0,
  assessments: 0,
  recordings: 0,
  withPrediction: 0,
  withReferenceLabel: 0,
  scorable: 0,
  labelledNotScorable: 0,
}

/** `true` when the model gave this recording a class to be scored against. */
export function hasPrediction(recording: Pick<Recording, 'aiClassification'>): boolean {
  return recording.aiClassification !== undefined
}

export async function readResearchCounts(
  db: AuscultaDB = defaultDb,
  demoEnabled = false,
): Promise<ResearchCounts> {
  const [patients, assessments, recordings, labels] = await Promise.all([
    visibleRows(db.patients, demoEnabled).count(),
    visibleRows(db.assessments, demoEnabled).count(),
    visibleRows(db.recordings, demoEnabled).toArray(),
    db.researchLabels.toArray(),
  ])

  const inScope = new Set(recordings.map((recording) => recording.id))
  const labelsInScope = labels.filter((label) => inScope.has(label.recordingId))
  const byRecording = new Map(labelsInScope.map((label) => [label.recordingId, label]))

  let scorable = 0
  for (const recording of recordings) {
    const label = byRecording.get(recording.id)
    if (label !== undefined && hasPrediction(recording) && suppliesTrueClass(label)) scorable += 1
  }

  return {
    patients,
    assessments,
    recordings: recordings.length,
    withPrediction: recordings.filter(hasPrediction).length,
    withReferenceLabel: labelsInScope.length,
    scorable,
    labelledNotScorable: labelsInScope.length - scorable,
  }
}

// --- scorable pairs and the performance report ------------------------------

export interface ScorableSet {
  pairs: ScoredPair[]
  /** Labelled recordings excluded from scoring, and why. */
  excluded: Record<GroundTruthStatus | 'NO_PREDICTION', number>
}

const EMPTY_EXCLUSIONS: ScorableSet['excluded'] = {
  [GROUND_TRUTH_STATUSES.CORRECT]: 0,
  [GROUND_TRUTH_STATUSES.MODIFIED]: 0,
  [GROUND_TRUTH_STATUSES.INCORRECT]: 0,
  [GROUND_TRUTH_STATUSES.UNCERTAIN]: 0,
  [GROUND_TRUTH_STATUSES.NO_REFERENCE_AVAILABLE]: 0,
  NO_PREDICTION: 0,
}

/**
 * Pairs a prediction with a reference class, and accounts for every label that
 * did not make it in.
 *
 * The exclusions matter as much as the pairs. A labelled recording that
 * disappeared from the denominator with no explanation is how a performance
 * figure quietly stops meaning what it says.
 */
export function buildScorableSet(
  recordings: readonly Recording[],
  labels: readonly ResearchLabel[],
): ScorableSet {
  const byRecording = new Map(labels.map((label) => [label.recordingId, label]))
  const pairs: ScoredPair[] = []
  const excluded = { ...EMPTY_EXCLUSIONS }

  for (const recording of recordings) {
    const label = byRecording.get(recording.id)
    if (label === undefined) continue

    if (!hasPrediction(recording)) {
      excluded.NO_PREDICTION += 1
      continue
    }
    if (!suppliesTrueClass(label)) {
      const status = label.groundTruthStatus as GroundTruthStatus
      if (status in excluded) excluded[status] += 1
      continue
    }
    pairs.push({
      recordingId: recording.id,
      predicted: recording.aiClassification as ClassificationCode,
      actual: label.labelCode as ClassificationCode,
    })
  }
  return { pairs, excluded }
}

export interface PerformanceView {
  report: PerformanceReport
  excluded: ScorableSet['excluded']
  /** Recordings carrying a label of any kind, in scope. */
  labelled: number
}

export async function readPerformance(
  db: AuscultaDB = defaultDb,
  demoEnabled = false,
): Promise<PerformanceView> {
  const [recordings, labels] = await Promise.all([
    visibleRows(db.recordings, demoEnabled).toArray(),
    db.researchLabels.toArray(),
  ])
  const inScope = new Set(recordings.map((recording) => recording.id))
  const labelsInScope = labels.filter((label) => inScope.has(label.recordingId))
  const { pairs, excluded } = buildScorableSet(recordings, labelsInScope)

  return {
    report: buildPerformanceReport(pairs),
    excluded,
    labelled: labelsInScope.length,
  }
}

// --- the labelling queue ----------------------------------------------------

export interface LabellingRow {
  recording: Recording
  label: ResearchLabel | null
}

/**
 * Recordings to label, unlabelled first.
 *
 * Only recordings that have audio are offered: a reference label is what a
 * researcher hears, and a row with no blob is nothing to listen to.
 */
export async function readLabellingQueue(
  db: AuscultaDB = defaultDb,
  demoEnabled = false,
  limit = 50,
): Promise<LabellingRow[]> {
  const [recordings, labels] = await Promise.all([
    visibleRows(db.recordings, demoEnabled).toArray(),
    db.researchLabels.toArray(),
  ])
  const byRecording = new Map(labels.map((label) => [label.recordingId, label]))

  return recordings
    .map((recording) => ({ recording, label: byRecording.get(recording.id) ?? null }))
    .sort((a, b) => {
      if ((a.label === null) !== (b.label === null)) return a.label === null ? -1 : 1
      return a.recording.createdAt.localeCompare(b.recording.createdAt)
    })
    .slice(0, limit)
}

export interface SaveLabelInput {
  recordingId: string
  groundTruthStatus: GroundTruthStatus
  labelCode?: ClassificationCode
  labeledBy: string
  labeledAt?: string
}

/**
 * Records a reference label.
 *
 * Two things this deliberately does not do:
 *
 * **It never touches the recording.** The model's prediction, confidence and
 * status are left exactly as inference wrote them. A ground-truth label is a
 * second, independent opinion recorded beside the first — the same immutability
 * principle as clinical review. Overwriting the prediction would destroy the
 * only thing the performance screen exists to measure.
 *
 * **It rejects a malformed label rather than storing it.** A class attached to
 * a status that cannot support one would go on to move a published accuracy
 * figure, so it fails loudly here instead.
 *
 * `researchLabels.recordingId` is uniquely indexed, so re-labelling replaces
 * the existing row rather than accumulating a second opinion. That is a
 * deliberate limit of the current schema and is worth revisiting if the study
 * wants inter-rater agreement.
 */
export async function saveResearchLabel(
  input: SaveLabelInput,
  db: AuscultaDB = defaultDb,
): Promise<ResearchLabel> {
  const violation = labelViolation(input)
  if (violation !== null) {
    throw new Error(`refusing to store a malformed reference label: ${violation}`)
  }

  const existing = await db.researchLabels.where('recordingId').equals(input.recordingId).first()
  const row: ResearchLabel = {
    id: existing?.id ?? `RL-${crypto.randomUUID()}`,
    recordingId: input.recordingId,
    groundTruthStatus: input.groundTruthStatus,
    ...(input.labelCode !== undefined && { labelCode: input.labelCode }),
    labeledBy: input.labeledBy,
    labeledAt: input.labeledAt ?? new Date().toISOString(),
  }
  await db.researchLabels.put(row)
  return row
}

export async function readLabelFor(
  recordingId: string,
  db: AuscultaDB = defaultDb,
): Promise<ResearchLabel | null> {
  return (await db.researchLabels.where('recordingId').equals(recordingId).first()) ?? null
}
