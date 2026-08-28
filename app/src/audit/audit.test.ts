import { beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../db/db'
import { AUDIT_ACTIONS, createAuditLogger, logAction } from './audit'

let db: AuscultaDB

beforeEach(() => {
  db = new AuscultaDB(`ausculta-audit-test-${crypto.randomUUID()}`)
})

describe('logAction', () => {
  it('appends a row with an ISO timestamp and returns its seq', async () => {
    const seq = await logAction(
      { userId: 'user-1', actionCode: AUDIT_ACTIONS.LOGIN_SUCCESS },
      db,
    )

    expect(typeof seq).toBe('number')
    const row = await db.auditLogs.get(seq as number)
    expect(row).toMatchObject({ userId: 'user-1', actionCode: AUDIT_ACTIONS.LOGIN_SUCCESS })
    expect(row?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('carries the optional entity, patient and detail fields through', async () => {
    const seq = await logAction(
      {
        userId: 'user-1',
        actionCode: AUDIT_ACTIONS.ACCOUNT_VERIFIED,
        entityType: 'user',
        entityId: 'user-2',
        patientId: 'patient-9',
        detail: { previousStatus: 'PENDING_VERIFICATION' },
      },
      db,
    )

    const row = await db.auditLogs.get(seq as number)
    expect(row).toMatchObject({
      entityType: 'user',
      entityId: 'user-2',
      patientId: 'patient-9',
    })
    expect(row?.detail).toEqual({ previousStatus: 'PENDING_VERIFICATION' })
  })

  it('omits optional fields entirely rather than storing undefined', async () => {
    const seq = await logAction({ userId: 'user-1', actionCode: AUDIT_ACTIONS.LOGOUT }, db)

    const row = await db.auditLogs.get(seq as number)
    expect(Object.keys(row ?? {}).sort()).toEqual(['actionCode', 'seq', 'timestamp', 'userId'])
  })

  it('preserves the order of same-millisecond actions via the auto-increment seq', async () => {
    await logAction({ userId: 'u', actionCode: 'FIRST' }, db)
    await logAction({ userId: 'u', actionCode: 'SECOND' }, db)
    await logAction({ userId: 'u', actionCode: 'THIRD' }, db)

    const rows = await db.auditLogs.orderBy('seq').toArray()
    expect(rows.map((r) => r.actionCode)).toEqual(['FIRST', 'SECOND', 'THIRD'])
  })

  it('is queryable by the indexed userId and actionCode', async () => {
    await logAction({ userId: 'user-1', actionCode: AUDIT_ACTIONS.LOGIN_SUCCESS }, db)
    await logAction({ userId: 'user-2', actionCode: AUDIT_ACTIONS.LOGIN_FAILED }, db)

    await expect(db.auditLogs.where('userId').equals('user-1').count()).resolves.toBe(1)
    await expect(
      db.auditLogs.where('actionCode').equals(AUDIT_ACTIONS.LOGIN_FAILED).count(),
    ).resolves.toBe(1)
  })

  it('resolves null instead of throwing when the write fails', async () => {
    const brokenDb = {
      auditLogs: {
        add: async () => {
          throw new Error('quota exceeded')
        },
      },
    } as unknown as AuscultaDB

    await expect(
      logAction({ userId: 'user-1', actionCode: AUDIT_ACTIONS.LOGIN_SUCCESS }, brokenDb),
    ).resolves.toBeNull()
  })
})

describe('createAuditLogger', () => {
  it('binds the database so callers need not pass it every time', async () => {
    const log = createAuditLogger(db)

    await log({ userId: 'user-1', actionCode: AUDIT_ACTIONS.PASSWORD_CHANGED })

    await expect(db.auditLogs.count()).resolves.toBe(1)
  })
})
