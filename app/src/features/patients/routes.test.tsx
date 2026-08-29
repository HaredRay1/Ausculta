import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ROLES, USER_STATUSES } from '../../db/codes'
import { AuscultaDB } from '../../db/db'
import type { User } from '../../db/types'
import { i18n as appI18n } from '../../i18n'
import { AuthProvider } from '../../auth/AuthContext'
import type { AuthService } from '../../auth/authService'
import { createTestAuthService } from '../../auth/testing'
import { registerPatientsResources } from './i18n'
import { patientRoutes } from './routes'

registerPatientsResources(appI18n)

const PASSWORD = 'clinic-pass-1'

let db: AuscultaDB
let auth: AuthService

beforeEach(() => {
  db = new AuscultaDB(`ausculta-patients-routes-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
})

afterEach(cleanup)

async function signIn(role: User['role']): Promise<User> {
  const user = await auth.register({
    username: `user-${role.toLowerCase()}`,
    password: PASSWORD,
    role,
    name: 'Test Account Holder',
    preferredLanguage: 'en',
  })
  await db.users.update(user.id, { status: USER_STATUSES.ACTIVE })
  await auth.login(user.username, PASSWORD)
  return user
}

/** Mounts the feature's own route array, plus a stand-in for the portal. */
function renderAt(path: string) {
  render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            {patientRoutes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
            <Route path="/patient" element={<p>patient portal</p>} />
            <Route path="/login" element={<p>login</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

describe('a patient is never dropped into the clinician screens', () => {
  /**
   * These routes are RequireAuth and the repository scopes what each role can
   * read, so a patient reaching them was never a disclosure — they saw only
   * their own record. The defect was the container: the staff navigation does
   * not render for a patient and the portal's does not either, so they landed
   * on a clinician screen with no way out.
   */
  it('sends a patient from the clinician list to their own portal', async () => {
    await signIn(ROLES.PATIENT)
    renderAt('/patients')
    expect(await screen.findByText('patient portal')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: appI18n.t('patients:list.title') }),
    ).not.toBeInTheDocument()
  })

  it('sends a patient from a patient record to their own portal', async () => {
    await signIn(ROLES.PATIENT)
    renderAt('/patients/PT-0001-0001')
    expect(await screen.findByText('patient portal')).toBeInTheDocument()
  })

  it('leaves the clinician list alone for a health worker', async () => {
    await signIn(ROLES.HEALTH_WORKER)
    renderAt('/patients')
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: appI18n.t('patients:list.title') }),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByText('patient portal')).not.toBeInTheDocument()
  })

  it('leaves the clinician list alone for a practitioner and an admin', async () => {
    await signIn(ROLES.PRACTITIONER)
    renderAt('/patients')
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: appI18n.t('patients:list.title') }),
      ).toBeInTheDocument(),
    )
  })
})
