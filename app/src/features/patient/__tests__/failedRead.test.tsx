import { cleanup, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../../../auth/AuthContext'
import type { AuthService } from '../../../auth/authService'
import { createTestAuthService } from '../../../auth/testing'
import { ROLES, USER_STATUSES } from '../../../db/codes'
import { AuscultaDB } from '../../../db/db'
import { i18n as appI18n } from '../../../i18n'
import { EMPTY_OVERVIEW, type PatientRepository } from '../data/patientRepository'
import { registerPatientResources } from '../i18n'
import { PatientHomePage } from '../pages/PatientHomePage'
import { ResultsListPage } from '../pages/ResultsListPage'
import { TrendsPage } from '../pages/TrendsPage'
import { PatientHistoryPage } from '../pages/PatientHistoryPage'

registerPatientResources(appI18n)
const t = (key: string) => appI18n.t(`patient:${key}`)

/**
 * A failed read must never be shown as an all-clear.
 *
 * The clinician screens shipped exactly this defect: a read that threw rendered
 * "Nothing waiting" on a review queue nobody had managed to read. On the
 * patient side the same shape would tell someone they have no results when the
 * database merely could not be opened — and "no results" reads as reassurance.
 *
 * PatientScreen checks `error` before it checks for a missing record, so the
 * behaviour is already right. Nothing pinned it, which is how the clinician
 * screens got it wrong, so this pins it on every screen that loads a record.
 */

const PASSWORD = 'patient-pass-1'

let db: AuscultaDB
let auth: AuthService

/** Every read rejects, exactly as a broken or blocked database would. */
const failingRepository: PatientRepository = {
  findLinkedPatient: () => Promise.reject(new Error('database unavailable')),
  loadOverview: () => Promise.reject(new Error('database unavailable')),
  loadExampleOverview: () => Promise.reject(new Error('database unavailable')),
  readAudio: () => Promise.reject(new Error('database unavailable')),
}

beforeEach(async () => {
  db = new AuscultaDB(`ausculta-patient-failread-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
  const user = await auth.register({
    username: 'patient-failread',
    password: PASSWORD,
    role: ROLES.PATIENT,
    name: 'Real Person',
    preferredLanguage: 'en',
  })
  await db.users.update(user.id, { status: USER_STATUSES.ACTIVE })
  await auth.login(user.username, PASSWORD)
})

afterEach(cleanup)

function renderScreen(element: React.ReactNode) {
  return render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter>{element}</MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

const SCREENS: [string, (repo: PatientRepository) => React.ReactNode][] = [
  ['home', (repository) => <PatientHomePage repository={repository} />],
  ['results', (repository) => <ResultsListPage repository={repository} />],
  ['trends', (repository) => <TrendsPage repository={repository} />],
  ['history', (repository) => <PatientHistoryPage repository={repository} />],
]

describe('a read that fails is never shown as an all-clear', () => {
  for (const [name, make] of SCREENS) {
    it(`${name}: says the record could not be read`, async () => {
      renderScreen(make(failingRepository))

      expect(await screen.findByText(t('shared.loadError'))).toBeInTheDocument()
      expect(screen.getByRole('button', { name: t('shared.retry') })).toBeInTheDocument()
    })

    it(`${name}: does not claim the account has no record`, async () => {
      renderScreen(make(failingRepository))
      await screen.findByText(t('shared.loadError'))

      // "Your health record is not linked yet" is a statement of fact about the
      // account. After a failed read the app does not know whether it is true,
      // and saying it anyway is the false-reassurance defect.
      expect(screen.queryByText(t('shared.noRecord.title'))).not.toBeInTheDocument()
      expect(screen.queryByText(t('shared.noRecord.body'))).not.toBeInTheDocument()
    })

    it(`${name}: shows no result or visit content`, async () => {
      renderScreen(make(failingRepository))
      await screen.findByText(t('shared.loadError'))

      // Nothing that would read as "we looked, and there is nothing".
      expect(screen.queryByText(t('results.empty.title'))).not.toBeInTheDocument()
      expect(screen.queryByText(t('home.latestHeading'))).not.toBeInTheDocument()
    })
  }
})

describe('the honest empty states stay distinguishable from a failure', () => {
  it('an account with genuinely no record says so, and does not show the error', async () => {
    const emptyRepository: PatientRepository = {
      findLinkedPatient: () => Promise.resolve(null),
      loadOverview: () => Promise.resolve(EMPTY_OVERVIEW),
      loadExampleOverview: () => Promise.resolve(EMPTY_OVERVIEW),
      readAudio: () => Promise.resolve(null),
    }
    renderScreen(<PatientHomePage repository={emptyRepository} />)

    expect(await screen.findByText(t('shared.noRecord.title'))).toBeInTheDocument()
    expect(screen.queryByText(t('shared.loadError'))).not.toBeInTheDocument()
  })
})
