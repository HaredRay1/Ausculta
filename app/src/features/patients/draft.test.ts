import { beforeEach, describe, expect, it } from 'vitest'
import { RESPIRATORY_HISTORY_CODES, SEX_CODES } from '../../db/codes'
import { AuscultaDB } from '../../db/db'
import {
  DRAFT_MAX_AGE_MS,
  createDraftStore,
  draftKeyFor,
  type RegistrationDraft,
} from './draft'

let db: AuscultaDB
let drafts: ReturnType<typeof createDraftStore>

const NOW = new Date('2026-08-29T09:00:00.000Z')

const partial: Omit<RegistrationDraft, 'updatedAt'> = {
  demographics: { name: 'Maria Dela', birthDate: '1978-03-14', sex: SEX_CODES.FEMALE },
  respiratoryHistory: [{ code: RESPIRATORY_HISTORY_CODES.CHRONIC_COUGH, present: true }],
  familyHistory: [],
  preferredLanguage: 'en',
}

beforeEach(() => {
  db = new AuscultaDB(`ausculta-draft-${crypto.randomUUID()}`)
  drafts = createDraftStore(db)
})

describe('registration draft', () => {
  it('survives navigating away and coming back', async () => {
    // The whole point: a health worker gets interrupted halfway through a long
    // form, leaves the screen, and must not lose what they already typed.
    await drafts.save('worker-a', partial, NOW)

    const reopened = createDraftStore(db) // as if the component remounted
    const restored = await reopened.load('worker-a', NOW)

    expect(restored?.demographics.name).toBe('Maria Dela')
    expect(restored?.respiratoryHistory).toHaveLength(1)
  })

  it('returns undefined when nothing was saved', async () => {
    expect(await drafts.load('worker-a', NOW)).toBeUndefined()
  })

  it('stamps the save time', async () => {
    await drafts.save('worker-a', partial, NOW)
    expect((await drafts.load('worker-a', NOW))?.updatedAt).toBe(NOW.toISOString())
  })

  it('overwrites rather than accumulating', async () => {
    await drafts.save('worker-a', partial, NOW)
    await drafts.save(
      'worker-a',
      { ...partial, demographics: { ...partial.demographics, name: 'Maria Dela Cruz' } },
      NOW,
    )
    expect((await drafts.load('worker-a', NOW))?.demographics.name).toBe('Maria Dela Cruz')
    expect(await db.appMeta.count()).toBe(1)
  })

  it('is cleared once the patient is actually registered', async () => {
    await drafts.save('worker-a', partial, NOW)
    await drafts.clear('worker-a')
    expect(await drafts.load('worker-a', NOW)).toBeUndefined()
    expect(await db.appMeta.count()).toBe(0)
  })

  it('clearing a draft that is not there is not an error', async () => {
    await expect(drafts.clear('worker-a')).resolves.toBeUndefined()
  })

  it('keeps one user’s draft away from another on a shared phone', async () => {
    // The clinic device is shared. Worker B opening the registration form must
    // not be handed a stranger's half-entered personal details.
    await drafts.save('worker-a', partial, NOW)
    expect(await drafts.load('worker-b', NOW)).toBeUndefined()
    expect(draftKeyFor('worker-a')).not.toBe(draftKeyFor('worker-b'))
  })

  it('discards a draft that has gone stale', async () => {
    // An abandoned draft is patient data sitting on a shared device with
    // nobody coming back for it. It should not outlive its usefulness.
    await drafts.save('worker-a', partial, NOW)

    const justInside = new Date(NOW.getTime() + DRAFT_MAX_AGE_MS - 1000)
    expect(await drafts.load('worker-a', justInside)).toBeDefined()

    const wellPast = new Date(NOW.getTime() + DRAFT_MAX_AGE_MS + 1000)
    expect(await drafts.load('worker-a', wellPast)).toBeUndefined()
  })

  it('deletes the stale draft rather than merely hiding it', async () => {
    await drafts.save('worker-a', partial, NOW)
    await drafts.load('worker-a', new Date(NOW.getTime() + DRAFT_MAX_AGE_MS + 1000))
    expect(await db.appMeta.count()).toBe(0)
  })

  it('survives a corrupted stored value instead of throwing', async () => {
    // A half-written record from a killed tab must not brick the form.
    await db.appMeta.put({ key: draftKeyFor('worker-a'), value: 'not a draft' })
    expect(await drafts.load('worker-a', NOW)).toBeUndefined()

    await db.appMeta.put({ key: draftKeyFor('worker-a'), value: { demographics: 42 } })
    expect(await drafts.load('worker-a', NOW)).toBeUndefined()
  })

  it('namespaces its keys so it cannot collide with other features', async () => {
    expect(draftKeyFor('worker-a')).toMatch(/^patients\./)
  })
})
