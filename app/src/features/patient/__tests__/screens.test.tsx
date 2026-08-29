import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../../../auth/AuthContext'
import type { AuthService } from '../../../auth/authService'
import { createTestAuthService } from '../../../auth/testing'
import {
  AI_STATUS,
  CLASSIFICATION_CODES,
  CONSENT_STATUSES,
  FAMILY_HISTORY_CODES,
  INTERPRETATION_CODES,
  LOCATION_CODES,
  RESPIRATORY_HISTORY_CODES,
  REVIEW_STATUSES,
  ROLES,
  SEX_CODES,
  type LocationCode,
} from '../../../db/codes'
import { AuscultaDB } from '../../../db/db'
import type { Assessment, Patient, Recording } from '../../../db/types'
import { i18n as appI18n } from '../../../i18n'
import { setExampleRecordShown } from '../data/examplePreview'
import { setDemoMode } from '../../demo/demoMode'
import { seedDemoData } from '../../demo/seed'
import { createPatientRepository } from '../data/patientRepository'
import { formatLongDate } from '../format'
import { registerPatientResources } from '../i18n'
import { PATIENT_PATHS } from '../navigation'
import { PatientHistoryPage } from '../pages/PatientHistoryPage'
import { PatientHomePage } from '../pages/PatientHomePage'
import { RehabPage } from '../pages/RehabPage'
import { ResultDetailPage } from '../pages/ResultDetailPage'
import { ResultsListPage } from '../pages/ResultsListPage'
import { TrendsPage } from '../pages/TrendsPage'

registerPatientResources(appI18n)

const t = (key: string, options?: Record<string, unknown>) => appI18n.t(`patient:${key}`, options)
const code = (key: string) => appI18n.t(`codes:${key}`)
const design = (key: string) => appI18n.t(`design:${key}`)

/** The date exactly as the screen formats it, so no test pins a locale. */
const onScreenDate = (iso: string) => formatLongDate(iso, appI18n.language)

const PASSWORD = 'patient-pass-1'

let db: AuscultaDB
let auth: AuthService
let userId: string

beforeEach(async () => {
  db = new AuscultaDB(`ausculta-patient-test-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
  const user = await auth.register({
    username: 'marisol',
    password: PASSWORD,
    role: ROLES.PATIENT,
    // Deliberately NOT any seeded patient's name. The greeting reads
    // user.name, so a fixture sharing a demo patient's name would pass whether
    // the greeting were right or wrong, and would read as though greeting-by-
    // patient-name were intended.
    name: 'Test Account Holder',
  })
  userId = user.id
  await auth.login('marisol', PASSWORD)
})

afterEach(async () => {
  cleanup()
  db.close()
})

// --- fixtures ---------------------------------------------------------------

function patientRow(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'pt-1',
    studyId: 'ST-000000000001',
    linkedUserId: userId,
    assignedPractitionerIds: [],
    assignedHealthWorkerIds: [],
    consent: {
      status: CONSENT_STATUSES.GRANTED,
      language: 'fil',
      textVersion: 'consent-v1',
      presentedAt: '2026-06-01T01:30:00.000Z',
      recordedBy: 'DEMO-STAFF-HW1',
    },
    name: 'Test Account Holder',
    birthDate: '1992-03-14',
    sex: SEX_CODES.FEMALE,
    address: 'Barangay Macarascas',
    respiratoryHistory: [
      { code: RESPIRATORY_HISTORY_CODES.ASTHMA_DIAGNOSED, present: true },
      { code: RESPIRATORY_HISTORY_CODES.SMOKER_CURRENT, present: false },
      // TUBERCULOSIS_PAST deliberately absent: nobody asked.
    ],
    familyHistory: [{ code: FAMILY_HISTORY_CODES.FAMILY_ASTHMA, present: true }],
    preferredLanguage: 'fil',
    isDemo: 0,
    createdAt: '2026-06-01T01:30:00.000Z',
    ...overrides,
  }
}

function assessmentRow(id: string, date: string, overrides: Partial<Assessment> = {}): Assessment {
  return {
    id,
    patientId: 'pt-1',
    assessorId: 'DEMO-STAFF-HW1',
    date,
    symptoms: [],
    vitals: [],
    reviewStatus: REVIEW_STATUSES.PENDING_REVIEW,
    interfaceLanguage: 'en',
    questionnaireLanguage: 'en',
    questionnaireVersion: 'v1',
    aiSeverity: {
      score: null,
      category: null,
      modelVersion: null,
      calculatedAt: null,
      thresholdConfigVersion: 1,
      status: 'MODEL_NOT_CONNECTED',
    },
    isDemo: 0,
    createdAt: date,
    ...overrides,
  }
}

function recordingRow(
  id: string,
  assessmentId: string,
  location: LocationCode,
  overrides: Partial<Recording> = {},
): Recording {
  return {
    id,
    assessmentId,
    patientId: 'pt-1',
    locationCode: location,
    audioBlobId: `blob-${id}`,
    audioSource: 'DEVICE_WAV_IMPORT',
    importedSampleRate: 16000,
    bitDepth: 16,
    channels: 1,
    durationSec: 12,
    quality: null,
    aiStatus: AI_STATUS.ANALYZED,
    isDemo: 0,
    createdAt: assessmentId === 'as-1' ? '2026-08-01T01:30:00.000Z' : '2026-08-20T01:30:00.000Z',
    ...overrides,
  }
}

async function seedLinkedPatient(options: {
  assessments?: Assessment[]
  recordings?: Recording[]
  patient?: Partial<Patient>
} = {}) {
  await db.patients.put(patientRow(options.patient ?? {}))
  if (options.assessments !== undefined) await db.assessments.bulkPut(options.assessments)
  if (options.recordings !== undefined) await db.recordings.bulkPut(options.recordings)
}

/**
 * Mounts the real screens on the real route paths.
 *
 * Not `patientRoutes` itself, because those wrap each element in `RequireRole`
 * bound to the app's module-level repository — these tests need the injected
 * one. The paths and the components are the same, so navigation between screens
 * is still exercised end to end.
 */
function renderAt(path: string) {
  const repository = createPatientRepository(db)
  render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={PATIENT_PATHS.home} element={<PatientHomePage repository={repository} />} />
            <Route
              path={PATIENT_PATHS.results}
              element={<ResultsListPage repository={repository} />}
            />
            <Route
              path={`${PATIENT_PATHS.results}/:assessmentId`}
              element={<ResultDetailPage repository={repository} />}
            />
            <Route path={PATIENT_PATHS.trends} element={<TrendsPage repository={repository} />} />
            <Route
              path={PATIENT_PATHS.history}
              element={<PatientHistoryPage repository={repository} />}
            />
            <Route path={PATIENT_PATHS.rehab} element={<RehabPage repository={repository} />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

/** Every digit rendered anywhere in the document, dates excluded. */
function numeralsOnScreen(): string[] {
  const text = document.body.textContent ?? ''
  return text.match(/\d+/g) ?? []
}

// --- the scored journey ------------------------------------------------------

describe('finding my results', () => {
  beforeEach(async () => {
    await seedLinkedPatient({
      assessments: [assessmentRow('as-1', '2026-08-01T01:30:00.000Z')],
      recordings: [
        recordingRow('r1', 'as-1', LOCATION_CODES.R_UPPER, {
          aiClassification: CLASSIFICATION_CODES.HEALTHY,
          aiConfidence: 0.9,
        }),
      ],
    })
  })

  /**
   * The literal validation task: "Find where you can view your respiratory
   * assessment results." One tap from home, twice over.
   */
  it('offers a one-tap link to results on the home screen', async () => {
    renderAt(PATIENT_PATHS.home)
    await screen.findByText(t('home.greeting', { name: 'Test Account Holder' }))

    const tile = screen.getByRole('link', { name: new RegExp(t('home.quickResults'), 'i') })
    expect(tile).toHaveAttribute('href', PATIENT_PATHS.results)
  })

  it('also offers results in the bottom navigation from every screen', async () => {
    renderAt(PATIENT_PATHS.home)
    await screen.findByText(t('home.greeting', { name: 'Test Account Holder' }))

    const nav = screen.getByRole('navigation', { name: t('nav.label') })
    expect(within(nav).getByText(t('nav.results'))).toBeInTheDocument()
    // Icon AND text on every entry: an unlabelled glyph is not discoverable.
    for (const id of ['home', 'results', 'trends', 'history', 'rehab']) {
      expect(within(nav).getByText(t(`nav.${id}`))).toBeInTheDocument()
    }
  })

  it('links each result row straight to its full result', async () => {
    renderAt(PATIENT_PATHS.results)
    const row = await screen.findByRole('link', {
      name: new RegExp(onScreenDate('2026-08-01T01:30:00.000Z')),
    })
    expect(row).toHaveAttribute('href', `${PATIENT_PATHS.results}/as-1`)
  })
})

// --- the no-number rule ------------------------------------------------------

describe('degraded states render no number anywhere', () => {
  const cases: { name: string; overrides: Partial<Recording> }[] = [
    {
      name: 'the listening tool was not connected',
      overrides: { aiStatus: AI_STATUS.MODEL_NOT_CONNECTED },
    },
    {
      name: 'the recording was not clear enough',
      overrides: { aiStatus: AI_STATUS.INSUFFICIENT_QUALITY },
    },
    {
      name: 'the result was uncertain',
      overrides: { uncertainFlag: true },
    },
  ]

  it.each(cases)('$name', async ({ overrides }) => {
    await seedLinkedPatient({
      assessments: [assessmentRow('as-1', '2026-08-01T01:30:00.000Z')],
      recordings: [
        recordingRow('r1', 'as-1', LOCATION_CODES.R_UPPER, {
          // The row carries a confidence it must never be allowed to render.
          aiConfidence: 0.87,
          ...overrides,
        }),
      ],
    })

    renderAt(`${PATIENT_PATHS.results}/as-1`)
    await screen.findByText(t('results.perLocationHeading'))

    // The percentage the design system would render if a number were passed.
    expect(screen.queryByText(design('confidence.label'))).not.toBeInTheDocument()
    expect(screen.queryByText('87%')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/8\s*7\s*%/)
    expect(numeralsOnScreen()).not.toContain('87')
  })

  it('renders the severity slot as an explicit no-value panel, never a figure', async () => {
    await seedLinkedPatient({
      assessments: [
        assessmentRow('as-1', '2026-08-01T01:30:00.000Z', {
          // Even with a score stored on the row, the patient screen must not
          // show it: severity is not a built capability.
          aiSeverity: {
            score: 68,
            category: 'HIGH',
            modelVersion: 'x@1',
            calculatedAt: '2026-08-01T01:30:00.000Z',
            thresholdConfigVersion: 1,
            status: 'CALCULATED',
          },
        }),
      ],
      recordings: [recordingRow('r1', 'as-1', LOCATION_CODES.R_UPPER, { uncertainFlag: true })],
    })

    renderAt(`${PATIENT_PATHS.results}/as-1`)
    await screen.findByText(t('results.severityBody'))

    expect(screen.getAllByText(design('notConnected.noValue')).length).toBeGreaterThan(0)
    expect(numeralsOnScreen()).not.toContain('68')
    expect(screen.queryByText('HIGH')).not.toBeInTheDocument()
  })

  it('does not claim a clearness check that never ran', async () => {
    await seedLinkedPatient({
      assessments: [assessmentRow('as-1', '2026-08-01T01:30:00.000Z')],
      recordings: [
        // quality: null — nothing measured this signal, which is the state most
        // imported and seeded audio is actually in.
        recordingRow('r1', 'as-1', LOCATION_CODES.R_UPPER, {
          quality: null,
          aiClassification: CLASSIFICATION_CODES.HEALTHY,
          aiConfidence: 0.9,
        }),
      ],
    })

    renderAt(`${PATIENT_PATHS.results}/as-1`)
    await screen.findByText(t('results.perLocationHeading'))

    expect(screen.getByText(t('results.qualityUnknown'))).toBeInTheDocument()
    expect(screen.queryByText(t('results.qualityOk'))).not.toBeInTheDocument()
  })

  it('shows a confidence only where the app actually named something', async () => {
    await seedLinkedPatient({
      assessments: [assessmentRow('as-1', '2026-08-01T01:30:00.000Z')],
      recordings: [
        recordingRow('r1', 'as-1', LOCATION_CODES.R_UPPER, {
          aiClassification: CLASSIFICATION_CODES.ASTHMA,
          aiConfidence: 0.81,
        }),
        // A "nothing unusual" recording stores a probability for research and
        // must still render no number.
        recordingRow('r2', 'as-1', LOCATION_CODES.L_UPPER, {
          aiClassification: CLASSIFICATION_CODES.HEALTHY,
          aiConfidence: 0.93,
        }),
      ],
    })

    renderAt(`${PATIENT_PATHS.results}/as-1`)
    await screen.findByText(t('results.perLocationHeading'))

    expect(screen.getByText('81%')).toBeInTheDocument()
    expect(numeralsOnScreen()).not.toContain('93')
  })
})

// --- AI is never a clinician -------------------------------------------------

describe('AI output and practitioner review are distinguishable', () => {
  it('separates them by landmark, heading and caveat — not by colour', async () => {
    await seedLinkedPatient({
      assessments: [
        assessmentRow('as-1', '2026-08-01T01:30:00.000Z', {
          reviewStatus: REVIEW_STATUSES.APPROVED,
          practitionerReviewerId: 'DEMO-STAFF-DR1',
          practitionerSeverity: {
            interpretation: INTERPRETATION_CODES.CONFIRMED,
            notes: 'Widespread expiratory wheeze consistent with reported history.',
            reviewedAt: '2026-08-02T01:30:00.000Z',
          },
        }),
      ],
      recordings: [
        recordingRow('r1', 'as-1', LOCATION_CODES.R_UPPER, {
          aiClassification: CLASSIFICATION_CODES.ASTHMA,
          aiConfidence: 0.81,
        }),
      ],
    })

    renderAt(`${PATIENT_PATHS.results}/as-1`)
    await screen.findByText(t('review.aiHeading'))

    // Two separate landmarks with different accessible names.
    const aiRegion = screen.getByRole('region', { name: t('review.aiLabel') })
    const doctorRegion = screen.getByRole('region', { name: t('review.practitionerLabel') })
    expect(aiRegion).not.toBe(doctorRegion)

    // Each states in words what it is.
    expect(within(aiRegion).getByText(t('review.aiCaveat'))).toBeInTheDocument()
    expect(within(doctorRegion).getByText(t('review.practitionerCaveat'))).toBeInTheDocument()

    // The AI's finding lives inside the AI region and nowhere else.
    expect(
      within(aiRegion).getByText(
        t('results.possibleFindingIs', { condition: code('classification.ASTHMA') }),
      ),
    ).toBeInTheDocument()
    expect(
      within(doctorRegion).queryByText(
        t('results.possibleFindingIs', { condition: code('classification.ASTHMA') }),
      ),
    ).not.toBeInTheDocument()

    // The doctor's words live inside the doctor's region and nowhere else.
    expect(
      within(doctorRegion).getByText(/Widespread expiratory wheeze/),
    ).toBeInTheDocument()
    expect(within(aiRegion).queryByText(/Widespread expiratory wheeze/)).not.toBeInTheDocument()

    // Named as a person, with their designation, not as a bare id.
    expect(
      within(doctorRegion).getByText(new RegExp(t('review.reviewedBy', { name: 'Dr. Imelda Ocampo' }))),
    ).toBeInTheDocument()
    expect(doctorRegion.textContent).not.toContain('DEMO-STAFF-DR1')
  })

  it('states plainly when no person has checked a result', async () => {
    await seedLinkedPatient({
      assessments: [assessmentRow('as-1', '2026-08-01T01:30:00.000Z')],
      recordings: [
        recordingRow('r1', 'as-1', LOCATION_CODES.R_UPPER, {
          aiClassification: CLASSIFICATION_CODES.ASTHMA,
          aiConfidence: 0.81,
        }),
      ],
    })

    renderAt(`${PATIENT_PATHS.results}/as-1`)
    await screen.findByText(t('review.pending.title'))
    expect(screen.getByText(t('review.pending.body'))).toBeInTheDocument()
    // The absence of a review is stated, not left as whitespace.
    expect(
      screen.queryByRole('region', { name: t('review.practitionerLabel') }),
    ).not.toBeInTheDocument()
  })
})

// --- history -----------------------------------------------------------------

describe('my history', () => {
  it('does not render an unasked question as a negative', async () => {
    await seedLinkedPatient()
    renderAt(PATIENT_PATHS.history)
    await screen.findByText(t('history.profileHeading'))

    const notAsked = screen.getByRole('region', {
      name: `${t('history.respiratoryHeading')}: ${t('history.notAskedHeading')}`,
    })
    expect(
      within(notAsked).getByText(code('respiratoryHistory.TUBERCULOSIS_PAST')),
    ).toBeInTheDocument()
    expect(within(notAsked).getByText(t('history.notAskedNote'))).toBeInTheDocument()

    // And it is NOT in the "No" group.
    const no = screen.getByRole('region', {
      name: `${t('history.respiratoryHeading')}: ${t('history.noHeading')}`,
    })
    expect(
      within(no).queryByText(code('respiratoryHistory.TUBERCULOSIS_PAST')),
    ).not.toBeInTheDocument()
    expect(within(no).getByText(code('respiratoryHistory.SMOKER_CURRENT'))).toBeInTheDocument()
  })

  it('shows consent status and when it was given', async () => {
    await seedLinkedPatient()
    renderAt(PATIENT_PATHS.history)
    await screen.findByText(t('history.consentHeading'))
    expect(screen.getByText(code('consentStatus.GRANTED'))).toBeInTheDocument()
    expect(screen.getByText(onScreenDate('2026-06-01T01:30:00.000Z'))).toBeInTheDocument()
  })
})

// --- trends ------------------------------------------------------------------

describe('trends', () => {
  it('refuses to draw a line from a single visit', async () => {
    await seedLinkedPatient({
      assessments: [assessmentRow('as-1', '2026-08-01T01:30:00.000Z')],
      recordings: [recordingRow('r1', 'as-1', LOCATION_CODES.R_UPPER)],
    })

    renderAt(PATIENT_PATHS.trends)
    await screen.findByText(t('trends.empty.title'))
    expect(document.querySelector('polyline')).toBeNull()
    // Still not a dead end.
    expect(screen.getByRole('button', { name: t('trends.empty.action') })).toBeInTheDocument()
  })

  it('draws once there are two visits, in neutral wording', async () => {
    await seedLinkedPatient({
      assessments: [
        assessmentRow('as-1', '2026-08-01T01:30:00.000Z'),
        assessmentRow('as-2', '2026-08-20T01:30:00.000Z'),
      ],
      recordings: [
        recordingRow('r1', 'as-1', LOCATION_CODES.R_UPPER, {
          aiClassification: CLASSIFICATION_CODES.ASTHMA,
          aiConfidence: 0.8,
        }),
        recordingRow('r2', 'as-2', LOCATION_CODES.R_UPPER, {
          aiClassification: CLASSIFICATION_CODES.HEALTHY,
          aiConfidence: 0.9,
        }),
      ],
    })

    renderAt(PATIENT_PATHS.trends)
    await screen.findByText(t('trends.findingsChartTitle'))
    expect(document.querySelector('polyline')).not.toBeNull()

    // Says the pattern changed; never claims the person got better or worse.
    // The one sentence that uses those words is the disclaimer denying them,
    // so the assertion targets the claim about *the person*, not the vocabulary.
    expect(screen.getByText(t('trends.changeDetected'))).toBeInTheDocument()
    expect(screen.getByText(t('trends.changeNote'))).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/your (asthma|breathing|health|condition) is/i)
    expect(text).not.toMatch(/you are (getting|becoming) (better|worse)/i)
    expect(text).toContain(t('trends.changeNote'))

    // Severity is present as a slot and explicitly unavailable.
    expect(screen.getByText(t('trends.severityBody'))).toBeInTheDocument()
  })
})

// --- empty states ------------------------------------------------------------

describe('empty states teach rather than dead-end', () => {
  it('explains why there are no results yet and still offers a way on', async () => {
    await seedLinkedPatient()
    renderAt(PATIENT_PATHS.results)
    await screen.findByText(t('results.empty.title'))
    expect(screen.getByText(t('results.empty.body'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('shared.backHome') })).toBeInTheDocument()
  })

  it('explains an unlinked account without calling it an error', async () => {
    // No patient row at all: a validator five minutes after registering.
    renderAt(PATIENT_PATHS.home)
    await screen.findByText(t('shared.noRecord.title'))
    expect(screen.getByText(t('shared.noRecord.body'))).toBeInTheDocument()

    // Still not a dead end -- but ON HOME the way forward is the example, not
    // "Back to my health", which would navigate to the screen already shown.
    // This is the first screen a brand-new account meets, so a control that
    // visibly does nothing is the worst possible one to put on it.
    expect(
      screen.getByRole('button', { name: t('shared.noRecord.seeExample') }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('shared.backHome') }),
    ).not.toBeInTheDocument()
  })

  it('still offers the way home from a screen that is not home', async () => {
    renderAt(PATIENT_PATHS.results)
    await screen.findByText(t('shared.noRecord.title'))
    expect(screen.getByRole('button', { name: t('shared.backHome') })).toBeInTheDocument()
  })

  it('says a rehabilitation plan has not been assigned, and does not invent exercises', async () => {
    await seedLinkedPatient()
    renderAt(PATIENT_PATHS.rehab)
    await screen.findByText(t('rehab.empty.title'))
    expect(screen.getByText(t('rehab.empty.body'))).toBeInTheDocument()
    expect(screen.getByText(t('rehab.askNote'))).toBeInTheDocument()
    // No exercise content of any kind on a screen the app must not author.
    expect(document.body.textContent).not.toMatch(/inhale|exhale|pursed|repetitions/i)
  })

  it('shows the home screen empty state for a patient with no assessments', async () => {
    await seedLinkedPatient()
    renderAt(PATIENT_PATHS.home)
    await screen.findByText(t('home.greeting', { name: 'Test Account Holder' }))
    expect(screen.getByText(t('results.empty.title'))).toBeInTheDocument()
    // The way onward is still there.
    expect(
      screen.getByRole('link', { name: new RegExp(t('home.quickResults'), 'i') }),
    ).toBeInTheDocument()
  })
})

// --- the data validators will actually see -----------------------------------

describe('a real account is never given another identity', () => {
  /**
   * The defect this guards: on a seeded device, an account with no linked
   * record was silently given the demo patient with the most visits. The owner
   * registered, signed in, and was greeted "Hello, Marisol Abbayani".
   */
  beforeEach(async () => {
    await seedDemoData(db, { now: Date.parse('2026-08-29T00:00:00.000Z') })
    await setDemoMode(true, db)
    setExampleRecordShown(false)
  })

  afterEach(() => setExampleRecordShown(false))

  it('greets the signed-in user by their own name, on a fully seeded device', async () => {
    renderAt(PATIENT_PATHS.home)
    await waitFor(() => expect(screen.getByText(t('shared.noRecord.title'))).toBeInTheDocument())

    // No seeded patient's name appears anywhere as the user's own.
    const seeded = await db.patients.filter((p) => p.isDemo === 1).toArray()
    expect(seeded.length).toBeGreaterThan(0)
    for (const patient of seeded) {
      expect(screen.queryByText(new RegExp(patient.name, 'i'))).not.toBeInTheDocument()
    }
  })

  it('shows no seeded data on the results screen either', async () => {
    // Every patient screen loads through the same path, so removing the
    // substitution removes it everywhere -- but results is the screen the
    // scored validator task names, so it is worth asserting directly.
    renderAt(PATIENT_PATHS.results)
    await waitFor(() => expect(screen.getByText(t('shared.noRecord.title'))).toBeInTheDocument())

    const seeded = await db.patients.filter((p) => p.isDemo === 1).toArray()
    for (const patient of seeded) {
      expect(screen.queryByText(new RegExp(patient.name, 'i'))).not.toBeInTheDocument()
    }
  })

  it('says plainly that no record is linked, rather than borrowing one', async () => {
    renderAt(PATIENT_PATHS.home)
    expect(await screen.findByText(t('shared.noRecord.title'))).toBeInTheDocument()
    expect(screen.getByText(t('shared.noRecord.body'))).toBeInTheDocument()
  })

  it('drops the possessive copy while an example is on screen', async () => {
    // "This is your own respiratory health record" over somebody else's data is
    // a false statement, and the banner does not rescue it: the copy is the
    // primary content and reads as fact, the banner reads as a footnote.
    setExampleRecordShown(true)
    renderAt(PATIENT_PATHS.home)

    await waitFor(() =>
      expect(screen.getByText(t('shared.demoPreview.title'))).toBeInTheDocument(),
    )
    expect(screen.getByText(t('home.subtitle_example'))).toBeInTheDocument()
    expect(screen.queryByText(t('home.subtitle'))).not.toBeInTheDocument()
  })

  it('keeps the possessive copy for a real linked record', async () => {
    // The second person is right, and warmer, when it really is your record.
    // Linking a DEMO row would not test this: isFictional would be true and the
    // copy would correctly switch, which is the opposite of what is asserted.
    await db.patients.add({
      id: 'PT-0001-0001',
      studyId: 'ST-REALPATIENT0001',
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
    })

    renderAt(PATIENT_PATHS.home)
    await waitFor(() => expect(screen.getByText(t('home.subtitle'))).toBeInTheDocument())
    expect(screen.queryByText(t('home.subtitle_example'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('shared.demoPreview.title'))).not.toBeInTheDocument()
  })

  it('offers an example record, and names whose it is when shown', async () => {
    // Validators still need something to navigate -- they just have to ask,
    // and it never arrives wearing their name.
    renderAt(PATIENT_PATHS.home)
    const see = await screen.findByRole('button', { name: t('shared.noRecord.seeExample') })
    see.click()

    await waitFor(() =>
      expect(screen.getByText(t('shared.demoPreview.title'))).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: t('shared.demoPreview.stop') })).toBeInTheDocument()
  })
})

describe('language is shown as a name, not a code', () => {
  it('renders the language name a patient can read', async () => {
    // The screen rendered the raw code, so a patient read "Preferred
    // language: fil". Also proves an explicit `common:` prefix resolves from
    // the patient hook, which loads patient/codes/design but not common.
    await db.patients.add({
      id: 'PT-0002-0002',
      studyId: 'ST-LANGUAGECHECK01',
      name: 'Test Account Holder',
      birthDate: '1990-01-01',
      sex: SEX_CODES.FEMALE,
      linkedUserId: userId,
      assignedPractitionerIds: [],
      assignedHealthWorkerIds: [],
      consent: null,
      respiratoryHistory: [],
      familyHistory: [],
      preferredLanguage: 'fil',
      isDemo: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
    })

    renderAt(PATIENT_PATHS.history)
    expect(await screen.findByText('Filipino')).toBeInTheDocument()
    expect(screen.queryByText('fil')).not.toBeInTheDocument()
  })
})

describe('against demo-seeded data', () => {
  /**
   * The fictional clinic is what a validator navigates. These assertions run
   * against the real seeder rather than a hand-written fixture, so a change to
   * the dataset that these screens cannot render fails here rather than in
   * front of a pulmonologist.
   */
  beforeEach(async () => {
    await seedDemoData(db, { now: Date.parse('2026-08-29T00:00:00.000Z') })
    await setDemoMode(true, db)
    // The screens no longer substitute a seeded record for an unlinked
    // account -- doing that greeted a real person as somebody fictional. A
    // validator now asks to see an example, so these tests ask too.
    setExampleRecordShown(true)
  })

  afterEach(() => setExampleRecordShown(false))

  it('renders a seeded patient home with a real latest result', async () => {
    renderAt(PATIENT_PATHS.home)
    await waitFor(() => expect(screen.getByText(t('home.latestHeading_example'))).toBeInTheDocument())

    // No linked record, so the sample-data path: labelled as invented. Once,
    // now -- the long banner shortens to its pill here because the preview
    // panel beneath it says everything the banner did and more. Both labels
    // are still on screen; only the duplication is gone.
    expect(screen.getByText(t('shared.demoPreview.title'))).toBeInTheDocument()
    expect(screen.getByText(design('fictional.shortLabel'))).toBeInTheDocument()

    expect(screen.getByRole('link', { name: new RegExp(t('home.openLatest')) })).toBeInTheDocument()
  })

  it('lists every seeded visit on the results screen', async () => {
    renderAt(PATIENT_PATHS.results)
    await waitFor(() => expect(screen.getByText(t('results.listHeading'))).toBeInTheDocument())

    const rows = screen.getAllByRole('link')
    expect(rows.length).toBeGreaterThan(1)
    // Every row leads to a detail route that exists.
    for (const row of rows) {
      expect(row.getAttribute('href')).toMatch(new RegExp(`^${PATIENT_PATHS.results}/`))
    }
  })

  it('renders a seeded trend without fabricating a severity figure', async () => {
    renderAt(PATIENT_PATHS.trends)
    await waitFor(() =>
      expect(screen.getByText(t('trends.findingsChartTitle'))).toBeInTheDocument(),
    )
    expect(screen.getByText(t('trends.severityBody'))).toBeInTheDocument()
    expect(screen.getAllByText(design('notConnected.noValue')).length).toBeGreaterThan(0)
  })

  it('renders the seeded history with the three answer groups', async () => {
    renderAt(PATIENT_PATHS.history)
    await waitFor(() => expect(screen.getByText(t('history.profileHeading_example'))).toBeInTheDocument())
    expect(
      screen.getByRole('region', {
        name: `${t('history.respiratoryHeading_example')}: ${t('history.yesHeading')}`,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', {
        name: `${t('history.familyHeading_example')}: ${t('history.yesHeading')}`,
      }),
    ).toBeInTheDocument()
  })
})

// --- the sample-data label, and the two shapes it takes -----------------------

describe('the sample-data label shortens only where a fuller notice replaces it', () => {
  /**
   * Two banners saying one thing do not double the warning. In example mode the
   * blue demo-preview panel already states the record is invented, NAMES whose
   * it is, says it is not the reader's, and offers the way out -- strictly more
   * than the brown banner above it. Stacked, they took over half of a 390x844
   * screen and pushed the reader's own name and first data card below the fold,
   * which teaches the habit of scrolling past warning copy. That habit is the
   * cost this split exists to avoid.
   *
   * The seeded-record-without-that-panel case is the one the full-strength
   * banner was written for, and it has to keep it. These two tests pin the
   * split so a later refactor cannot quietly collapse the cases into one.
   */
  beforeEach(async () => {
    await seedDemoData(db, { now: Date.parse('2026-08-29T00:00:00.000Z') })
    await setDemoMode(true, db)
    setExampleRecordShown(false)
  })

  afterEach(() => setExampleRecordShown(false))

  it('shows the pill AND the named preview panel when the user asked for an example', async () => {
    setExampleRecordShown(true)
    renderAt(PATIENT_PATHS.home)

    // The fuller notice, intact: it is what earns the shortening above it.
    const panel = await screen.findByText(design('fictional.shortLabel'))
    expect(panel).toBeInTheDocument()
    expect(screen.getByText(t('shared.demoPreview.title'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('shared.demoPreview.stop') })).toBeInTheDocument()

    // Whose record it is, still named. Without this the shortening is a loss.
    const example = await db.patients.filter((row) => row.isDemo === 1).first()
    expect(example).toBeDefined()
    expect(
      screen.getByText(new RegExp(example?.name ?? 'no-such-patient', 'i')),
    ).toBeInTheDocument()

    // And the long form is gone, which is the whole point.
    expect(screen.queryByText(design('fictional.body'))).not.toBeInTheDocument()
  })

  it('keeps the full banner for a seeded record met without that panel', async () => {
    // A demo row LINKED to the account: fictional, so the label must appear,
    // but source is 'linked' rather than 'demo-preview', so nothing else on the
    // screen explains it. This is the case FictionalDataBanner was written for.
    const example = await db.patients.filter((row) => row.isDemo === 1).first()
    expect(example).toBeDefined()
    await db.patients.update(example?.id ?? '', { linkedUserId: userId })

    renderAt(PATIENT_PATHS.home)

    expect(await screen.findByText(design('fictional.title'))).toBeInTheDocument()
    expect(screen.getByText(design('fictional.body'))).toBeInTheDocument()
    expect(screen.queryByText(t('shared.demoPreview.title'))).not.toBeInTheDocument()
    expect(screen.queryByText(design('fictional.shortLabel'))).not.toBeInTheDocument()
  })
})
