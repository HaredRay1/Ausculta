import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../../db/db'
import { ROLES, USER_STATUSES } from '../../db/codes'
import { i18n as appI18n } from '../../i18n'
import { AuthProvider } from '../AuthContext'
import type { AuthService } from '../authService'
import { registerAuthResources } from '../i18n'
import { createTestAuthService } from '../testing'
import { adminRoutes } from '../../features/admin/routes'
import { authRoutes } from '../routes'

registerAuthResources(appI18n)

const PASSWORD = 'clinic-pass-1'
const ADMIN_PASSWORD = 'admin-pass-1'

let db: AuscultaDB
let auth: AuthService

beforeEach(() => {
  db = new AuscultaDB(`ausculta-pages-test-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
})

afterEach(cleanup)

const t = (key: string, options?: Record<string, unknown>) => appI18n.t(`auth:${key}`, options)

/** Mounts the feature's own route array, plus stand-ins for the role homes. */
function renderApp(path: string) {
  render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            {/*
              Both tables, as the app router mounts them. `/admin/users` moved
              from authRoutes to adminRoutes when the administration console
              grew its other three screens.
            */}
            {[...authRoutes, ...adminRoutes].map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
            <Route path="/patient" element={<p>patient home</p>} />
            <Route path="/practitioner" element={<p>practitioner home</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

function typeInto(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('SetupAdminPage', () => {
  it('creates the administrator on a fresh device', async () => {
    renderApp('/setup-admin')
    await screen.findByText(t('setupAdmin.subtitle'))

    typeInto(t('field.fullName'), 'Site Administrator')
    typeInto(t('field.password'), ADMIN_PASSWORD)
    typeInto(t('field.confirmPassword'), ADMIN_PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: t('action.createAdmin') }))

    expect(await screen.findByText(t('setupAdmin.successBody'))).toBeInTheDocument()
    const admin = await db.users.where('username').equals('admin').first()
    expect(admin).toMatchObject({ role: ROLES.ADMIN, status: USER_STATUSES.ACTIVE })
    await expect(auth.isAdminBootstrapped()).resolves.toBe(true)
  })

  it('refuses a password under 8 characters', async () => {
    renderApp('/setup-admin')
    await screen.findByText(t('setupAdmin.subtitle'))

    typeInto(t('field.fullName'), 'Site Administrator')
    typeInto(t('field.password'), 'short7!')
    typeInto(t('field.confirmPassword'), 'short7!')
    fireEvent.click(screen.getByRole('button', { name: t('action.createAdmin') }))

    expect(await screen.findByText(t('error.PASSWORD_TOO_SHORT'))).toBeInTheDocument()
    await expect(db.users.count()).resolves.toBe(0)
  })

  it('catches a mistyped confirmation before touching the database', async () => {
    renderApp('/setup-admin')
    await screen.findByText(t('setupAdmin.subtitle'))

    typeInto(t('field.fullName'), 'Site Administrator')
    typeInto(t('field.password'), ADMIN_PASSWORD)
    typeInto(t('field.confirmPassword'), 'admin-pass-2')
    fireEvent.click(screen.getByRole('button', { name: t('action.createAdmin') }))

    expect(await screen.findByText(t('error.PASSWORDS_DO_NOT_MATCH'))).toBeInTheDocument()
    await expect(db.users.count()).resolves.toBe(0)
  })

  it('sends the visitor to the login screen once the device is already set up', async () => {
    await auth.bootstrapAdmin({ password: ADMIN_PASSWORD, name: 'Site Administrator' })

    renderApp('/setup-admin')

    expect(await screen.findByText(t('login.subtitle'))).toBeInTheDocument()
    expect(screen.queryByText(t('setupAdmin.subtitle'))).not.toBeInTheDocument()
  })
})

describe('LoginPage', () => {
  beforeEach(async () => {
    await auth.bootstrapAdmin({ password: ADMIN_PASSWORD, name: 'Site Administrator' })
  })

  it('signs a patient in and sends them to their role home', async () => {
    await auth.register({
      username: 'juan',
      password: PASSWORD,
      role: ROLES.PATIENT,
      name: 'Juan Dela Cruz',
    })
    renderApp('/login')
    await screen.findByText(t('login.subtitle'))

    typeInto(t('field.username'), 'juan')
    typeInto(t('field.password'), PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: t('action.signIn') }))

    expect(await screen.findByText('patient home')).toBeInTheDocument()
  })

  it('shows the pending-approval reason to a practitioner who is not yet verified', async () => {
    await auth.register({
      username: 'dr.ricardo',
      password: PASSWORD,
      role: ROLES.PRACTITIONER,
      name: 'Dr Ricardo',
    })
    renderApp('/login')
    await screen.findByText(t('login.subtitle'))

    typeInto(t('field.username'), 'dr.ricardo')
    typeInto(t('field.password'), PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: t('action.signIn') }))

    expect(await screen.findByText(t('error.ACCOUNT_PENDING_VERIFICATION'))).toBeInTheDocument()
    expect(screen.queryByText('practitioner home')).not.toBeInTheDocument()
  })

  it('shows the same generic reason for a wrong password', async () => {
    await auth.register({
      username: 'juan',
      password: PASSWORD,
      role: ROLES.PATIENT,
      name: 'Juan Dela Cruz',
    })
    renderApp('/login')
    await screen.findByText(t('login.subtitle'))

    typeInto(t('field.username'), 'juan')
    typeInto(t('field.password'), 'wrong-password')
    fireEvent.click(screen.getByRole('button', { name: t('action.signIn') }))

    expect(await screen.findByText(t('error.INVALID_CREDENTIALS'))).toBeInTheDocument()
  })

  it('renders no user-facing text outside the auth namespace', async () => {
    renderApp('/login')

    // A missing key renders as the key itself, e.g. "login.title".
    await screen.findByText(t('login.subtitle'))
    expect(screen.queryByText(/^[a-z]+\.[A-Za-z_.]+$/)).not.toBeInTheDocument()
  })
})

describe('LoginPage on an unconfigured device', () => {
  it('redirects to first-run setup when no administrator exists yet', async () => {
    renderApp('/login')

    expect(await screen.findByText(t('setupAdmin.subtitle'))).toBeInTheDocument()
  })
})

describe('RegisterPage', () => {
  beforeEach(async () => {
    await auth.bootstrapAdmin({ password: ADMIN_PASSWORD, name: 'Site Administrator' })
  })

  it('registers a patient as immediately usable', async () => {
    renderApp('/register')
    await screen.findByText(t('register.subtitle'))

    typeInto(t('field.fullName'), 'Juan Dela Cruz')
    typeInto(t('field.username'), 'juan')
    typeInto(t('field.password'), PASSWORD)
    typeInto(t('field.confirmPassword'), PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: t('action.register') }))

    expect(await screen.findByText(t('register.activeBody'))).toBeInTheDocument()
    const created = await db.users.where('username').equals('juan').first()
    expect(created).toMatchObject({ role: ROLES.PATIENT, status: USER_STATUSES.ACTIVE })
  })

  it('registers a health worker as pending and says so', async () => {
    renderApp('/register')
    await screen.findByText(t('register.subtitle'))

    fireEvent.click(screen.getByRole('radio', { name: /Health Worker/ }))
    typeInto(t('field.fullName'), 'Ana Reyes')
    typeInto(t('field.username'), 'ana.reyes')
    typeInto(t('field.password'), PASSWORD)
    typeInto(t('field.confirmPassword'), PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: t('action.register') }))

    expect(await screen.findByText(t('register.pendingTitle'))).toBeInTheDocument()
    const created = await db.users.where('username').equals('ana.reyes').first()
    expect(created?.status).toBe(USER_STATUSES.PENDING_VERIFICATION)
  })

  it('offers only the self-registrable roles, never administrator', async () => {
    renderApp('/register')
    await screen.findByText(t('register.subtitle'))

    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.queryByRole('radio', { name: /Administrator/ })).not.toBeInTheDocument()
  })

  it('asks a professional for their job title, but not a patient', async () => {
    renderApp('/register')
    await screen.findByText(t('register.subtitle'))

    expect(screen.queryByLabelText(t('field.professionalDesignation'))).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Practitioner/ }))

    expect(screen.getByLabelText(t('field.professionalDesignation'))).toBeInTheDocument()
  })

  it('reports a username that is already taken', async () => {
    await auth.register({
      username: 'juan',
      password: PASSWORD,
      role: ROLES.PATIENT,
      name: 'Juan Dela Cruz',
    })
    renderApp('/register')
    await screen.findByText(t('register.subtitle'))

    typeInto(t('field.fullName'), 'Juan Two')
    typeInto(t('field.username'), 'JUAN')
    typeInto(t('field.password'), PASSWORD)
    typeInto(t('field.confirmPassword'), PASSWORD)
    fireEvent.click(screen.getByRole('button', { name: t('action.register') }))

    expect(await screen.findByText(t('error.USERNAME_TAKEN'))).toBeInTheDocument()
  })
})

describe('UsersPage', () => {
  async function signedInAdmin() {
    const admin = await auth.bootstrapAdmin({ password: ADMIN_PASSWORD, name: 'Site Administrator' })
    await auth.login('admin', ADMIN_PASSWORD)
    return admin
  }

  async function pendingPractitioner() {
    return auth.register({
      username: 'dr.ricardo',
      password: PASSWORD,
      role: ROLES.PRACTITIONER,
      name: 'Dr Ricardo',
    })
  }

  it('shows the pending-verification queue to an admin', async () => {
    await signedInAdmin()
    await pendingPractitioner()

    renderApp('/admin/users')

    expect(await screen.findByText('Dr Ricardo')).toBeInTheDocument()
    expect(screen.getByText(t('users.pendingCount', { count: 1 }))).toBeInTheDocument()
  })

  it('approves a pending practitioner, who can then sign in', async () => {
    await signedInAdmin()
    const doctor = await pendingPractitioner()
    renderApp('/admin/users')
    await screen.findByText('Dr Ricardo')

    fireEvent.click(screen.getByRole('button', { name: t('action.activate') }))

    expect(
      await screen.findByText(t('users.activated', { name: 'Dr Ricardo' })),
    ).toBeInTheDocument()
    expect((await db.users.get(doctor.id))?.status).toBe(USER_STATUSES.ACTIVE)
  })

  it('asks for confirmation before turning an account off', async () => {
    const admin = await signedInAdmin()
    const doctor = await pendingPractitioner()
    await auth.activateUser({ actingUserId: admin.id, targetUserId: doctor.id })
    renderApp('/admin/users')
    await screen.findByText('Dr Ricardo')

    fireEvent.click(screen.getByRole('button', { name: t('action.disable') }))
    expect(
      screen.getByText(t('users.confirmDisable', { name: 'Dr Ricardo' })),
    ).toBeInTheDocument()
    expect((await db.users.get(doctor.id))?.status).toBe(USER_STATUSES.ACTIVE)

    fireEvent.click(screen.getByRole('button', { name: t('action.confirm') }))

    await waitFor(async () =>
      expect((await db.users.get(doctor.id))?.status).toBe(USER_STATUSES.DISABLED),
    )
  })

  it('never offers the admin a way to turn off their own account', async () => {
    await signedInAdmin()

    renderApp('/admin/users')
    await screen.findByText('Site Administrator')

    expect(screen.queryByRole('button', { name: t('action.disable') })).not.toBeInTheDocument()
  })

  it('resets a password, and the new one works', async () => {
    const admin = await signedInAdmin()
    const doctor = await pendingPractitioner()
    await auth.activateUser({ actingUserId: admin.id, targetUserId: doctor.id })
    renderApp('/admin/users')
    await screen.findByText('Dr Ricardo')

    // Scoped to this practitioner's own card: `listUsers` returns rows in
    // primary-key order, so "the last reset button on the page" could belong
    // to any account.
    const card = screen.getByText('Dr Ricardo').closest('li')
    expect(card).not.toBeNull()
    const inCard = within(card as HTMLElement)

    fireEvent.click(inCard.getByRole('button', { name: t('action.resetPassword') }))
    typeInto(t('users.resetPasswordFor', { name: 'Dr Ricardo' }), 'fresh-pass-1')
    // Two buttons share the label once the form is open: the row action that
    // opened it, and the form's submit.
    const [, submit] = inCard.getAllByRole('button', { name: t('action.resetPassword') })
    fireEvent.click(submit)

    expect(
      await screen.findByText(t('users.resetPasswordDone', { name: 'Dr Ricardo' })),
    ).toBeInTheDocument()
    await expect(auth.login('dr.ricardo', 'fresh-pass-1')).resolves.toBeDefined()
  })

  it('turns a non-admin away from the admin route', async () => {
    const admin = await auth.bootstrapAdmin({
      password: ADMIN_PASSWORD,
      name: 'Site Administrator',
    })
    const doctor = await pendingPractitioner()
    await auth.activateUser({ actingUserId: admin.id, targetUserId: doctor.id })
    await auth.login('dr.ricardo', PASSWORD)

    renderApp('/admin/users')

    expect(await screen.findByText('practitioner home')).toBeInTheDocument()
    expect(screen.queryByText(t('users.subtitle'))).not.toBeInTheDocument()
  })
})
