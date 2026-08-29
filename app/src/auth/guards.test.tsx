import { cleanup, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../db/db'
import { ROLES, type Role } from '../db/codes'
import { i18n as appI18n } from '../i18n'
import { AuthProvider } from './AuthContext'
import type { AuthService } from './authService'
import { RequireAuth, RequireRole, ROLE_HOME_PATHS, roleHomePath } from './guards'
import { registerAuthResources } from './i18n'
import { createTestAuthService } from './testing'

registerAuthResources(appI18n)

const PASSWORD = 'clinic-pass-1'

let db: AuscultaDB
let auth: AuthService

beforeEach(() => {
  db = new AuscultaDB(`ausculta-guards-test-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
})

// This project's vitest config does not enable `globals`, so Testing Library's
// automatic per-test cleanup never registers itself — without this, every
// rendered tree stays in the document and later queries match earlier tests.
afterEach(cleanup)

/** Creates an ACTIVE account of `role` and opens a session for it. */
async function signInAs(role: Role): Promise<void> {
  if (role === ROLES.ADMIN) {
    await auth.bootstrapAdmin({ password: PASSWORD, name: 'Site Administrator' })
    await auth.login('admin', PASSWORD)
    return
  }

  const admin = await auth.bootstrapAdmin({ password: 'admin-pass-1', name: 'Site Administrator' })
  const user = await auth.register({
    username: 'test.user',
    password: PASSWORD,
    role,
    name: 'Test User',
  })
  await auth.activateUser({ actingUserId: admin.id, targetUserId: user.id })
  await auth.login('test.user', PASSWORD)
}

/**
 * Renders a miniature app at `path` with a landing page per role, so a
 * redirect can be asserted by which landing page ends up on screen.
 */
function renderAt(path: string, service: AuthService = auth, idleCheckIntervalMs = 60_000) {
  return render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={service} idleCheckIntervalMs={idleCheckIntervalMs}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<p>login screen</p>} />
            <Route path={ROLE_HOME_PATHS[ROLES.PATIENT]} element={<p>patient home</p>} />
            <Route path={ROLE_HOME_PATHS[ROLES.PRACTITIONER]} element={<p>practitioner home</p>} />
            <Route path={ROLE_HOME_PATHS[ROLES.HEALTH_WORKER]} element={<p>health worker home</p>} />
            <Route path={ROLE_HOME_PATHS[ROLES.RESEARCHER]} element={<p>researcher home</p>} />
            <Route
              path={ROLE_HOME_PATHS[ROLES.ADMIN]}
              element={
                <RequireRole roles={[ROLES.ADMIN]}>
                  <p>admin accounts</p>
                </RequireRole>
              }
            />
            <Route
              path="/records"
              element={
                <RequireAuth>
                  <p>patient records</p>
                </RequireAuth>
              }
            />
            <Route
              path="/clinical"
              element={
                <RequireRole roles={[ROLES.PRACTITIONER, ROLES.HEALTH_WORKER]}>
                  <Outlet />
                </RequireRole>
              }
            >
              <Route path="review" element={<p>clinical review</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

describe('roleHomePath', () => {
  it('gives every role its own landing route', () => {
    expect(roleHomePath(ROLES.ADMIN)).toBe('/admin/users')
    // Real screens, not the placeholders these used to point at: three of the
    // five roles signed in and landed on "your dashboard is still being built".
    expect(roleHomePath(ROLES.PRACTITIONER)).toBe('/review')
    expect(roleHomePath(ROLES.HEALTH_WORKER)).toBe('/patients')
    expect(roleHomePath(ROLES.RESEARCHER)).toBe('/research')
    expect(roleHomePath(ROLES.PATIENT)).toBe('/patient')
  })

  it('sends a caller with no role to the login screen', () => {
    expect(roleHomePath(null)).toBe('/login')
    expect(roleHomePath(undefined)).toBe('/login')
  })

  it('covers every role in the registry, so no role can fall through', () => {
    for (const role of Object.values(ROLES)) {
      expect(ROLE_HOME_PATHS[role]).toMatch(/^\//)
    }
  })
})

describe('RequireAuth', () => {
  it('redirects an unauthenticated visitor to the login screen', async () => {
    renderAt('/records')

    expect(await screen.findByText('login screen')).toBeInTheDocument()
    expect(screen.queryByText('patient records')).not.toBeInTheDocument()
  })

  it('shows a waiting state instead of flashing the login screen on cold start', () => {
    renderAt('/records')

    // Synchronously, before the persisted session has been read.
    expect(screen.getByText(appI18n.t('auth:guard.checking'))).toBeInTheDocument()
    expect(screen.queryByText('login screen')).not.toBeInTheDocument()
  })

  it('renders the protected content for any signed-in user', async () => {
    await signInAs(ROLES.PATIENT)

    renderAt('/records')

    expect(await screen.findByText('patient records')).toBeInTheDocument()
  })

  it('redirects to login once a disabled account is detected', async () => {
    const admin = await auth.bootstrapAdmin({ password: 'admin-pass-1', name: 'Admin' })
    const patient = await auth.register({
      username: 'juan',
      password: PASSWORD,
      role: ROLES.PATIENT,
      name: 'Juan Dela Cruz',
    })
    await auth.login('juan', PASSWORD)
    await auth.disableUser({ actingUserId: admin.id, targetUserId: patient.id })

    renderAt('/records')

    expect(await screen.findByText('login screen')).toBeInTheDocument()
  })
})

describe('RequireRole', () => {
  it('lets an admin into the admin route', async () => {
    await signInAs(ROLES.ADMIN)

    renderAt('/admin/users')

    expect(await screen.findByText('admin accounts')).toBeInTheDocument()
  })

  it.each([
    [ROLES.PATIENT, 'patient home'],
    [ROLES.PRACTITIONER, 'practitioner home'],
    [ROLES.HEALTH_WORKER, 'health worker home'],
    [ROLES.RESEARCHER, 'researcher home'],
  ])('sends a %s away from the admin route to their own home', async (role, expected) => {
    await signInAs(role)

    renderAt('/admin/users')

    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(screen.queryByText('admin accounts')).not.toBeInTheDocument()
  })

  it('redirects an unauthenticated visitor to login, not to a role home', async () => {
    renderAt('/admin/users')

    expect(await screen.findByText('login screen')).toBeInTheDocument()
  })

  it('guards a nested route tree through <Outlet />', async () => {
    await signInAs(ROLES.PRACTITIONER)

    renderAt('/clinical/review')

    expect(await screen.findByText('clinical review')).toBeInTheDocument()
  })

  it('keeps an unauthorised role out of a nested route tree', async () => {
    await signInAs(ROLES.PATIENT)

    renderAt('/clinical/review')

    expect(await screen.findByText('patient home')).toBeInTheDocument()
    expect(screen.queryByText('clinical review')).not.toBeInTheDocument()
  })

  it('says so plainly rather than looping when a role is denied its own home', async () => {
    // A researcher landing on /researcher, which this app guards for admins
    // only — the redirect target would be the page being denied.
    await signInAs(ROLES.RESEARCHER)

    render(
      <I18nextProvider i18n={appI18n}>
        <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
          <MemoryRouter initialEntries={[ROLE_HOME_PATHS[ROLES.RESEARCHER]]}>
            <Routes>
              <Route
                path={ROLE_HOME_PATHS[ROLES.RESEARCHER]}
                element={
                  <RequireRole roles={[ROLES.ADMIN]}>
                    <p>never rendered</p>
                  </RequireRole>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </I18nextProvider>,
    )

    expect(await screen.findByText(appI18n.t('auth:error.NOT_AUTHORISED'))).toBeInTheDocument()
    expect(screen.queryByText('never rendered')).not.toBeInTheDocument()
  })
})
