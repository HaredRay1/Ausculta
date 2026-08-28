import { beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../../../db/db'
import type { Patient } from '../../../db/types'
import {
  DEMO_MODE_META_KEY,
  clearDemoMode,
  readDemoMode,
  setDemoMode,
  toggleDemoMode,
} from '../demoMode'
import { demoRowsOnly, isDemoRow, isVisible, keepVisible, visibleRows } from '../visibility'

let db: AuscultaDB

beforeEach(() => {
  db = new AuscultaDB(`ausculta-demo-vis-${crypto.randomUUID()}`)
})

function patient(id: string, isDemo: 0 | 1): Patient {
  return {
    id,
    studyId: `ST-${id}`,
    name: id,
    birthDate: '1990-01-01',
    sex: 'FEMALE',
    assignedPractitionerIds: [],
    assignedHealthWorkerIds: [],
    consent: null,
    respiratoryHistory: [],
    familyHistory: [],
    preferredLanguage: 'en',
    isDemo,
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

describe('demo mode store', () => {
  it('is off on a device that has never been told otherwise', async () => {
    await expect(readDemoMode(db)).resolves.toBe(false)
  })

  it('persists both directions', async () => {
    await setDemoMode(true, db)
    await expect(readDemoMode(db)).resolves.toBe(true)

    await setDemoMode(false, db)
    await expect(readDemoMode(db)).resolves.toBe(false)
  })

  it('toggles', async () => {
    await expect(toggleDemoMode(db)).resolves.toBe(true)
    await expect(toggleDemoMode(db)).resolves.toBe(false)
  })

  it('clears back to the default', async () => {
    await setDemoMode(true, db)
    await clearDemoMode(db)

    expect(await db.appMeta.get(DEMO_MODE_META_KEY)).toBeUndefined()
    await expect(readDemoMode(db)).resolves.toBe(false)
  })

  it('reads a corrupted value as off rather than exposing fictional records', async () => {
    await db.appMeta.put({ key: DEMO_MODE_META_KEY, value: 'yes please' })
    await expect(readDemoMode(db)).resolves.toBe(false)

    await db.appMeta.put({ key: DEMO_MODE_META_KEY, value: 1 })
    await expect(readDemoMode(db)).resolves.toBe(false)
  })
})

describe('visibleRows', () => {
  beforeEach(async () => {
    await db.patients.bulkPut([
      patient('PT-REAL-1', 0),
      patient('PT-REAL-2', 0),
      patient('PT-DEMO-1', 1),
      patient('PT-DEMO-2', 1),
      patient('PT-DEMO-3', 1),
    ])
  })

  it('hides every demo row with demo mode off', async () => {
    const visible = await visibleRows(db.patients, false).toArray()

    expect(visible.map((row) => row.id).sort()).toEqual(['PT-REAL-1', 'PT-REAL-2'])
    expect(visible.every((row) => row.isDemo === 0)).toBe(true)
  })

  it('shows everything with demo mode on', async () => {
    expect(await visibleRows(db.patients, true).count()).toBe(5)
  })

  it('counts the same way it lists, so a badge cannot disagree with a screen', async () => {
    expect(await visibleRows(db.patients, false).count()).toBe(2)
    expect((await visibleRows(db.patients, false).toArray()).length).toBe(2)
  })

  it('returns a collection that still supports the usual chaining', async () => {
    const sorted = await visibleRows(db.patients, true).sortBy('id')
    expect(sorted).toHaveLength(5)

    const narrowed = await visibleRows(db.patients, true)
      .and((row) => row.id.startsWith('PT-REAL'))
      .count()
    expect(narrowed).toBe(2)
  })

  it('keeps a row whose flag is missing, because it is far likelier to be real', async () => {
    // A row written by some older or buggier path, with no isDemo at all.
    const malformed = { ...patient('PT-LEGACY-1', 0) } as Partial<Patient>
    delete malformed.isDemo
    await db.patients.put(malformed as Patient)

    const ids = (await visibleRows(db.patients, false).toArray()).map((row) => row.id)
    expect(ids).toContain('PT-LEGACY-1')
  })
})

describe('demoRowsOnly', () => {
  beforeEach(async () => {
    await db.patients.bulkPut([patient('PT-REAL-1', 0), patient('PT-DEMO-1', 1)])
  })

  it('selects exactly the rows flagged as demo', async () => {
    const rows = await demoRowsOnly(db.patients).toArray()
    expect(rows.map((row) => row.id)).toEqual(['PT-DEMO-1'])
  })

  it('cannot reach a row whose flag is missing', async () => {
    const malformed = { ...patient('PT-LEGACY-1', 0) } as Partial<Patient>
    delete malformed.isDemo
    await db.patients.put(malformed as Patient)

    const ids = (await demoRowsOnly(db.patients).toArray()).map((row) => row.id)
    expect(ids).toEqual(['PT-DEMO-1'])
  })
})

describe('in-memory helpers', () => {
  const real = patient('PT-REAL-1', 0)
  const demo = patient('PT-DEMO-1', 1)

  it('isDemoRow only answers yes to an explicit flag', () => {
    expect(isDemoRow(demo)).toBe(true)
    expect(isDemoRow(real)).toBe(false)
    expect(isDemoRow({} as Patient)).toBe(false)
  })

  it('isVisible follows the switch', () => {
    expect(isVisible(real, false)).toBe(true)
    expect(isVisible(demo, false)).toBe(false)
    expect(isVisible(demo, true)).toBe(true)
  })

  it('keepVisible filters an already-loaded array the same way', () => {
    expect(keepVisible([real, demo], false)).toEqual([real])
    expect(keepVisible([real, demo], true)).toEqual([real, demo])
  })
})
