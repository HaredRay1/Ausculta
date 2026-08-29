import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AUDIT_ACTIONS, ANONYMOUS_ACTOR, logAction } from '../../audit/audit'
import { AuthProvider } from '../../auth/AuthContext'
import type { AuthService } from '../../auth/authService'
import { registerAuthResources } from '../../auth/i18n'
import { createTestAuthService } from '../../auth/testing'
import { ROLES, SEVERITY_CATEGORIES, USER_STATUSES } from '../../db/codes'
import { AuscultaDB } from '../../db/db'
import { i18n as appI18n } from '../../i18n'
import { AuditLogPage, AUDIT_PAGE_SIZE } from './AuditLogPage'
import { ConfigPage } from './ConfigPage'
import { TranslationsPage } from './TranslationsPage'
import { registerAdminResources } from './i18n'
import {
  CONFIG_ERRORS,
  CONFIG_AUDIT_ACTIONS,
  ConfigError,
  DEFAULT_CLINICAL_CONFIG,
  createConfigStore,
  type ConfigStore,
} from './config'

registerAdminResources(appI18n)
registerAuthResources(appI18n)

const t = (key: string, options?: Record<string, unknown>) => appI18n.t(`admin:${key}`, options)
const PASSWORD = 'clinic-pass-1'

let db: AuscultaDB
let auth: AuthService
let store: ConfigStore
let adminId: string

beforeEach(async () => {
  db = new AuscultaDB(`ausculta-admin-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
  store = createConfigStore(db)

  const admin = await auth.bootstrapAdmin({ password: PASSWORD, name: 'Site Administrator' })
  adminId = admin.id
  await auth.login('admin', PASSWORD)
})

afterEach(cleanup)

function renderAdmin(element: React.ReactNode) {
  return render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter initialEntries={['/admin/config']}>{element}</MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

describe('clinical configuration store', () => {
  it('starts at the documented default when nothing has been saved', async () => {
    const config = await store.read()

    expect(config.version).toBe(DEFAULT_CLINICAL_CONFIG.version)
    expect(config.idleTimeoutMinutes).toBe(30)
    expect(config.updatedBy).toBe('DEFAULT')
  })

  it('bumps the version on every accepted change', async () => {
    const first = await store.update(adminId, { idleTimeoutMinutes: 15 })
    expect(first.version).toBe(DEFAULT_CLINICAL_CONFIG.version + 1)

    const second = await store.update(adminId, { idleTimeoutMinutes: 20 })
    expect(second.version).toBe(first.version + 1)
    await expect(store.currentVersion()).resolves.toBe(second.version)
  })

  it('persists the change', async () => {
    await store.update(adminId, { idleTimeoutMinutes: 12 })

    await expect(createConfigStore(db).read()).resolves.toMatchObject({
      idleTimeoutMinutes: 12,
    })
  })

  it('records who changed it, and from what to what', async () => {
    await store.update(adminId, { idleTimeoutMinutes: 45 })

    const entry = await db.auditLogs
      .where('actionCode')
      .equals(CONFIG_AUDIT_ACTIONS.CONFIG_UPDATED)
      .first()

    expect(entry).toMatchObject({ userId: adminId, entityType: 'clinicalConfig' })
    // "Config changed" cannot answer the question anyone actually asks.
    const detail = entry?.detail as {
      fromVersion: number
      toVersion: number
      before: { idleTimeoutMinutes: number }
      after: { idleTimeoutMinutes: number }
    }
    expect(detail.before.idleTimeoutMinutes).toBe(30)
    expect(detail.after.idleTimeoutMinutes).toBe(45)
    expect(detail.toVersion).toBe(detail.fromVersion + 1)
  })

  it('refuses a change from a non-administrator', async () => {
    const worker = await auth.register({
      username: 'ana.reyes',
      password: PASSWORD,
      role: ROLES.HEALTH_WORKER,
      name: 'Ana Reyes',
    })
    await db.users.update(worker.id, { status: USER_STATUSES.ACTIVE })

    await expect(store.update(worker.id, { idleTimeoutMinutes: 5 })).rejects.toMatchObject({
      code: CONFIG_ERRORS.NOT_AUTHORISED,
    })
    await expect(store.currentVersion()).resolves.toBe(DEFAULT_CLINICAL_CONFIG.version)
  })

  it.each([0, -1, 481, 12.5])('rejects an idle timeout of %s minutes', async (minutes) => {
    await expect(
      store.update(adminId, { idleTimeoutMinutes: minutes }),
    ).rejects.toBeInstanceOf(ConfigError)
  })

  it('refuses severity bands that are not strictly ascending', async () => {
    // A score falling into two bands at once would have its meaning decided by
    // array order, which is an implementation detail.
    await expect(
      store.update(adminId, {
        severityBands: [
          { code: SEVERITY_CATEGORIES.MINIMAL, minScore: 0 },
          { code: SEVERITY_CATEGORIES.MILD, minScore: 40 },
          { code: SEVERITY_CATEGORIES.MODERATE, minScore: 40 },
          { code: SEVERITY_CATEGORIES.HIGH, minScore: 60 },
          { code: SEVERITY_CATEGORIES.VERY_HIGH, minScore: 80 },
        ],
      }),
    ).rejects.toMatchObject({ code: CONFIG_ERRORS.BANDS_NOT_ASCENDING })
  })

  it('does not bump the version when a change is rejected', async () => {
    await expect(store.update(adminId, { idleTimeoutMinutes: 0 })).rejects.toBeInstanceOf(
      ConfigError,
    )

    await expect(store.currentVersion()).resolves.toBe(DEFAULT_CLINICAL_CONFIG.version)
    await expect(
      db.auditLogs.where('actionCode').equals(CONFIG_AUDIT_ACTIONS.CONFIG_UPDATED).count(),
    ).resolves.toBe(0)
  })
})

describe('ConfigPage', () => {
  it('saves a change and reports the new version', async () => {
    renderAdmin(<ConfigPage store={store} />)
    const field = await screen.findByLabelText(t('config.idleLabel'))

    fireEvent.change(field, { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: t('config.save') }))

    expect(
      await screen.findByText(t('config.saved', { version: 2 })),
    ).toBeInTheDocument()
    await expect(store.read()).resolves.toMatchObject({ idleTimeoutMinutes: 45, version: 2 })
  })

  it('explains a rejected change instead of silently keeping the old value', async () => {
    renderAdmin(<ConfigPage store={store} />)
    const field = await screen.findByLabelText(t('config.idleLabel'))

    fireEvent.change(field, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: t('config.save') }))

    expect(
      await screen.findByText(t(`error.${CONFIG_ERRORS.IDLE_TIMEOUT_OUT_OF_RANGE}`)),
    ).toBeInTheDocument()
  })

  it('shows the analysis thresholds without offering to edit them', async () => {
    renderAdmin(<ConfigPage store={store} />)
    await screen.findByLabelText(t('config.idleLabel'))

    // Compile-time constants in the classifier worker: a field here would
    // accept a value, save it, and change nothing about any verdict.
    expect(screen.getByText('CONFIDENCE_MEAN_MIN')).toBeInTheDocument()
    expect(screen.queryByLabelText('CONFIDENCE_MEAN_MIN')).not.toBeInTheDocument()
    expect(screen.getByText(t('config.thresholdsReadOnlyTitle'))).toBeInTheDocument()
  })

  it('says the severity bands drive nothing yet, rather than repeating how to edit them', async () => {
    renderAdmin(<ConfigPage store={store} />)
    await screen.findByLabelText(t('config.idleLabel'))

    // The not-connected panel first carried `severityIntro`, which is the
    // field help — it explained how to edit the bands instead of saying that
    // nothing reads them.
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(/no severity model exists yet/i)
    expect(note).not.toHaveTextContent(t('config.severityIntro'))
  })

  it('reports a failed read instead of spinning forever', async () => {
    const broken = {
      read: () => Promise.reject(new Error('io')),
      update: () => Promise.reject(new Error('io')),
      currentVersion: () => Promise.reject(new Error('io')),
    } as unknown as ConfigStore

    renderAdmin(<ConfigPage store={broken} />)

    expect(await screen.findByText(t('config.loadFailed'))).toBeInTheDocument()
  })
})

describe('AuditLogPage', () => {
  async function seedEntries(count: number, actionCode = AUDIT_ACTIONS.LOGIN_SUCCESS) {
    for (let i = 0; i < count; i += 1) {
      await logAction({ userId: adminId, actionCode }, db)
    }
  }

  it('shows what has been recorded, newest first', async () => {
    await logAction({ userId: adminId, actionCode: AUDIT_ACTIONS.ACCOUNT_VERIFIED }, db)
    renderAdmin(<AuditLogPage database={db} />)

    const entries = await screen.findByRole('list', { name: t('audit.title') })
    expect(
      within(entries).getByText(appI18n.t(`auth:auditAction.${AUDIT_ACTIONS.ACCOUNT_VERIFIED}`)),
    ).toBeInTheDocument()
  })

  it('paginates rather than rendering the whole table', async () => {
    await seedEntries(AUDIT_PAGE_SIZE + 10)
    renderAdmin(<AuditLogPage database={db} />)

    const next = await screen.findByRole('button', { name: t('audit.next') })
    expect(screen.getByRole('button', { name: t('audit.previous') })).toBeDisabled()

    fireEvent.click(next)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('audit.previous') })).toBeEnabled()
    })
  })

  it('filters by action, and says so when nothing matches', async () => {
    await logAction({ userId: adminId, actionCode: AUDIT_ACTIONS.LOGIN_SUCCESS }, db)
    await logAction({ userId: adminId, actionCode: AUDIT_ACTIONS.LOGOUT }, db)
    renderAdmin(<AuditLogPage database={db} />)

    const filter = await screen.findByLabelText(t('audit.filterAction'))
    fireEvent.change(filter, { target: { value: AUDIT_ACTIONS.LOGOUT } })

    await waitFor(() => {
      const entries = screen.getByRole('list', { name: t('audit.title') })
      expect(
        within(entries).queryByText(appI18n.t(`auth:auditAction.${AUDIT_ACTIONS.LOGIN_SUCCESS}`)),
      ).not.toBeInTheDocument()
    })
    const entries = screen.getByRole('list', { name: t('audit.title') })
    expect(
      within(entries).getAllByText(appI18n.t(`auth:auditAction.${AUDIT_ACTIONS.LOGOUT}`)).length,
    ).toBeGreaterThan(0)
  })

  it('resolves an actor id to a name', async () => {
    await logAction({ userId: adminId, actionCode: AUDIT_ACTIONS.LOGIN_SUCCESS }, db)
    renderAdmin(<AuditLogPage database={db} />)

    // Bootstrap and sign-in already logged several rows for this admin, so the
    // name legitimately appears more than once.
    const entries = await screen.findByRole('list', { name: t('audit.title') })
    expect(
      within(entries).getAllByText(t('audit.byWhom', { name: 'Site Administrator' })).length,
    ).toBeGreaterThan(0)
    expect(within(entries).queryByText(adminId)).not.toBeInTheDocument()
  })

  it('labels a failed sign-in rather than inventing an account for it', async () => {
    await logAction(
      { userId: ANONYMOUS_ACTOR, actionCode: AUDIT_ACTIONS.LOGIN_FAILED },
      db,
    )
    renderAdmin(<AuditLogPage database={db} />)

    expect(
      await screen.findByText(t('audit.byWhom', { name: t('audit.anonymous') })),
    ).toBeInTheDocument()
  })

  it('says the log could not be read, rather than that nothing happened', async () => {
    const broken = {
      auditLogs: { orderBy: () => ({ reverse: () => ({ toArray: () => Promise.reject(new Error('io')) }) }) },
      users: { toArray: () => Promise.resolve([]) },
      patients: { toArray: () => Promise.resolve([]) },
    } as unknown as AuscultaDB

    renderAdmin(<AuditLogPage database={broken} />)

    // "Could not be read" and "nothing was recorded" are different facts, and
    // on the accountability record the difference is the whole point.
    expect(await screen.findByText(t('audit.loadFailed'))).toBeInTheDocument()
    expect(screen.queryByText(t('audit.empty'))).not.toBeInTheDocument()
  })

  it('returns to the first page when a filter changes', async () => {
    await seedEntries(AUDIT_PAGE_SIZE + 5)
    renderAdmin(<AuditLogPage database={db} />)

    fireEvent.click(await screen.findByRole('button', { name: t('audit.next') }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('audit.previous') })).toBeEnabled()
    })

    fireEvent.change(screen.getByLabelText(t('audit.filterAction')), {
      target: { value: AUDIT_ACTIONS.LOGIN_SUCCESS },
    })

    // Page 2 of a narrower result set is usually empty, which reads as
    // "nothing found".
    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('audit.previous') })).toBeDisabled()
    })
  })
})

describe('TranslationsPage', () => {
  it('lists the most-needed missing text first', async () => {
    await db.missingTranslations.bulkPut([
      { key: 'common:rare', language: 'fil', count: 1, lastSeen: '2026-08-29T00:00:00.000Z' },
      { key: 'common:everywhere', language: 'fil', count: 40, lastSeen: '2026-08-29T00:00:00.000Z' },
    ])
    renderAdmin(<TranslationsPage database={db} />)

    const keys = await screen.findAllByText(/^common:/)
    // Ordering is the point: the key needed forty times is on a screen
    // everybody reaches.
    expect(keys[0]).toHaveTextContent('common:everywhere')
  })

  it('shows how often and when each was needed', async () => {
    await db.missingTranslations.put({
      key: 'common:greeting',
      language: 'fil',
      count: 7,
      lastSeen: '2026-08-29T00:00:00.000Z',
    })
    renderAdmin(<TranslationsPage database={db} />)

    await screen.findByText('common:greeting')
    expect(screen.getByText(`${t('translations.count')}: 7`)).toBeInTheDocument()
    expect(screen.getByText(`${t('translations.language')}: fil`)).toBeInTheDocument()
  })

  it('does not claim nothing is missing when the read failed', async () => {
    const broken = {
      missingTranslations: { toArray: () => Promise.reject(new Error('io')) },
    } as unknown as AuscultaDB

    renderAdmin(<TranslationsPage database={broken} />)

    // Reporting "nothing is missing" on a failure would be actively
    // reassuring about the opposite of what happened.
    expect(await screen.findByText(t('translations.loadFailed'))).toBeInTheDocument()
    expect(screen.queryByText(t('translations.empty'))).not.toBeInTheDocument()
  })

  it('says plainly when nothing is missing', async () => {
    renderAdmin(<TranslationsPage database={db} />)

    expect(await screen.findByText(t('translations.empty'))).toBeInTheDocument()
  })
})
