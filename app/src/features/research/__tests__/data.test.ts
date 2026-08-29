import { beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../../../db/db'
import { CLASSIFICATION_CODES } from '../../../db/codes'
import { seedDemoData } from '../../demo/seed'
import {
  buildScorableSet,
  readLabelFor,
  readLabellingQueue,
  readPerformance,
  readResearchCounts,
  saveResearchLabel,
} from '../data'
import { GROUND_TRUTH_STATUSES } from '../groundTruth'

let db: AuscultaDB
const NOW = Date.parse('2026-08-29T06:00:00.000Z')
const { ASTHMA, HEALTHY } = CLASSIFICATION_CODES

beforeEach(() => {
  db = new AuscultaDB(`ausculta-research-data-${crypto.randomUUID()}`)
})

describe('readResearchCounts', () => {
  it('counts nothing on an empty database rather than estimating', async () => {
    const counts = await readResearchCounts(db, false)
    expect(counts).toEqual({
      patients: 0,
      assessments: 0,
      recordings: 0,
      withPrediction: 0,
      withReferenceLabel: 0,
      scorable: 0,
      labelledNotScorable: 0,
    })
  })

  it('derives every count from the database', async () => {
    await seedDemoData(db, { now: NOW })
    const counts = await readResearchCounts(db, true)

    expect(counts.patients).toBe(await db.patients.count())
    expect(counts.assessments).toBe(await db.assessments.count())
    expect(counts.recordings).toBe(await db.recordings.count())

    const expectedPredictions = (await db.recordings.toArray()).filter(
      (recording) => recording.aiClassification !== undefined,
    ).length
    expect(counts.withPrediction).toBe(expectedPredictions)
    // Not every recording carries a prediction: some are uncertain, some
    // failed the quality gate.
    expect(counts.withPrediction).toBeLessThan(counts.recordings)
    expect(counts.withReferenceLabel).toBe(0)
  })

  it('hides seeded rows from every count when demo mode is off', async () => {
    await seedDemoData(db, { now: NOW })
    const counts = await readResearchCounts(db, false)
    expect(counts.patients).toBe(0)
    expect(counts.recordings).toBe(0)
  })

  it('separates labelled from scorable', async () => {
    await seedDemoData(db, { now: NOW })
    const withPrediction = (await db.recordings.toArray()).filter(
      (r) => r.aiClassification !== undefined,
    )

    await saveResearchLabel(
      {
        recordingId: withPrediction[0].id,
        groundTruthStatus: GROUND_TRUTH_STATUSES.CORRECT,
        labelCode: withPrediction[0].aiClassification,
        labeledBy: 'researcher-1',
      },
      db,
    )
    await saveResearchLabel(
      {
        recordingId: withPrediction[1].id,
        groundTruthStatus: GROUND_TRUTH_STATUSES.NO_REFERENCE_AVAILABLE,
        labeledBy: 'researcher-1',
      },
      db,
    )

    const counts = await readResearchCounts(db, true)
    expect(counts.withReferenceLabel).toBe(2)
    expect(counts.scorable).toBe(1)
    expect(counts.labelledNotScorable).toBe(1)
  })
})

describe('buildScorableSet', () => {
  const recording = (id: string, aiClassification?: string) =>
    ({
      id,
      assessmentId: 'A1',
      patientId: 'P1',
      locationCode: 'R_UPPER',
      audioBlobId: 'B1',
      audioSource: 'DEMO_FICTIONAL',
      importedSampleRate: 8000,
      bitDepth: 16,
      channels: 1,
      durationSec: 4,
      quality: null,
      aiStatus: 'ANALYZED',
      ...(aiClassification !== undefined && { aiClassification }),
      isDemo: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
    }) as never

  const label = (recordingId: string, groundTruthStatus: string, labelCode?: string) =>
    ({
      id: `L-${recordingId}`,
      recordingId,
      groundTruthStatus,
      ...(labelCode !== undefined && { labelCode }),
      labeledBy: 'r1',
      labeledAt: '2026-08-02T00:00:00.000Z',
    }) as never

  it('pairs only labels that supply a true class', () => {
    const set = buildScorableSet(
      [
        recording('r1', ASTHMA),
        recording('r2', ASTHMA),
        recording('r3', ASTHMA),
        recording('r4', ASTHMA),
        recording('r5'), // analysed but inconclusive: no class
      ],
      [
        label('r1', GROUND_TRUTH_STATUSES.CORRECT, ASTHMA),
        label('r2', GROUND_TRUTH_STATUSES.MODIFIED, HEALTHY),
        label('r3', GROUND_TRUTH_STATUSES.INCORRECT),
        label('r4', GROUND_TRUTH_STATUSES.UNCERTAIN),
        label('r5', GROUND_TRUTH_STATUSES.CORRECT, ASTHMA),
      ],
    )

    expect(set.pairs).toHaveLength(2)
    expect(set.pairs).toContainEqual({ recordingId: 'r1', predicted: ASTHMA, actual: ASTHMA })
    expect(set.pairs).toContainEqual({ recordingId: 'r2', predicted: ASTHMA, actual: HEALTHY })
  })

  it('accounts for every excluded label, so none vanishes silently', () => {
    const set = buildScorableSet(
      [recording('r1', ASTHMA), recording('r2', ASTHMA), recording('r3')],
      [
        label('r1', GROUND_TRUTH_STATUSES.INCORRECT),
        label('r2', GROUND_TRUTH_STATUSES.NO_REFERENCE_AVAILABLE),
        label('r3', GROUND_TRUTH_STATUSES.CORRECT, ASTHMA),
      ],
    )

    expect(set.pairs).toHaveLength(0)
    expect(set.excluded[GROUND_TRUTH_STATUSES.INCORRECT]).toBe(1)
    expect(set.excluded[GROUND_TRUTH_STATUSES.NO_REFERENCE_AVAILABLE]).toBe(1)
    expect(set.excluded.NO_PREDICTION).toBe(1)
  })

  it('ignores recordings that were never labelled at all', () => {
    const set = buildScorableSet([recording('r1', ASTHMA)], [])
    expect(set.pairs).toHaveLength(0)
    expect(Object.values(set.excluded).every((count) => count === 0)).toBe(true)
  })
})

describe('saveResearchLabel', () => {
  it('never modifies the recording it labels', async () => {
    await seedDemoData(db, { now: NOW })
    const before = (await db.recordings.toArray()).find((r) => r.aiClassification !== undefined)!

    await saveResearchLabel(
      {
        recordingId: before.id,
        groundTruthStatus: GROUND_TRUTH_STATUSES.MODIFIED,
        labelCode: before.aiClassification === ASTHMA ? HEALTHY : ASTHMA,
        labeledBy: 'researcher-1',
      },
      db,
    )

    await expect(db.recordings.get(before.id)).resolves.toEqual(before)
  })

  it('stores who labelled it and when', async () => {
    const saved = await saveResearchLabel(
      {
        recordingId: 'r1',
        groundTruthStatus: GROUND_TRUTH_STATUSES.UNCERTAIN,
        labeledBy: 'researcher-7',
        labeledAt: '2026-08-29T09:00:00.000Z',
      },
      db,
    )
    expect(saved.labeledBy).toBe('researcher-7')
    expect(saved.labeledAt).toBe('2026-08-29T09:00:00.000Z')
    await expect(readLabelFor('r1', db)).resolves.toMatchObject({ labeledBy: 'researcher-7' })
  })

  it('replaces rather than duplicating when a recording is re-labelled', async () => {
    const first = await saveResearchLabel(
      { recordingId: 'r1', groundTruthStatus: GROUND_TRUTH_STATUSES.UNCERTAIN, labeledBy: 'a' },
      db,
    )
    const second = await saveResearchLabel(
      {
        recordingId: 'r1',
        groundTruthStatus: GROUND_TRUTH_STATUSES.MODIFIED,
        labelCode: HEALTHY,
        labeledBy: 'b',
      },
      db,
    )

    expect(await db.researchLabels.count()).toBe(1)
    expect(second.id).toBe(first.id)
    expect((await readLabelFor('r1', db))?.labelCode).toBe(HEALTHY)
  })

  it('refuses a class on a status that cannot carry one', async () => {
    await expect(
      saveResearchLabel(
        {
          recordingId: 'r1',
          groundTruthStatus: GROUND_TRUTH_STATUSES.UNCERTAIN,
          labelCode: ASTHMA,
          labeledBy: 'a',
        },
        db,
      ),
    ).rejects.toThrow(/must not name a class/)
    expect(await db.researchLabels.count()).toBe(0)
  })

  it('refuses a status that requires a class without one', async () => {
    await expect(
      saveResearchLabel(
        { recordingId: 'r1', groundTruthStatus: GROUND_TRUTH_STATUSES.MODIFIED, labeledBy: 'a' },
        db,
      ),
    ).rejects.toThrow(/must name the true class/)
    expect(await db.researchLabels.count()).toBe(0)
  })
})

describe('readLabellingQueue', () => {
  it('puts unlabelled recordings first', async () => {
    await seedDemoData(db, { now: NOW })
    const all = await db.recordings.toArray()
    await saveResearchLabel(
      {
        recordingId: all[0].id,
        groundTruthStatus: GROUND_TRUTH_STATUSES.UNCERTAIN,
        labeledBy: 'r1',
      },
      db,
    )

    const queue = await readLabellingQueue(db, true, 500)
    const firstLabelledAt = queue.findIndex((row) => row.label !== null)
    const lastUnlabelledAt = queue.map((row) => row.label === null).lastIndexOf(true)
    expect(firstLabelledAt).toBeGreaterThan(lastUnlabelledAt)
  })

  it('is empty when demo mode hides everything', async () => {
    await seedDemoData(db, { now: NOW })
    expect(await readLabellingQueue(db, false)).toEqual([])
  })
})

describe('readPerformance', () => {
  it('reports insufficient data and no metrics when barely anything is labelled', async () => {
    await seedDemoData(db, { now: NOW })
    const withPrediction = (await db.recordings.toArray()).filter(
      (r) => r.aiClassification !== undefined,
    )
    for (const recording of withPrediction.slice(0, 3)) {
      await saveResearchLabel(
        {
          recordingId: recording.id,
          groundTruthStatus: GROUND_TRUTH_STATUSES.CORRECT,
          labelCode: recording.aiClassification,
          labeledBy: 'r1',
        },
        db,
      )
    }

    const view = await readPerformance(db, true)
    expect(view.report.scored).toBe(3)
    expect(view.report.sufficient).toBe(false)
  })

  it('scores once enough recordings carry both a prediction and a reference', async () => {
    await seedDemoData(db, { now: NOW })
    const withPrediction = (await db.recordings.toArray()).filter(
      (r) => r.aiClassification !== undefined,
    )
    for (const recording of withPrediction.slice(0, 25)) {
      await saveResearchLabel(
        {
          recordingId: recording.id,
          groundTruthStatus: GROUND_TRUTH_STATUSES.CORRECT,
          labelCode: recording.aiClassification,
          labeledBy: 'r1',
        },
        db,
      )
    }

    const view = await readPerformance(db, true)
    expect(view.report.scored).toBe(25)
    expect(view.report.sufficient).toBe(true)
    // Every label agreed with the model, so accuracy is exactly 1.
    expect(view.report.accuracy).toBe(1)
    expect(view.labelled).toBe(25)
  })
})
