import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCATION_CODES, ROLES, SEX_CODES, USER_STATUSES } from '../../../db/codes'
import { AuscultaDB } from '../../../db/db'
import type { MonitoringPlan, Patient, User } from '../../../db/types'
import { i18n as appI18n } from '../../../i18n'
import { AuthProvider } from '../../../auth/AuthContext'
import type { AuthService } from '../../../auth/authService'
import { createTestAuthService } from '../../../auth/testing'
import { PLAN_STATUSES } from '../../monitoring/repository'
import { createPatientRepository } from '../data/patientRepository'
import { registerPatientResources } from '../i18n'
import { PATIENT_PATHS } from '../navigation'
import { RehabPage } from '../pages/RehabPage'

registerPatientResources(appI18n)

const t = (key: string, o?: Record<string, unknown>) => appI18n.t(`patient:${key}`, o)
const PASSWORD = 'clinic-pass-1'

let db: AuscultaDB
let auth: AuthService
let userId = ''

beforeEach(async () => {
  db = new AuscultaDB(`ausculta-plan-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
  const user: User = await auth.register({
    username: 'patientuser',
    password: PASSWORD,
    role: ROLES.PATIENT,
    name: 'Test Account Holder',
    preferredLanguage: 'en',
  })
  userId = user.id
  await db.users.update(user.id, { status: USER_STATUSES.ACTIVE })
  await auth.login('patientuser', PASSWORD)
})

afterEach(cleanup)

async function seedPatient(): Promise<Patient> {
  const patient: Patient = {
    id: 'PT-0001-0001',
    studyId: 'ST-PLANCHECK000001',
    name: 'Test Account Holder',
    birthDate: '1990-01-01',
    sex: SEX_CODES.FEMALE,
    linkedUserId: userId,
    assignedPractitionerIds: [],
    assignedHealthWorkerIds: [],
    consent: null,
    respiratoryHistory: [],
    familyHistory: [],
    preferredLanguage: 'en',
    isDemo: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
  }
  await db.patients.add(patient)
  return patient
}

async function seedPlan(status: string, intervalDays = 14, patientId = 'PT-0001-0001') {
  const plan: MonitoringPlan = {
    id: `plan-${crypto.randomUUID()}`,
    patientId,
    practitionerId: 'doc-1',
    status,
    createdAt: '2026-08-02T00:00:00.000Z',
    details: {
      intervalDays,
      locationCodes: [LOCATION_CODES.R_UPPER, LOCATION_CODES.L_UPPER],
      startDate: '2026-08-05',
      followUpNote: 'Tell the health worker if the cough gets worse at night.',
    },
  }
  await db.monitoringPlans.add(plan)
  return plan
}

function renderRehab() {
  // Bound to this test's database; without it the page reads the module
  // singleton, which points at the real one and has nothing in it.
  const repository = createPatientRepository(db)
  render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter initialEntries={[PATIENT_PATHS.rehab]}>
          <Routes>
            <Route path={PATIENT_PATHS.rehab} element={<RehabPage repository={repository} />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

describe('a patient can read what their practitioner has asked for', () => {
  it('shows the active plan in plain language', async () => {
    await seedPatient()
    await seedPlan(PLAN_STATUSES.ACTIVE)
    renderRehab()

    expect(await screen.findByText(t('rehab.plan.heading'))).toBeInTheDocument()
    // "Every 2 weeks", not "every 14 days" and not a schedule expression.
    expect(screen.getByText(t('rehab.plan.everyNWeeks', { count: 2 }))).toBeInTheDocument()
    expect(screen.getByText(t('rehab.plan.wherePlural', { count: 2 }))).toBeInTheDocument()
  })

  it('names the places on the chest rather than showing codes', async () => {
    await seedPatient()
    await seedPlan(PLAN_STATUSES.ACTIVE)
    renderRehab()

    await screen.findByText(t('rehab.plan.heading'))
    expect(
      screen.getByText(appI18n.t(`codes:location.${LOCATION_CODES.R_UPPER}`)),
    ).toBeInTheDocument()
    // A patient reading "R_UPPER" learns nothing.
    expect(screen.queryByText('R_UPPER')).not.toBeInTheDocument()
  })

  it('says days when the interval is not whole weeks', async () => {
    await seedPatient()
    await seedPlan(PLAN_STATUSES.ACTIVE, 10)
    renderRehab()
    expect(
      await screen.findByText(t('rehab.plan.everyNDays', { count: 10 })),
    ).toBeInTheDocument()
  })

  it('shows the practitioner’s follow-up note', async () => {
    await seedPatient()
    await seedPlan(PLAN_STATUSES.ACTIVE)
    renderRehab()
    expect(
      await screen.findByText('Tell the health worker if the cough gets worse at night.'),
    ).toBeInTheDocument()
  })

  it('does NOT show a draft plan', async () => {
    // A draft is the practitioner's working copy. Showing it invites the
    // patient to follow instructions nobody has approved.
    await seedPatient()
    await seedPlan(PLAN_STATUSES.DRAFT)
    renderRehab()

    await waitFor(() => expect(screen.getByText(t('rehab.empty.title'))).toBeInTheDocument())
    expect(screen.queryByText(t('rehab.plan.heading'))).not.toBeInTheDocument()
  })

  it('does NOT show an archived plan', async () => {
    await seedPatient()
    await seedPlan(PLAN_STATUSES.ARCHIVED)
    renderRehab()

    await waitFor(() => expect(screen.getByText(t('rehab.empty.title'))).toBeInTheDocument())
    expect(screen.queryByText(t('rehab.plan.heading'))).not.toBeInTheDocument()
  })

  it('does NOT show another patient’s plan', async () => {
    await seedPatient()
    await seedPlan(PLAN_STATUSES.ACTIVE, 14, 'PT-9999-9999')
    renderRehab()

    await waitFor(() => expect(screen.getByText(t('rehab.empty.title'))).toBeInTheDocument())
    expect(screen.queryByText(t('rehab.plan.heading'))).not.toBeInTheDocument()
  })

  it('shows nothing at all when there is no plan, rather than an empty card', async () => {
    await seedPatient()
    renderRehab()
    await waitFor(() => expect(screen.getByText(t('rehab.empty.title'))).toBeInTheDocument())
    expect(screen.queryByText(t('rehab.plan.heading'))).not.toBeInTheDocument()
  })

  it('survives a plan row it cannot interpret', async () => {
    // Written by an older build. Treated as no plan, which is inert -- the
    // same as the practitioner screen does.
    await seedPatient()
    await db.monitoringPlans.add({
      id: 'plan-broken',
      patientId: 'PT-0001-0001',
      practitionerId: 'doc-1',
      status: PLAN_STATUSES.ACTIVE,
      createdAt: '2026-08-02T00:00:00.000Z',
      details: { intervalDays: 'fortnightly' },
    } as unknown as MonitoringPlan)

    renderRehab()
    await waitFor(() => expect(screen.getByText(t('rehab.empty.title'))).toBeInTheDocument())
    expect(screen.queryByText(t('rehab.plan.heading'))).not.toBeInTheDocument()
  })
})
