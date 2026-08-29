import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../../router'
import { AuthProvider } from '../../auth/AuthContext'
import type { AuthService } from '../../auth/authService'
import { registerAuthResources } from '../../auth/i18n'
import { roleHomePath } from '../../auth/guards'
import { createTestAuthService } from '../../auth/testing'
import { ROLES, USER_STATUSES, type Role } from '../../db/codes'
import { db } from '../../db/db'
import { i18n as appI18n } from '../../i18n'
import { registerStaffResources } from './i18n'
import { MENU_PATH, STAFF_NAV, type StaffRole } from './navigation'

registerStaffResources(appI18n)
registerAuthResources(appI18n)

const t = (key: string) => appI18n.t(key)
const PASSWORD = 'clinic-pass-1'
const STAFF_ROLES: StaffRole[] = [
  ROLES.ADMIN,
  ROLES.PRACTITIONER,
  ROLES.HEALTH_WORKER,
  ROLES.RESEARCHER,
]

let auth: AuthService

beforeEach(async () => {
  // The app-wide database, because every feature screen reads the singleton.
  await Promise.all([db.users.clear(), db.appMeta.clear()])
  auth = createTestAuthService(db)
})

afterEach(cleanup)

async function signInAs(role: Role) {
  if (role === ROLES.ADMIN) {
    await auth.bootstrapAdmin({ password: PASSWORD, name: 'Bituin Lacsamana' })
    await auth.login('admin', PASSWORD)
    return
  }
  const user = await auth.register({
    username: `staff.${role.toLowerCase()}`,
    password: PASSWORD,
    role,
    // Nothing in the name echoes any role name.
    name: 'Bituin Lacsamana',
  })
  await db.users.update(user.id, { status: USER_STATUSES.ACTIVE })
  await auth.login(user.username, PASSWORD)
}

function renderAt(path: string) {
  return render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

/**
 * The property that failed on a real phone: the first user of the app signed in
 * and reached a screen with nothing to tap but "Reset password". No navigation,
 * no sign out, no way anywhere. Four of five roles were marooned wherever the
 * login redirect dropped them.
 */
describe('no staff role can be marooned', () => {
  it.each(STAFF_ROLES)('%s lands on a screen with navigation', async (role) => {
    await signInAs(role)

    renderAt(roleHomePath(role))

    // Not "a nav exists somewhere" — the nav for THIS role, reachable from the
    // screen the login redirect actually chose.
    const nav = await screen.findByRole('navigation', { name: t('staff:nav.label') })
    expect(nav).toBeInTheDocument()
  })

  it.each(STAFF_ROLES)('%s can reach the menu from where they land', async (role) => {
    await signInAs(role)

    renderAt(roleHomePath(role))
    await screen.findByRole('navigation', { name: t('staff:nav.label') })

    expect(
      screen.getByRole('button', { name: new RegExp(t('staff:nav.menu')) }),
    ).toBeInTheDocument()
  })

  it.each(STAFF_ROLES)('%s can sign out, and lands back at the front door', async (role) => {
    await signInAs(role)

    renderAt(MENU_PATH)
    const signOut = await screen.findByRole('button', { name: t('staff:menu.signOut') })

    fireEvent.click(signOut)

    // Signing out is the guaranteed way to hand a shared clinic phone to
    // somebody else. Before this there was none for any staff role.
    await waitFor(async () => {
      await expect(auth.getCurrentUser()).resolves.toBeNull()
    })
  })

  it.each(STAFF_ROLES)('%s sees who they are signed in as', async (role) => {
    await signInAs(role)

    renderAt(MENU_PATH)

    expect(await screen.findByText(t('staff:menu.signedInAs'))).toBeInTheDocument()
    expect(screen.getByText('Bituin Lacsamana')).toBeInTheDocument()
    // The whole sentence, so this cannot pass on the name alone.
    expect(
      screen.getByText(
        appI18n.t('staff:menu.roleLabel', { role: appI18n.t(`codes:role.${role}`) }),
      ),
    ).toBeInTheDocument()
  })

  it('offers every role at most five destinations, so targets stay tappable', () => {
    for (const role of STAFF_ROLES) {
      expect(STAFF_NAV[role].length, role).toBeLessThanOrEqual(5)
      expect(STAFF_NAV[role].length, role).toBeGreaterThan(1)
    }
  })

  it('points every navigation entry at a route that exists', () => {
    // A nav item leading nowhere is worse than no nav item.
    const declared = new Set<string>()
    const element = AppRoutes() as { props: { children?: unknown } }
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      const candidate = node as { props?: { path?: string; children?: unknown } } | null
      if (candidate?.props === undefined) return
      if (typeof candidate.props.path === 'string') declared.add(candidate.props.path)
      walk(candidate.props.children)
    }
    walk(element.props.children)

    for (const role of STAFF_ROLES) {
      for (const entry of STAFF_NAV[role]) {
        expect(declared.has(entry.path), `${role} -> ${entry.path}`).toBe(true)
      }
    }
  })
})

describe('the first user of a fresh install', () => {
  it('finishes setup signed in, on a screen with navigation', async () => {
    renderAt('/setup-admin')

    const name = await screen.findByLabelText(t('auth:field.fullName'))
    fireEvent.change(name, { target: { value: 'Site Administrator' } })
    fireEvent.change(screen.getByLabelText(t('auth:field.password')), {
      target: { value: PASSWORD },
    })
    fireEvent.change(screen.getByLabelText(t('auth:field.confirmPassword')), {
      target: { value: PASSWORD },
    })
    fireEvent.click(screen.getByRole('button', { name: t('auth:action.createAdmin') }))

    // The exact journey that dead-ended on a real phone: created the account,
    // signed in, and arrived somewhere with nothing to tap.
    const nav = await screen.findByRole(
      'navigation',
      { name: t('staff:nav.label') },
      { timeout: 4000 },
    )
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(t('staff:nav.menu')) })).toBeInTheDocument()
  })
})

describe('patients are unaffected', () => {
  it('gets no staff navigation', async () => {
    await auth.bootstrapAdmin({ password: PASSWORD, name: 'Admin' })
    const patient = await auth.register({
      username: 'juan',
      password: PASSWORD,
      role: ROLES.PATIENT,
      name: 'Juan Dela Cruz',
    })
    await db.users.update(patient.id, { status: USER_STATUSES.ACTIVE })
    await auth.login('juan', PASSWORD)

    render(
      <I18nextProvider i18n={appI18n}>
        <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
          <MemoryRouter initialEntries={['/menu']}>
            <Routes>
              <Route path="/menu" element={<div data-testid="menu" />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </I18nextProvider>,
    )

    // The patient portal has its own navigation; two would be one too many.
    expect(screen.queryByRole('navigation', { name: t('staff:nav.label') })).not.toBeInTheDocument()
  })
})
