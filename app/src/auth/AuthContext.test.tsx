import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB } from '../db/db'
import { ROLES } from '../db/codes'
import { AUDIT_ACTIONS } from '../audit/audit'
import { i18n as appI18n } from '../i18n'
import { AuthProvider, useAuth } from './AuthContext'
import { AUTH_ERRORS, type AuthService } from './authService'
import { registerAuthResources } from './i18n'
import { createTestAuthService } from './testing'

registerAuthResources(appI18n)

const PASSWORD = 'clinic-pass-1'

let db: AuscultaDB
let auth: AuthService

beforeEach(() => {
  db = new AuscultaDB(`ausculta-context-test-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
})

// See the note in guards.test.tsx: `globals` is off, so Testing Library's
// automatic cleanup never registers.
afterEach(cleanup)

/** Renders the context's state, with the last login error if there was one. */
function Probe({ onReady }: { onReady?: (value: ReturnType<typeof useAuth>) => void }) {
  const value = useAuth()
  onReady?.(value)
  return (
    <div>
      <p data-testid="loading">{String(value.isLoading)}</p>
      <p data-testid="user">{value.user?.username ?? 'none'}</p>
      <p data-testid="role">{value.role ?? 'none'}</p>
    </div>
  )
}

function renderProbe(service: AuthService = auth, idleCheckIntervalMs = 60_000) {
  let latest: ReturnType<typeof useAuth> | null = null
  render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={service} idleCheckIntervalMs={idleCheckIntervalMs}>
        <Probe
          onReady={(value) => {
            latest = value
          }}
        />
      </AuthProvider>
    </I18nextProvider>,
  )
  return () => {
    if (latest === null) throw new Error('probe never rendered')
    return latest as ReturnType<typeof useAuth>
  }
}

async function seedPatient() {
  return auth.register({
    username: 'juan',
    password: PASSWORD,
    role: ROLES.PATIENT,
    name: 'Juan Dela Cruz',
  })
}

describe('AuthProvider', () => {
  it('starts loading and settles with nobody signed in', async () => {
    renderProbe()

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(screen.getByTestId('role')).toHaveTextContent('none')
  })

  it('restores a session persisted before the app was opened', async () => {
    await seedPatient()
    await auth.login('juan', PASSWORD)

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('juan'))
    expect(screen.getByTestId('role')).toHaveTextContent(ROLES.PATIENT)
  })

  it('signs a user in through the context', async () => {
    await seedPatient()
    const context = renderProbe()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await act(async () => {
      await context().login('juan', PASSWORD)
    })

    expect(screen.getByTestId('user')).toHaveTextContent('juan')
    expect(screen.getByTestId('role')).toHaveTextContent(ROLES.PATIENT)
  })

  it('surfaces the failure reason and stays signed out on a bad password', async () => {
    await seedPatient()
    const context = renderProbe()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await act(async () => {
      await expect(context().login('juan', 'wrong-password')).rejects.toMatchObject({
        code: AUTH_ERRORS.INVALID_CREDENTIALS,
      })
    })

    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('signs out through the context and clears the persisted session', async () => {
    await seedPatient()
    await auth.login('juan', PASSWORD)
    const context = renderProbe()
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('juan'))

    await act(async () => {
      await context().logout()
    })

    expect(screen.getByTestId('user')).toHaveTextContent('none')
    await expect(auth.sessions.read()).resolves.toBeNull()
  })

  it('signs a user out once the idle window has passed, and audits it', async () => {
    const shortLived = createTestAuthService(db, { idleTimeoutMs: 200 })
    await seedPatient()
    await shortLived.login('juan', PASSWORD)

    renderProbe(shortLived, 25)
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('juan'))

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'), {
      timeout: 4_000,
    })
    await expect(shortLived.sessions.read()).resolves.toBeNull()
    const expiries = await db.auditLogs
      .where('actionCode')
      .equals(AUDIT_ACTIONS.SESSION_EXPIRED)
      .count()
    expect(expiries).toBeGreaterThan(0)
  })

  it('pushes the idle deadline back when the user does something', async () => {
    await seedPatient()
    await auth.login('juan', PASSWORD)
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('juan'))
    // Backdate the recorded activity so the assertion cannot be defeated by
    // the touch landing in the same millisecond as the login.
    await auth.sessions.touch(Date.now() - 60_000)
    const before = await auth.sessions.read()

    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'))
    })

    await waitFor(async () => {
      const after = await auth.sessions.read()
      expect(Date.parse(after?.lastActivityAt ?? '')).toBeGreaterThan(
        Date.parse(before?.lastActivityAt ?? ''),
      )
    })
  })

  it('leaves the session alone when nobody is signed in', async () => {
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'))
    })

    await expect(auth.sessions.read()).resolves.toBeNull()
  })
})
