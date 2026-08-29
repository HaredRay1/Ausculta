import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONSENT_STATUSES, ROLES, SEX_CODES, USER_STATUSES } from '../../db/codes'
import { AuscultaDB } from '../../db/db'
import { setDemoMode } from '../demo/demoMode'
import type { User } from '../../db/types'
import { i18n as appI18n } from '../../i18n'
import { AuthProvider } from '../../auth/AuthContext'
import type { AuthService } from '../../auth/authService'
import { createTestAuthService } from '../../auth/testing'
import { PatientDetailPage } from './PatientDetailPage'
import { PatientListPage } from './PatientListPage'
import { PatientRegistrationPage } from './PatientRegistrationPage'
import { DRAFT_EN_CONSENT_VERSION } from './consent'
import { createDraftStore } from './draft'
import { registerPatientsResources } from './i18n'
import { createPatientRepository, type Actor } from './repository'

registerPatientsResources(appI18n)

const t = (key: string, options?: Record<string, unknown>) => appI18n.t(`patients:${key}`, options)
const code = (key: string) => appI18n.t(`codes:${key}`)

const PASSWORD = 'clinic-pass-1'

let db: AuscultaDB
let auth: AuthService
let repo: ReturnType<typeof createPatientRepository>

beforeEach(() => {
  db = new AuscultaDB(`ausculta-patient-pages-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
  repo = createPatientRepository(db)
})

afterEach(cleanup)

/**
 * Registers, activates and signs in a user so AuthProvider restores a real
 * session on mount. Returns the actor these screens will scope by — the id
 * comes from the service, so tests use the same one the page sees.
 */
async function signIn(role: User['role'] = ROLES.HEALTH_WORKER): Promise<Actor> {
  const user = await auth.register({
    username: `user-${role.toLowerCase()}`,
    password: PASSWORD,
    role,
    name: 'Nurse Ana',
    preferredLanguage: 'en',
  })
  // Health workers, practitioners and researchers register as
  // PENDING_VERIFICATION; the verification queue is not what these tests cover.
  await db.users.update(user.id, { status: USER_STATUSES.ACTIVE })
  await auth.login(user.username, PASSWORD)
  return { id: user.id, role }
}

function renderWithAuth(
  element: React.ReactNode,
  path = '/patients',
  routePath = '/patients',
) {
  return render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={element} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

const OTHER_WORKER: Actor = { id: 'worker-b', role: ROLES.HEALTH_WORKER }

const demographics = {
  name: 'Maria Dela Cruz',
  birthDate: '1978-03-14',
  sex: SEX_CODES.FEMALE,
}

describe('registration form', () => {
  it('shows a visible label for every field, never a placeholder alone', async () => {
    await signIn()
    renderWithAuth(<PatientRegistrationPage repository={repo} draftStore={createDraftStore(db)} />)

    for (const label of [t('field.name'), t('field.birthDate'), t('field.sex')]) {
      expect(await screen.findByLabelText(new RegExp(label, 'i'))).toBeInTheDocument()
    }
  })

  it('offers every sex code as a choice, from the registry', async () => {
    await signIn()
    renderWithAuth(<PatientRegistrationPage repository={repo} draftStore={createDraftStore(db)} />)

    for (const value of Object.values(SEX_CODES)) {
      expect(
        await screen.findByRole('option', { name: code(`sex.${value}`) }),
      ).toBeInTheDocument()
    }
  })

  it('presents the consent document and its unapproved-draft warning', async () => {
    await signIn()
    renderWithAuth(<PatientRegistrationPage repository={repo} draftStore={createDraftStore(db)} />)

    expect(await screen.findByText(t('consent.draftWarningTitle'))).toBeInTheDocument()
    // And says plainly why there is no Filipino version.
    expect(screen.getByText(t('consent.languageNotice'))).toBeInTheDocument()
  })

  it('saves a patient and shows the clinic ID to write on the paper form', async () => {
    const actor = await signIn()
    renderWithAuth(<PatientRegistrationPage repository={repo} draftStore={createDraftStore(db)} />)

    fireEvent.change(await screen.findByLabelText(new RegExp(t('field.name'), 'i')), {
      target: { value: 'Maria Dela Cruz' },
    })
    fireEvent.change(screen.getByLabelText(new RegExp(t('field.birthDate'), 'i')), {
      target: { value: '1978-03-14' },
    })
    fireEvent.change(screen.getByLabelText(new RegExp(t('field.sex'), 'i')), {
      target: { value: SEX_CODES.FEMALE },
    })
    fireEvent.click(screen.getByRole('button', { name: t('register.submit') }))

    // The confirmation names itself in both the app bar and the banner.
    expect((await screen.findAllByText(t('register.savedTitle'))).length).toBeGreaterThan(0)

    const saved = await repo.list(actor)
    expect(saved).toHaveLength(1)
    expect(saved[0]?.name).toBe('Maria Dela Cruz')
    // The ID is on screen, because the worker has to copy it onto paper.
    expect(screen.getByText(new RegExp(saved[0]?.id ?? 'none'))).toBeInTheDocument()
  })

  // The impossible-date rules (2025-02-30, leap years, the future) are unit
  // tested in validation.test.ts. They cannot be driven through this form,
  // because `type="date"` refuses to hold such a value in the first place --
  // which is the point of using it. What this test covers is the reachable
  // failure: a missing answer, reported without discarding the rest.
  it('reports a missing birth date beneath the field, keeping what was typed', async () => {
    await signIn()
    renderWithAuth(<PatientRegistrationPage repository={repo} draftStore={createDraftStore(db)} />)

    fireEvent.change(await screen.findByLabelText(new RegExp(t('field.name'), 'i')), {
      target: { value: 'Maria Dela Cruz' },
    })
    fireEvent.change(screen.getByLabelText(new RegExp(t('field.sex'), 'i')), {
      target: { value: SEX_CODES.FEMALE },
    })
    fireEvent.click(screen.getByRole('button', { name: t('register.submit') }))

    expect(await screen.findByText(t('error.BIRTH_DATE_REQUIRED'))).toBeInTheDocument()
    // What they already typed is still there.
    expect(screen.getByLabelText(new RegExp(t('field.name'), 'i'))).toHaveValue('Maria Dela Cruz')
    expect(await db.patients.count()).toBe(0)
  })

  it('brings back a draft after the worker navigates away and returns', async () => {
    const actor = await signIn()
    const drafts = createDraftStore(db)
    await drafts.save(actor.id, {
      demographics: { ...demographics, name: 'Half Typed Name' },
      respiratoryHistory: [],
      familyHistory: [],
    })

    renderWithAuth(<PatientRegistrationPage repository={repo} draftStore={drafts} />)

    await waitFor(() =>
      expect(screen.getByLabelText(new RegExp(t('field.name'), 'i'))).toHaveValue('Half Typed Name'),
    )
    expect(screen.getByText(t('register.draftRestored'))).toBeInTheDocument()
  })
})

describe('patient list', () => {
  it('shows the patients assigned to the signed-in worker', async () => {
    const actor = await signIn()
    await repo.create({ demographics, preferredLanguage: 'en' }, actor)

    renderWithAuth(<PatientListPage repository={repo} />)

    expect(await screen.findByText('Maria Dela Cruz')).toBeInTheDocument()
  })

  it('does not show another worker’s patients', async () => {
    await signIn()
    await repo.create(
      { demographics: { ...demographics, name: 'Someone Elses Patient' }, preferredLanguage: 'en' },
      OTHER_WORKER,
    )

    renderWithAuth(<PatientListPage repository={repo} />)

    expect(await screen.findByText(t('list.empty'))).toBeInTheDocument()
    expect(screen.queryByText('Someone Elses Patient')).not.toBeInTheDocument()
  })

  it('never says "no patients yet" when the read failed', async () => {
    // A health worker would conclude the register was empty and re-register
    // somebody who is already in it.
    await signIn()
    const broken = {
      ...repo,
      search: () => Promise.reject(new Error('database unavailable')),
    } as unknown as typeof repo

    renderWithAuth(<PatientListPage repository={broken} />)

    expect(await screen.findByText(t('list.loadFailed'))).toBeInTheDocument()
    expect(screen.queryByText(t('list.empty'))).not.toBeInTheDocument()
  })

  it('offers a way forward from an empty list rather than a dead end', async () => {
    await signIn()
    renderWithAuth(<PatientListPage repository={repo} />)

    expect(await screen.findByText(t('list.empty'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('list.register') })).toBeInTheDocument()
  })

  it('flags a patient with no consent recorded', async () => {
    const actor = await signIn()
    await repo.create({ demographics, preferredLanguage: 'en' }, actor)

    renderWithAuth(<PatientListPage repository={repo} />)
    expect(await screen.findByText(t('card.consentMissing'))).toBeInTheDocument()
  })

  it('narrows to a match as the worker searches', async () => {
    const actor = await signIn()
    await repo.create({ demographics, preferredLanguage: 'en' }, actor)
    await repo.create(
      { demographics: { ...demographics, name: 'Juan Santos' }, preferredLanguage: 'en' },
      actor,
    )

    renderWithAuth(<PatientListPage repository={repo} />)
    expect(await screen.findByText('Juan Santos')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(new RegExp(t('list.searchLabel'), 'i')), {
      target: { value: 'maria' },
    })

    await waitFor(() => expect(screen.queryByText('Juan Santos')).not.toBeInTheDocument())
    expect(screen.getByText('Maria Dela Cruz')).toBeInTheDocument()
  })

  it('labels seeded rows as fictional in the list', async () => {
    const actor = await signIn()
    await setDemoMode(true, db)
    await repo.create({ demographics, preferredLanguage: 'en', isDemo: 1 }, actor)

    renderWithAuth(<PatientListPage repository={repo} />)

    expect(await screen.findByText('Maria Dela Cruz')).toBeInTheDocument()
    expect(screen.getByText(/not a real/i)).toBeInTheDocument()
  })

  it('does not label real rows as fictional', async () => {
    const actor = await signIn()
    await repo.create({ demographics, preferredLanguage: 'en' }, actor)

    renderWithAuth(<PatientListPage repository={repo} />)

    expect(await screen.findByText('Maria Dela Cruz')).toBeInTheDocument()
    expect(screen.queryByText(/not a real/i)).not.toBeInTheDocument()
  })

  it('answers a researcher instead of showing them a blank screen', async () => {
    // The validation protocol has people navigate unaided and scores a dead
    // end as a navigation failure, so every reachable role gets an answer.
    await signIn(ROLES.RESEARCHER)

    renderWithAuth(<PatientListPage repository={repo} />)
    expect(await screen.findByText(t('list.researcherBlocked'))).toBeInTheDocument()
  })
})

describe('patient detail', () => {
  it('shows the language and version of the consent text presented', async () => {
    const actor = await signIn()
    const patient = await repo.create({ demographics, preferredLanguage: 'en' }, actor)
    await repo.recordConsent(
      patient.id,
      { status: CONSENT_STATUSES.GRANTED, documentVersion: DRAFT_EN_CONSENT_VERSION },
      actor,
    )

    renderWithAuth(
      <PatientDetailPage repository={repo} />,
      `/patients/${patient.id}`,
      '/patients/:patientId',
    )

    expect(
      await screen.findByText(code(`consentStatus.${CONSENT_STATUSES.GRANTED}`)),
    ).toBeInTheDocument()
    expect(
      screen.getByText(t('consent.version', { version: DRAFT_EN_CONSENT_VERSION })),
    ).toBeInTheDocument()
  })

  it('warns when consent has not been recorded', async () => {
    const actor = await signIn()
    const patient = await repo.create({ demographics, preferredLanguage: 'en' }, actor)

    renderWithAuth(
      <PatientDetailPage repository={repo} />,
      `/patients/${patient.id}`,
      '/patients/:patientId',
    )

    expect(await screen.findByText(t('consent.notRecorded'))).toBeInTheDocument()
  })

  it('explains a record the worker cannot see, and offers a way back', async () => {
    await signIn()
    const theirs = await repo.create({ demographics, preferredLanguage: 'en' }, OTHER_WORKER)

    renderWithAuth(
      <PatientDetailPage repository={repo} />,
      `/patients/${theirs.id}`,
      '/patients/:patientId',
    )

    expect(await screen.findByText(t('detail.notFound'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('detail.backToList') })).toBeInTheDocument()
    // The name must not leak through the not-found screen.
    expect(screen.queryByText('Maria Dela Cruz')).not.toBeInTheDocument()
  })

  it('labels a seeded patient as fictional, above the clinical content', async () => {
    // A pulmonologist scores patient safety on this screen. A clinician
    // mistaking seeded data for a real patient is the one outcome this project
    // cannot allow, so the label must be present and must not be reachable
    // only by scrolling past the record.
    const actor = await signIn()
    await setDemoMode(true, db)
    const patient = await repo.create(
      { demographics, preferredLanguage: 'en', isDemo: 1 },
      actor,
    )

    renderWithAuth(
      <PatientDetailPage repository={repo} />,
      `/patients/${patient.id}`,
      '/patients/:patientId',
    )

    const banner = await screen.findByText(/not a real/i)
    expect(banner).toBeInTheDocument()

    // Above the first clinical section in document order.
    const demographicsHeading = screen.getByText(t('detail.demographics'))
    expect(banner.compareDocumentPosition(demographicsHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('does not label a real patient as fictional', async () => {
    const actor = await signIn()
    const patient = await repo.create({ demographics, preferredLanguage: 'en' }, actor)

    renderWithAuth(
      <PatientDetailPage repository={repo} />,
      `/patients/${patient.id}`,
      '/patients/:patientId',
    )

    await screen.findByText(t('detail.demographics'))
    expect(screen.queryByText(/not a real/i)).not.toBeInTheDocument()
  })

  it('offers the health worker a way to record, which is why they opened it', async () => {
    // Finding a patient then recording them is the core journey, and nothing
    // in the app linked to /assessment/new before this.
    const actor = await signIn()
    const patient = await repo.create({ demographics, preferredLanguage: 'en' }, actor)

    renderWithAuth(
      <PatientDetailPage repository={repo} />,
      `/patients/${patient.id}`,
      '/patients/:patientId',
    )

    const start = await screen.findByRole('button', { name: t('detail.startAssessment') })
    expect(start).toBeInTheDocument()
    // Above the clinical detail, so it needs no scrolling on a 360px phone.
    const demographics_heading = screen.getByText(t('detail.demographics'))
    expect(start.compareDocumentPosition(demographics_heading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('offers the monitoring plan and trend, which nothing else links to', async () => {
    const actor = await signIn()
    const patient = await repo.create({ demographics, preferredLanguage: 'en' }, actor)

    renderWithAuth(
      <PatientDetailPage repository={repo} />,
      `/patients/${patient.id}`,
      '/patients/:patientId',
    )

    expect(
      await screen.findByRole('button', { name: t('detail.monitoringPlan') }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('detail.trends') })).toBeInTheDocument()
  })

  it('shows the linked account by username, not by its internal id', async () => {
    // The string promises a username; it used to interpolate the raw user id,
    // so a health worker read an opaque identifier where a name was offered.
    const actor = await signIn()
    const patient = await repo.create({ demographics, preferredLanguage: 'en' }, actor)
    const account = await auth.register({
      username: 'maria',
      password: PASSWORD,
      role: ROLES.PATIENT,
      name: 'Maria Dela Cruz',
      preferredLanguage: 'en',
    })
    await repo.linkAccount(patient.id, 'maria', actor)

    renderWithAuth(
      <PatientDetailPage repository={repo} />,
      `/patients/${patient.id}`,
      '/patients/:patientId',
    )

    expect(
      await screen.findByText(t('account.linked', { username: 'maria' })),
    ).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(account.id))).not.toBeInTheDocument()
  })

  it('labels the study number as carrying no personal details', async () => {
    const actor = await signIn()
    const patient = await repo.create({ demographics, preferredLanguage: 'en' }, actor)

    renderWithAuth(
      <PatientDetailPage repository={repo} />,
      `/patients/${patient.id}`,
      '/patients/:patientId',
    )

    expect(await screen.findByText(patient.studyId)).toBeInTheDocument()
    expect(screen.getByText(t('detail.studyIdHint'))).toBeInTheDocument()
  })
})
