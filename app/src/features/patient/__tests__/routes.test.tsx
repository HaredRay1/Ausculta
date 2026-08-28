import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { isValidElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../../../auth/AuthContext'
import { RequireRole } from '../../../auth/guards'
import { createTestAuthService } from '../../../auth/testing'
import { CONSENT_STATUSES, ROLES, SEX_CODES } from '../../../db/codes'
import { db } from '../../../db/db'
import { i18n as appI18n } from '../../../i18n'
import { registerPatientResources } from '../i18n'
import { PATIENT_PATHS } from '../navigation'
import { patientNavItems, patientRoutes } from '../routes'

registerPatientResources(appI18n)

const t = (key: string, options?: Record<string, unknown>) => appI18n.t(`patient:${key}`, options)

/**
 * The integration seam, exercised as the app router consumes it.
 *
 * Mounts `patientRoutes` verbatim — guards, default repository, singleton
 * database and all — because everything else in this feature's suite injects a
 * test repository, and the one thing that would leave untested is precisely the
 * wiring the host router depends on.
 */

const PASSWORD = 'patient-pass-1'

afterEach(async () => {
  cleanup()
  await db.patients.clear()
  await db.assessments.clear()
  await db.recordings.clear()
  await db.users.clear()
  await db.appMeta.clear()
})

describe('the exported route table', () => {
  it('covers every navigable path, each behind a patient-role guard', () => {
    const paths = patientRoutes.map((route) => route.path)
    expect(paths).toEqual([
      PATIENT_PATHS.home,
      PATIENT_PATHS.results,
      `${PATIENT_PATHS.results}/:assessmentId`,
      PATIENT_PATHS.recordings,
      PATIENT_PATHS.trends,
      PATIENT_PATHS.history,
      PATIENT_PATHS.rehab,
    ])

    for (const route of patientRoutes) {
      expect(isValidElement(route.element)).toBe(true)
      // The guard travels with the route, so a host router cannot forget it.
      // These are a person's own clinical records.
      expect((route.element as React.ReactElement).type).toBe(RequireRole)
      expect((route.element as React.ReactElement).props).toMatchObject({
        roles: [ROLES.PATIENT],
      })
    }
  })

  it('declares the list route before the parameterised one', () => {
    const list = patientRoutes.findIndex((route) => route.path === PATIENT_PATHS.results)
    const detail = patientRoutes.findIndex((route) =>
      route.path?.endsWith(':assessmentId'),
    )
    expect(list).toBeLessThan(detail)
  })

  it('exports at most five nav items, each pointing at a real route', () => {
    expect(patientNavItems.length).toBeLessThanOrEqual(5)
    const paths = new Set(patientRoutes.map((route) => route.path))
    for (const item of patientNavItems) {
      expect(paths.has(item.path)).toBe(true)
      // Every label resolves to real copy, not an echoed key.
      expect(appI18n.t(item.labelKey)).not.toBe(item.labelKey)
    }
  })
})

describe('mounted through the real seam', () => {
  beforeEach(async () => {
    const auth = createTestAuthService(db)
    const user = await auth.register({
      username: 'validator1',
      password: PASSWORD,
      role: ROLES.PATIENT,
      name: 'Marisol Agbayani',
    })
    await auth.login('validator1', PASSWORD)

    await db.patients.put({
      id: 'pt-real-1',
      studyId: 'ST-000000000009',
      linkedUserId: user.id,
      assignedPractitionerIds: [],
      assignedHealthWorkerIds: [],
      consent: {
        status: CONSENT_STATUSES.GRANTED,
        language: 'en',
        textVersion: 'consent-v1',
        presentedAt: '2026-06-01T01:30:00.000Z',
        recordedBy: 'DEMO-STAFF-HW1',
      },
      name: 'Marisol Agbayani',
      birthDate: '1992-03-14',
      sex: SEX_CODES.FEMALE,
      respiratoryHistory: [],
      familyHistory: [],
      preferredLanguage: 'en',
      isDemo: 0,
      createdAt: '2026-06-01T01:30:00.000Z',
    })
  })

  function mount(path: string) {
    const auth = createTestAuthService(db)
    render(
      <I18nextProvider i18n={appI18n}>
        <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              {patientRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </I18nextProvider>,
    )
  }

  it('renders the patient home for a signed-in patient', async () => {
    mount(PATIENT_PATHS.home)
    await waitFor(() =>
      expect(
        screen.getByText(t('home.greeting', { name: 'Marisol Agbayani' })),
      ).toBeInTheDocument(),
    )
  })

  it('reaches every navigable destination without a blank screen', async () => {
    for (const path of [
      PATIENT_PATHS.results,
      PATIENT_PATHS.recordings,
      PATIENT_PATHS.trends,
      PATIENT_PATHS.history,
      PATIENT_PATHS.rehab,
    ]) {
      mount(path)
      // Each screen names itself in its app bar; a blank route would not.
      await waitFor(() => expect(screen.getAllByRole('heading').length).toBeGreaterThan(0))
      cleanup()
    }
  })
})
