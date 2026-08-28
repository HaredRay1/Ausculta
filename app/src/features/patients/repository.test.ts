import { beforeEach, describe, expect, it } from 'vitest'
import {
  CONSENT_STATUSES,
  RESPIRATORY_HISTORY_CODES,
  ROLES,
  SEX_CODES,
  USER_STATUSES,
} from '../../db/codes'
import { AuscultaDB } from '../../db/db'
import type { User } from '../../db/types'
import { DRAFT_EN_CONSENT_VERSION } from './consent'
import { isPatientId, isStudyId } from './ids'
import {
  PATIENT_AUDIT_ACTIONS,
  PATIENT_REPO_ERRORS,
  PatientError,
  createPatientRepository,
  type Actor,
} from './repository'

let db: AuscultaDB
let repo: ReturnType<typeof createPatientRepository>

const admin: Actor = { id: 'admin-1', role: ROLES.ADMIN }
const workerA: Actor = { id: 'worker-a', role: ROLES.HEALTH_WORKER }
const workerB: Actor = { id: 'worker-b', role: ROLES.HEALTH_WORKER }
const practitioner: Actor = { id: 'doc-1', role: ROLES.PRACTITIONER }
const researcher: Actor = { id: 'res-1', role: ROLES.RESEARCHER }

const demographics = {
  name: 'Maria Dela Cruz',
  birthDate: '1978-03-14',
  sex: SEX_CODES.FEMALE,
}

function newPatient(overrides: Record<string, unknown> = {}) {
  return { demographics, preferredLanguage: 'en', ...overrides }
}

async function seedUser(id: string, username: string, role: User['role']): Promise<User> {
  const user: User = {
    id,
    username,
    passwordHash: 'x',
    passwordSalt: 'x',
    iterations: 1,
    role,
    name: username,
    preferredLanguage: 'en',
    status: USER_STATUSES.ACTIVE,
    createdAt: new Date().toISOString(),
  }
  await db.users.add(user)
  return user
}

beforeEach(() => {
  db = new AuscultaDB(`ausculta-patients-${crypto.randomUUID()}`)
  repo = createPatientRepository(db)
})

describe('create', () => {
  it('round-trips a complete patient through Dexie', async () => {
    const created = await repo.create(newPatient(), workerA)
    const reloaded = await db.patients.get(created.id)

    expect(reloaded).toBeDefined()
    expect(reloaded?.name).toBe('Maria Dela Cruz')
    expect(reloaded?.birthDate).toBe('1978-03-14')
    expect(reloaded?.sex).toBe(SEX_CODES.FEMALE)
    expect(reloaded?.preferredLanguage).toBe('en')
    expect(reloaded?.isDemo).toBe(0)
    expect(reloaded?.consent).toBeNull()
    expect(new Date(reloaded?.createdAt ?? '').toISOString()).toBe(reloaded?.createdAt)
  })

  it('issues a clinic id and a separate study id', async () => {
    const created = await repo.create(newPatient(), workerA)
    expect(isPatientId(created.id)).toBe(true)
    expect(isStudyId(created.studyId)).toBe(true)
    expect(created.studyId).not.toBe(created.id)
  })

  it('gives every patient a different study id', async () => {
    const a = await repo.create(newPatient(), workerA)
    const b = await repo.create(newPatient(), workerA)
    expect(a.studyId).not.toBe(b.studyId)
    expect(a.id).not.toBe(b.id)
  })

  it('assigns the registering health worker, so they can see what they just made', async () => {
    // Without this a health worker registers a patient and the record vanishes
    // from their own list on the next screen.
    const created = await repo.create(newPatient(), workerA)
    expect(created.assignedHealthWorkerIds).toEqual([workerA.id])
    expect(created.assignedPractitionerIds).toEqual([])

    expect(await repo.get(created.id, workerA)).toBeDefined()
  })

  it('assigns a registering practitioner to the practitioner list instead', async () => {
    const created = await repo.create(newPatient(), practitioner)
    expect(created.assignedPractitionerIds).toEqual([practitioner.id])
    expect(created.assignedHealthWorkerIds).toEqual([])
  })

  it('leaves an admin-created patient unassigned', async () => {
    const created = await repo.create(newPatient(), admin)
    expect(created.assignedHealthWorkerIds).toEqual([])
    expect(created.assignedPractitionerIds).toEqual([])
  })

  it('refuses roles that have no business registering patients', async () => {
    for (const actor of [researcher, { id: 'pat-1', role: ROLES.PATIENT } as Actor]) {
      await expect(repo.create(newPatient(), actor)).rejects.toThrow(PatientError)
    }
  })

  it('rejects invalid demographics rather than storing them', async () => {
    await expect(
      repo.create(newPatient({ demographics: { ...demographics, birthDate: '2025-02-30' } }), workerA),
    ).rejects.toMatchObject({ code: PATIENT_REPO_ERRORS.INVALID_DEMOGRAPHICS })

    expect(await db.patients.count()).toBe(0)
  })

  it('stores history exactly as given, without pre-filling', async () => {
    // Absent means "not asked" and present:false means "asked, answered no".
    // Pre-filling the array would erase that distinction permanently.
    const created = await repo.create(
      newPatient({
        respiratoryHistory: [
          { code: RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, present: true },
          { code: RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT, present: false },
        ],
      }),
      workerA,
    )
    expect(created.respiratoryHistory).toHaveLength(2)
    expect(created.familyHistory).toEqual([])
  })

  it('rejects a history code outside the registry', async () => {
    await expect(
      repo.create(newPatient({ respiratoryHistory: [{ code: 'MADE_UP', present: true }] }), workerA),
    ).rejects.toMatchObject({ code: PATIENT_REPO_ERRORS.INVALID_HISTORY })
  })

  it('records consent at registration when it is given', async () => {
    const created = await repo.create(
      newPatient({
        consent: {
          status: CONSENT_STATUSES.GRANTED,
          documentVersion: DRAFT_EN_CONSENT_VERSION,
        },
      }),
      workerA,
    )
    expect(created.consent?.status).toBe(CONSENT_STATUSES.GRANTED)
    expect(created.consent?.language).toBe('en')
    expect(created.consent?.textVersion).toBe(DRAFT_EN_CONSENT_VERSION)
    expect(created.consent?.recordedBy).toBe(workerA.id)
  })

  it('writes an audit entry naming the actor and the patient', async () => {
    const created = await repo.create(newPatient(), workerA)
    const logs = await db.auditLogs.toArray()

    const entry = logs.find((l) => l.actionCode === PATIENT_AUDIT_ACTIONS.PATIENT_CREATED)
    expect(entry).toBeDefined()
    expect(entry?.userId).toBe(workerA.id)
    expect(entry?.patientId).toBe(created.id)
  })

  it('keeps patient names out of the audit log', async () => {
    // The audit trail records who did what to which record. Copying the name
    // into it just makes a second, less protected place the name lives.
    await repo.create(newPatient(), workerA)
    const logs = await db.auditLogs.toArray()
    expect(JSON.stringify(logs)).not.toContain('Maria')
  })
})

describe('role scoping', () => {
  it('hides one health worker’s patients from another', async () => {
    const mine = await repo.create(newPatient(), workerA)
    const theirs = await repo.create(newPatient(), workerB)

    const aList = await repo.list(workerA)
    expect(aList.map((p) => p.id)).toEqual([mine.id])

    expect(await repo.get(theirs.id, workerA)).toBeUndefined()
  })

  it('does not leak existence through get', async () => {
    // Returning undefined rather than throwing "forbidden" means a worker
    // cannot probe for whether a given clinic id is registered elsewhere.
    const theirs = await repo.create(newPatient(), workerB)
    expect(await repo.get(theirs.id, workerA)).toBeUndefined()
    expect(await repo.get('PT-0000-0000', workerA)).toBeUndefined()
  })

  it('shows an admin everything', async () => {
    await repo.create(newPatient(), workerA)
    await repo.create(newPatient(), workerB)
    expect(await repo.list(admin)).toHaveLength(2)
  })

  it('shows a practitioner only patients assigned to them', async () => {
    const p = await repo.create(newPatient(), workerA)
    expect(await repo.list(practitioner)).toHaveLength(0)

    await repo.assign(p.id, { practitionerIds: [practitioner.id] }, admin)
    expect(await repo.list(practitioner)).toHaveLength(1)
  })

  it('shows a patient only their own record', async () => {
    const mine = await repo.create(newPatient(), workerA)
    await repo.create(newPatient(), workerA)
    await seedUser('pat-1', 'maria', ROLES.PATIENT)
    await repo.linkAccount(mine.id, 'maria', workerA)

    const asPatient: Actor = { id: 'pat-1', role: ROLES.PATIENT }
    const list = await repo.list(asPatient)
    expect(list.map((p) => p.id)).toEqual([mine.id])
  })

  it('shows a researcher no identified records at all', async () => {
    // Researchers get de-identified exports, not the clinic register. Handing
    // them named records here would defeat the studyId split entirely.
    await repo.create(newPatient(), workerA)
    expect(await repo.list(researcher)).toEqual([])
    expect(await repo.search('Maria', researcher)).toEqual([])
  })

  it('scopes search rather than filtering a global result', async () => {
    const mine = await repo.create(newPatient(), workerA)
    await repo.create(newPatient({ demographics: { ...demographics, name: 'Maria Santos' } }), workerB)

    const results = await repo.search('Maria', workerA)
    expect(results.map((p) => p.id)).toEqual([mine.id])
  })

  it('refuses writes to a patient the actor cannot see', async () => {
    const theirs = await repo.create(newPatient(), workerB)
    await expect(
      repo.update(theirs.id, { preferredLanguage: 'fil' }, workerA),
    ).rejects.toMatchObject({ code: PATIENT_REPO_ERRORS.NOT_FOUND })
  })
})

describe('search', () => {
  beforeEach(async () => {
    await repo.create(newPatient(), workerA)
    await repo.create(newPatient({ demographics: { ...demographics, name: 'Juan Santos' } }), workerA)
  })

  it('matches on partial name, case-insensitively', async () => {
    expect(await repo.search('maria', workerA)).toHaveLength(1)
    expect(await repo.search('SANTOS', workerA)).toHaveLength(1)
    expect(await repo.search('a', workerA)).toHaveLength(2)
  })

  it('matches on clinic id, however it was typed', async () => {
    const [first] = await repo.list(workerA)
    expect(first).toBeDefined()
    if (first === undefined) return

    expect((await repo.search(first.id, workerA)).map((p) => p.id)).toEqual([first.id])
    expect((await repo.search(first.id.toLowerCase(), workerA)).map((p) => p.id)).toEqual([first.id])
    expect((await repo.search(first.id.replace(/-/g, ''), workerA)).map((p) => p.id)).toEqual([
      first.id,
    ])
  })

  it('returns the whole visible list for an empty query', async () => {
    expect(await repo.search('   ', workerA)).toHaveLength(2)
  })

  it('never searches by study id', async () => {
    // The study id belongs to the research export. Making it searchable in the
    // clinic would hand anyone a re-identification lookup.
    const [first] = await repo.list(workerA)
    if (first === undefined) return
    expect(await repo.search(first.studyId, workerA)).toEqual([])
  })
})

describe('update', () => {
  it('applies validated changes and keeps the identifiers', async () => {
    const created = await repo.create(newPatient(), workerA)
    const updated = await repo.update(
      created.id,
      { demographics: { ...demographics, name: 'Maria Dela Cruz-Reyes', contact: '09171234567' } },
      workerA,
    )

    expect(updated.name).toBe('Maria Dela Cruz-Reyes')
    expect(updated.contact).toBe('09171234567')
    expect(updated.id).toBe(created.id)
    expect(updated.studyId).toBe(created.studyId)
    expect(updated.createdAt).toBe(created.createdAt)
  })

  it('rejects invalid changes without touching the stored record', async () => {
    const created = await repo.create(newPatient(), workerA)
    await expect(
      repo.update(created.id, { demographics: { ...demographics, name: '' } }, workerA),
    ).rejects.toMatchObject({ code: PATIENT_REPO_ERRORS.INVALID_DEMOGRAPHICS })

    expect((await db.patients.get(created.id))?.name).toBe('Maria Dela Cruz')
  })

  it('audits which fields changed, but not what they changed to', async () => {
    const created = await repo.create(newPatient(), workerA)
    await repo.update(created.id, { preferredLanguage: 'fil' }, workerA)

    const entry = (await db.auditLogs.toArray()).find(
      (l) => l.actionCode === PATIENT_AUDIT_ACTIONS.PATIENT_UPDATED,
    )
    expect(entry?.detail).toMatchObject({ changed: ['preferredLanguage'] })
    expect(JSON.stringify(entry)).not.toContain('fil')
  })
})

describe('consent recording', () => {
  it('stores the language and version of the text presented', async () => {
    const created = await repo.create(newPatient(), workerA)
    const updated = await repo.recordConsent(
      created.id,
      { status: CONSENT_STATUSES.GRANTED, documentVersion: DRAFT_EN_CONSENT_VERSION },
      workerA,
    )

    expect(updated.consent).toEqual({
      status: CONSENT_STATUSES.GRANTED,
      language: 'en',
      textVersion: DRAFT_EN_CONSENT_VERSION,
      presentedAt: expect.any(String),
      recordedBy: workerA.id,
    })
  })

  it('records the acting user as the recorder, not whoever is passed in', async () => {
    const created = await repo.create(newPatient(), workerA)
    // The practitioner has to be able to see the record before they can take
    // consent on it — scoping applies to consent like any other write.
    await repo.assign(created.id, { practitionerIds: [practitioner.id] }, workerA)
    const updated = await repo.recordConsent(
      created.id,
      { status: CONSENT_STATUSES.GRANTED, documentVersion: DRAFT_EN_CONSENT_VERSION },
      practitioner,
    )
    expect(updated.consent?.recordedBy).toBe(practitioner.id)
  })

  it('refuses an unknown document version', async () => {
    const created = await repo.create(newPatient(), workerA)
    await expect(
      repo.recordConsent(created.id, { status: CONSENT_STATUSES.GRANTED, documentVersion: 'nope' }, workerA),
    ).rejects.toMatchObject({ code: PATIENT_REPO_ERRORS.INVALID_CONSENT })
  })

  it('records a withdrawal over an existing grant', async () => {
    const created = await repo.create(newPatient(), workerA)
    await repo.recordConsent(
      created.id,
      { status: CONSENT_STATUSES.GRANTED, documentVersion: DRAFT_EN_CONSENT_VERSION },
      workerA,
    )
    const withdrawn = await repo.recordConsent(
      created.id,
      { status: CONSENT_STATUSES.WITHDRAWN, documentVersion: DRAFT_EN_CONSENT_VERSION },
      workerA,
    )
    expect(withdrawn.consent?.status).toBe(CONSENT_STATUSES.WITHDRAWN)
  })

  it('audits consent separately from an ordinary update', async () => {
    const created = await repo.create(newPatient(), workerA)
    await repo.recordConsent(
      created.id,
      { status: CONSENT_STATUSES.DECLINED, documentVersion: DRAFT_EN_CONSENT_VERSION },
      workerA,
    )
    const entry = (await db.auditLogs.toArray()).find(
      (l) => l.actionCode === PATIENT_AUDIT_ACTIONS.PATIENT_CONSENT_RECORDED,
    )
    expect(entry).toBeDefined()
    expect(entry?.detail).toMatchObject({
      status: CONSENT_STATUSES.DECLINED,
      textVersion: DRAFT_EN_CONSENT_VERSION,
    })
  })
})

describe('assignment', () => {
  it('adds a practitioner without disturbing the health worker', async () => {
    const created = await repo.create(newPatient(), workerA)
    const assigned = await repo.assign(created.id, { practitionerIds: [practitioner.id] }, workerA)

    expect(assigned.assignedPractitionerIds).toEqual([practitioner.id])
    expect(assigned.assignedHealthWorkerIds).toEqual([workerA.id])
  })

  it('is idempotent', async () => {
    const created = await repo.create(newPatient(), workerA)
    await repo.assign(created.id, { practitionerIds: [practitioner.id] }, admin)
    const twice = await repo.assign(created.id, { practitionerIds: [practitioner.id] }, admin)
    expect(twice.assignedPractitionerIds).toEqual([practitioner.id])
  })

  it('lets a health worker refer upward but not unassign', async () => {
    const created = await repo.create(newPatient(), workerA)
    await repo.assign(created.id, { practitionerIds: [practitioner.id] }, workerA)

    await expect(
      repo.unassign(created.id, { practitionerIds: [practitioner.id] }, workerA),
    ).rejects.toMatchObject({ code: PATIENT_REPO_ERRORS.NOT_PERMITTED })
  })

  it('lets a practitioner or admin unassign', async () => {
    const created = await repo.create(newPatient(), workerA)
    await repo.assign(created.id, { practitionerIds: [practitioner.id] }, admin)
    const after = await repo.unassign(created.id, { practitionerIds: [practitioner.id] }, admin)
    expect(after.assignedPractitionerIds).toEqual([])
  })

  it('audits both directions', async () => {
    const created = await repo.create(newPatient(), workerA)
    await repo.assign(created.id, { healthWorkerIds: [workerB.id] }, admin)
    await repo.unassign(created.id, { healthWorkerIds: [workerB.id] }, admin)

    const codes = (await db.auditLogs.toArray()).map((l) => l.actionCode)
    expect(codes).toContain(PATIENT_AUDIT_ACTIONS.PATIENT_ASSIGNED)
    expect(codes).toContain(PATIENT_AUDIT_ACTIONS.PATIENT_UNASSIGNED)
  })

  it('cannot be used to reach a patient the actor cannot see', async () => {
    const theirs = await repo.create(newPatient(), workerB)
    await expect(
      repo.assign(theirs.id, { healthWorkerIds: [workerA.id] }, workerA),
    ).rejects.toMatchObject({ code: PATIENT_REPO_ERRORS.NOT_FOUND })
  })
})

describe('linking a patient login account', () => {
  beforeEach(async () => {
    await seedUser('pat-1', 'maria', ROLES.PATIENT)
  })

  it('links by username and records it', async () => {
    const created = await repo.create(newPatient(), workerA)
    const linked = await repo.linkAccount(created.id, 'maria', workerA)

    expect(linked.linkedUserId).toBe('pat-1')
    const codes = (await db.auditLogs.toArray()).map((l) => l.actionCode)
    expect(codes).toContain(PATIENT_AUDIT_ACTIONS.PATIENT_ACCOUNT_LINKED)
  })

  it('accepts the username however it was typed', async () => {
    const created = await repo.create(newPatient(), workerA)
    const linked = await repo.linkAccount(created.id, '  MARIA  ', workerA)
    expect(linked.linkedUserId).toBe('pat-1')
  })

  it('refuses an unknown username', async () => {
    const created = await repo.create(newPatient(), workerA)
    await expect(repo.linkAccount(created.id, 'nobody', workerA)).rejects.toMatchObject({
      code: PATIENT_REPO_ERRORS.USER_NOT_FOUND,
    })
  })

  it('refuses to link an account that is not a patient account', async () => {
    await seedUser('doc-9', 'drjose', ROLES.PRACTITIONER)
    const created = await repo.create(newPatient(), workerA)
    await expect(repo.linkAccount(created.id, 'drjose', workerA)).rejects.toMatchObject({
      code: PATIENT_REPO_ERRORS.USER_NOT_A_PATIENT,
    })
  })

  it('refuses to link one account to two patient records', async () => {
    // Two records sharing a login would show one patient another's recordings.
    const first = await repo.create(newPatient(), workerA)
    const second = await repo.create(newPatient(), workerA)
    await repo.linkAccount(first.id, 'maria', workerA)

    await expect(repo.linkAccount(second.id, 'maria', workerA)).rejects.toMatchObject({
      code: PATIENT_REPO_ERRORS.USER_ALREADY_LINKED,
    })
  })

  it('unlinks and audits', async () => {
    const created = await repo.create(newPatient(), workerA)
    await repo.linkAccount(created.id, 'maria', workerA)
    const unlinked = await repo.unlinkAccount(created.id, workerA)

    expect(unlinked.linkedUserId).toBeUndefined()
    const codes = (await db.auditLogs.toArray()).map((l) => l.actionCode)
    expect(codes).toContain(PATIENT_AUDIT_ACTIONS.PATIENT_ACCOUNT_UNLINKED)
  })
})
