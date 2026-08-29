import { beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../../../db/db'
import { ROLES } from '../../../db/codes'
import type { Patient, User } from '../../../db/types'
import { syncDemoAssignments } from '../assignments'
import { ensureFirstRunDemo } from '../firstRun'
import { demoPatientId, seedDemoData } from '../seed'
import { visibleRows } from '../visibility'

let db: AuscultaDB

const NOW = Date.parse('2026-08-29T06:00:00.000Z')

beforeEach(() => {
  db = new AuscultaDB(`ausculta-demo-assign-${crypto.randomUUID()}`)
})

function user(id: string, role: User['role']): User {
  return {
    id,
    username: id,
    passwordHash: 'x',
    passwordSalt: 'y',
    iterations: 1,
    role,
    name: id,
    preferredLanguage: 'en',
    status: 'ACTIVE',
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

/**
 * The patient list's own scoping, reproduced here so this suite fails if
 * seeded patients ever stop being reachable by a signed-in clinician.
 */
async function patientsVisibleToHealthWorker(userId: string): Promise<Patient[]> {
  return visibleRows(db.patients, true)
    .and((patient) => patient.assignedHealthWorkerIds.includes(userId))
    .toArray()
}

async function patientsVisibleToPractitioner(userId: string): Promise<Patient[]> {
  return visibleRows(db.patients, true)
    .and((patient) => patient.assignedPractitionerIds.includes(userId))
    .toArray()
}

describe('syncDemoAssignments', () => {
  it('a signed-in health worker sees the seeded patients', async () => {
    await db.users.put(user('hw-1', ROLES.HEALTH_WORKER))
    await seedDemoData(db, { now: NOW })

    expect(await patientsVisibleToHealthWorker('hw-1')).toHaveLength(0)

    await syncDemoAssignments(db)

    const visible = await patientsVisibleToHealthWorker('hw-1')
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.every((patient) => patient.isDemo === 1)).toBe(true)
  })

  it('a signed-in practitioner sees the seeded patients', async () => {
    await db.users.put(user('dr-1', ROLES.PRACTITIONER))
    await seedDemoData(db, { now: NOW })
    await syncDemoAssignments(db)

    expect((await patientsVisibleToPractitioner('dr-1')).length).toBeGreaterThan(0)
  })

  it('an admin sees them from either screen', async () => {
    await db.users.put(user('admin-1', ROLES.ADMIN))
    await seedDemoData(db, { now: NOW })
    await syncDemoAssignments(db)

    expect((await patientsVisibleToHealthWorker('admin-1')).length).toBeGreaterThan(0)
    expect((await patientsVisibleToPractitioner('admin-1')).length).toBeGreaterThan(0)
  })

  it('keeps the fictional staff assigned alongside the real user', async () => {
    await seedDemoData(db, { now: NOW })
    const before = (await db.patients.get(demoPatientId(1)))!.assignedHealthWorkerIds

    await db.users.put(user('hw-1', ROLES.HEALTH_WORKER))
    await syncDemoAssignments(db)

    const after = (await db.patients.get(demoPatientId(1)))!.assignedHealthWorkerIds
    for (const staffId of before) expect(after).toContain(staffId)
    expect(after).toContain('hw-1')
  })

  it('is idempotent — running twice adds nothing and writes nothing', async () => {
    await db.users.put(user('hw-1', ROLES.HEALTH_WORKER))
    await seedDemoData(db, { now: NOW })

    const first = await syncDemoAssignments(db)
    const second = await syncDemoAssignments(db)

    expect(first.patientsUpdated).toBeGreaterThan(0)
    expect(second.patientsUpdated).toBe(0)

    const ids = (await db.patients.get(demoPatientId(1)))!.assignedHealthWorkerIds
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never touches a real patient', async () => {
    const real: Patient = {
      id: 'PT-REAL-0001',
      studyId: 'ST-REAL000000000001',
      name: 'Real Patient',
      birthDate: '1990-01-01',
      sex: 'FEMALE',
      assignedPractitionerIds: [],
      assignedHealthWorkerIds: [],
      consent: null,
      respiratoryHistory: [],
      familyHistory: [],
      preferredLanguage: 'en',
      isDemo: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
    }
    await db.patients.put(real)
    await db.users.put(user('hw-1', ROLES.HEALTH_WORKER))
    await seedDemoData(db, { now: NOW })

    await syncDemoAssignments(db)

    await expect(db.patients.get(real.id)).resolves.toEqual(real)
  })

  it('does nothing at all when no accounts exist yet', async () => {
    await seedDemoData(db, { now: NOW })
    const result = await syncDemoAssignments(db)
    expect(result.patientsUpdated).toBe(0)
  })

  it('NEVER links a demo patient to a real account', async () => {
    // The defect this replaces: a patient-role account was pointed at the
    // walkthrough case so validators would not meet an empty screen, and the
    // app then greeted a real person by the fictional patient's name, because
    // patientRepository resolves "my record" through linkedUserId.
    await db.users.put(user('patient-1', ROLES.PATIENT))
    await seedDemoData(db, { now: NOW })

    await syncDemoAssignments(db)

    const linked = (await db.patients.toArray()).filter(
      (patient) => patient.linkedUserId !== undefined,
    )
    expect(linked).toEqual([])
  })

  it('repairs a device that already carries the bad link', async () => {
    await db.users.put(user('patient-1', ROLES.PATIENT))
    await seedDemoData(db, { now: NOW })
    // Exactly the state an earlier build left behind.
    const target = (await db.patients.toArray())[0]
    await db.patients.put({ ...target, linkedUserId: 'patient-1' })

    const result = await syncDemoAssignments(db)

    expect(result.unlinkedFromRealAccounts).toBe(1)
    const repaired = await db.patients.get(target.id)
    expect(repaired?.linkedUserId).toBeUndefined()
    expect(Object.hasOwn(repaired!, 'linkedUserId')).toBe(false)
  })

  it('leaves a REAL patient linked to their own account', async () => {
    await db.users.put(user('patient-1', ROLES.PATIENT))
    await db.patients.put({
      id: 'PT-REAL-0001',
      studyId: 'ST-REAL000000000001',
      name: 'Real Patient',
      birthDate: '1990-01-01',
      sex: 'FEMALE',
      linkedUserId: 'patient-1',
      assignedPractitionerIds: [],
      assignedHealthWorkerIds: [],
      consent: null,
      respiratoryHistory: [],
      familyHistory: [],
      preferredLanguage: 'en',
      isDemo: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
    })
    await seedDemoData(db, { now: NOW })

    await syncDemoAssignments(db)

    const real = await db.patients.get('PT-REAL-0001')
    expect(real?.linkedUserId).toBe('patient-1')
  })

  it('does not give a patient account somebody else’s caseload', async () => {
    await db.users.put(user('patient-1', ROLES.PATIENT))
    await seedDemoData(db, { now: NOW })
    await syncDemoAssignments(db)

    expect(await patientsVisibleToHealthWorker('patient-1')).toHaveLength(0)
    expect(await patientsVisibleToPractitioner('patient-1')).toHaveLength(0)
  })
})

describe('ensureFirstRunDemo assignment behaviour', () => {
  it('assigns accounts created after the seed, on the next launch', async () => {
    // Launch 1: fresh device, nobody has an account yet.
    await ensureFirstRunDemo(db, NOW)
    expect(await db.patients.count()).toBeGreaterThan(0)

    // The owner sets up an account.
    await db.users.put(user('hw-1', ROLES.HEALTH_WORKER))
    expect(await patientsVisibleToHealthWorker('hw-1')).toHaveLength(0)

    // Launch 2: the same start-up call grants access.
    await ensureFirstRunDemo(db, NOW)

    expect((await patientsVisibleToHealthWorker('hw-1')).length).toBeGreaterThan(0)
  })

  it('assigns immediately when an account already exists at first launch', async () => {
    await db.users.put(user('hw-1', ROLES.HEALTH_WORKER))

    await ensureFirstRunDemo(db, NOW)

    expect((await patientsVisibleToHealthWorker('hw-1')).length).toBeGreaterThan(0)
  })
})
