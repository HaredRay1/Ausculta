import { beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../../../db/db'
import type { AuditLog } from '../../../db/types'
import { i18n as appI18n } from '../../../i18n'
import {
  DEMO_AUDIT_ACTIONS,
  DEMO_AUDIT_ACTION_LIST,
  DEMO_SYSTEM_ACTOR,
} from '../audit'
import { clearDemoMode, setDemoMode, toggleDemoMode } from '../demoMode'
import { ensureFirstRunDemo } from '../firstRun'
import { registerDemoResources } from '../i18n'
import { resetDemoData, seedDemoData } from '../seed'

registerDemoResources(appI18n)

let db: AuscultaDB
const NOW = Date.parse('2026-08-29T06:00:00.000Z')
const RESEARCHER = 'user-researcher-1'

beforeEach(() => {
  db = new AuscultaDB(`ausculta-demo-audit-${crypto.randomUUID()}`)
})

const entries = async (): Promise<AuditLog[]> => db.auditLogs.toArray()
const codes = async (): Promise<string[]> => (await entries()).map((row) => row.actionCode)

describe('demo mode changes are recorded', () => {
  it('logs who turned demonstration data on', async () => {
    await setDemoMode(true, db, RESEARCHER)

    const [entry] = await entries()
    expect(entry.actionCode).toBe(DEMO_AUDIT_ACTIONS.DEMO_MODE_ENABLED)
    expect(entry.userId).toBe(RESEARCHER)
    expect(entry.entityType).toBe('demoMode')
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('logs turning it off', async () => {
    await setDemoMode(true, db, RESEARCHER)
    await setDemoMode(false, db, RESEARCHER)

    expect(await codes()).toEqual([
      DEMO_AUDIT_ACTIONS.DEMO_MODE_ENABLED,
      DEMO_AUDIT_ACTIONS.DEMO_MODE_DISABLED,
    ])
  })

  it('records nothing when the switch did not actually move', async () => {
    await setDemoMode(true, db, RESEARCHER)
    await setDemoMode(true, db, RESEARCHER)
    await setDemoMode(true, db, RESEARCHER)

    // Re-asserting the current state would otherwise bury the real events.
    expect(await codes()).toEqual([DEMO_AUDIT_ACTIONS.DEMO_MODE_ENABLED])
  })

  it('attributes an unattributed change to the system, not to a person', async () => {
    await setDemoMode(true, db)
    expect((await entries())[0].userId).toBe(DEMO_SYSTEM_ACTOR)
  })

  it('records a toggle under the actor who toggled it', async () => {
    await toggleDemoMode(db, RESEARCHER)
    expect((await entries())[0]).toMatchObject({
      actionCode: DEMO_AUDIT_ACTIONS.DEMO_MODE_ENABLED,
      userId: RESEARCHER,
    })
  })

  it('does not double-log when reset clears the switch', async () => {
    await setDemoMode(true, db, RESEARCHER)
    await clearDemoMode(db)

    // clearDemoMode is a side effect of reset, which writes its own entry.
    expect(await codes()).toEqual([DEMO_AUDIT_ACTIONS.DEMO_MODE_ENABLED])
  })
})

describe('seeding is recorded with what it wrote', () => {
  it('logs the counts, not just that it happened', async () => {
    const result = await seedDemoData(db, { now: NOW, actor: RESEARCHER })

    const seeded = (await entries()).filter(
      (row) => row.actionCode === DEMO_AUDIT_ACTIONS.DEMO_DATA_SEEDED,
    )
    expect(seeded).toHaveLength(1)
    expect(seeded[0].userId).toBe(RESEARCHER)

    const detail = seeded[0].detail as { written: typeof result.counts; datasetVersion: number }
    expect(detail.written).toEqual(result.counts)
    expect(detail.written.recordings).toBeGreaterThan(0)
    expect(typeof detail.datasetVersion).toBe('number')
  })

  it('does not log a seed that wrote nothing', async () => {
    await seedDemoData(db, { now: NOW, actor: RESEARCHER })
    const second = await seedDemoData(db, { now: NOW, actor: RESEARCHER })

    expect(second.seeded).toBe(false)
    expect(
      (await codes()).filter((code) => code === DEMO_AUDIT_ACTIONS.DEMO_DATA_SEEDED),
    ).toHaveLength(1)
  })

  it('records first-run setup as the system rather than as a person', async () => {
    await ensureFirstRunDemo(db, NOW)

    const seeded = (await entries()).find(
      (row) => row.actionCode === DEMO_AUDIT_ACTIONS.DEMO_DATA_SEEDED,
    )
    expect(seeded?.userId).toBe(DEMO_SYSTEM_ACTOR)
    // The automatic enable is recorded too, and also as the system.
    const enabled = (await entries()).find(
      (row) => row.actionCode === DEMO_AUDIT_ACTIONS.DEMO_MODE_ENABLED,
    )
    expect(enabled?.userId).toBe(DEMO_SYSTEM_ACTOR)
  })
})

describe('deletion is recorded with what it removed', () => {
  it('logs the reset and the row counts it deleted', async () => {
    await seedDemoData(db, { now: NOW, actor: RESEARCHER })
    const result = await resetDemoData(db, RESEARCHER)

    const reset = (await entries()).filter(
      (row) => row.actionCode === DEMO_AUDIT_ACTIONS.DEMO_DATA_RESET,
    )
    expect(reset).toHaveLength(1)
    expect(reset[0].userId).toBe(RESEARCHER)

    const detail = reset[0].detail as { removed: typeof result.deleted; demoModeCleared: boolean }
    expect(detail.removed).toEqual(result.deleted)
    // "It only deleted demo rows" is a claim the entry has to be able to
    // support, so the numbers have to be there rather than a bare event.
    expect(detail.removed.patients).toBeGreaterThan(0)
    expect(detail.removed.recordings).toBeGreaterThan(0)
    expect(detail.demoModeCleared).toBe(true)
  })

  it('logs a reset that found nothing to delete', async () => {
    await resetDemoData(db, RESEARCHER)

    const reset = (await entries()).filter(
      (row) => row.actionCode === DEMO_AUDIT_ACTIONS.DEMO_DATA_RESET,
    )
    // Someone pressed reset. That is worth recording whether or not it found
    // anything, otherwise the log cannot answer "did anyone try?".
    expect(reset).toHaveLength(1)
    expect((reset[0].detail as { removed: { patients: number } }).removed.patients).toBe(0)
  })
})

/**
 * The failure this guards against is silent.
 *
 * `auditLogs` is not in the scope of the transactions `seedDemoData` and
 * `resetDemoData` open, and `logAction` swallows its own errors and resolves
 * `null`. So writing the entry from inside either transaction would leave no
 * row and raise nothing — the exact gap these entries exist to close, restored
 * invisibly. Asserting the row is actually present is what catches it.
 */
describe('the entries actually reach the table', () => {
  it('survives the seed transaction', async () => {
    await seedDemoData(db, { now: NOW, actor: RESEARCHER })
    expect(await db.auditLogs.count()).toBeGreaterThan(0)
  })

  it('survives the reset transaction', async () => {
    await seedDemoData(db, { now: NOW, actor: RESEARCHER })
    const before = await db.auditLogs.count()
    await resetDemoData(db, RESEARCHER)
    expect(await db.auditLogs.count()).toBeGreaterThan(before)
  })

  it('leaves the audit trail behind after a reset deletes the demo data', async () => {
    await seedDemoData(db, { now: NOW, actor: RESEARCHER })
    await resetDemoData(db, RESEARCHER)

    expect(await db.patients.count()).toBe(0)
    // The record of what happened outlives the records it describes.
    expect(await codes()).toContain(DEMO_AUDIT_ACTIONS.DEMO_DATA_SEEDED)
    expect(await codes()).toContain(DEMO_AUDIT_ACTIONS.DEMO_DATA_RESET)
  })
})

describe('the vocabulary is displayable', () => {
  it('gives every demo audit action a display string', () => {
    for (const code of DEMO_AUDIT_ACTION_LIST) {
      const text = appI18n.t(`demo:auditAction.${code}`)
      expect(text).toBeTruthy()
      expect(text).not.toBe(`auditAction.${code}`)
    }
  })

  it('does not collide with an auth audit action code', async () => {
    const { AUDIT_ACTIONS } = await import('../../../audit/audit')
    for (const code of DEMO_AUDIT_ACTION_LIST) {
      expect(Object.values(AUDIT_ACTIONS)).not.toContain(code)
    }
  })
})
