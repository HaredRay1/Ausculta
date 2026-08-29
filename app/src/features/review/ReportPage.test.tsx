import { cleanup, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AI_STATUS,
  AUDIO_SOURCES,
  CLASSIFICATION_CODES,
  INTERPRETATION_CODES,
  LOCATION_CODES,
  MEASUREMENT_CODES,
  MEASUREMENT_SOURCES,
  REVIEW_STATUSES,
  ROLES,
  SEX_CODES,
  SYMPTOM_CODES,
  USER_STATUSES,
} from '../../db/codes'
import { AuscultaDB } from '../../db/db'
import type { Assessment, ClinicalReview, Patient, Recording } from '../../db/types'
import { i18n as appI18n } from '../../i18n'
import { AuthProvider } from '../../auth/AuthContext'
import type { AuthService } from '../../auth/authService'
import { createTestAuthService } from '../../auth/testing'
import { RESULT_VERDICTS, verdictTitleKey } from '../../components'
import { ReportPage } from './ReportPage'
import { registerReviewResources } from './i18n'
import { createReviewRepository, type Actor } from './repository'

registerReviewResources(appI18n)

const t = (key: string, options?: Record<string, unknown>) => appI18n.t(`review:${key}`, options)
const tCodes = (key: string) => appI18n.t(`codes:${key}`)

const PASSWORD = 'clinic-pass-1'

let db: AuscultaDB
let auth: AuthService
let repo: ReturnType<typeof createReviewRepository>
let doctor: Actor

beforeEach(async () => {
  db = new AuscultaDB(`ausculta-report-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
  repo = createReviewRepository(db)

  const user = await auth.register({
    username: 'dr.ricardo',
    password: PASSWORD,
    role: ROLES.PRACTITIONER,
    name: 'Dr Ricardo',
    preferredLanguage: 'en',
  })
  await db.users.update(user.id, { status: USER_STATUSES.ACTIVE })
  await auth.login(user.username, PASSWORD)
  doctor = { id: user.id, role: ROLES.PRACTITIONER }
})

afterEach(cleanup)

interface SeedOptions {
  /** Omit the AI verdict, so the model decided nothing for that location. */
  undecided?: boolean
  reviewed?: boolean
}

async function seedCase(options: SeedOptions = {}) {
  const patient: Patient = {
    id: 'PT-0001-0001',
    studyId: 'ST-ABCDEFGH12345678',
    name: 'Maria Dela Cruz',
    birthDate: '1978-03-14',
    sex: SEX_CODES.FEMALE,
    assignedPractitionerIds: [doctor.id],
    assignedHealthWorkerIds: [],
    consent: null,
    respiratoryHistory: [],
    familyHistory: [],
    preferredLanguage: 'en',
    isDemo: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
  }
  await db.patients.add(patient)

  const assessment: Assessment = {
    id: 'asm-1',
    patientId: patient.id,
    assessorId: 'worker-a',
    date: '2026-08-20T09:00:00.000Z',
    symptoms: [
      { code: SYMPTOM_CODES.COUGH, present: true },
      { code: SYMPTOM_CODES.FEVER, present: false },
    ],
    vitals: [
      {
        code: MEASUREMENT_CODES.SPO2,
        value: 96,
        unit: '%',
        source: MEASUREMENT_SOURCES.MANUAL_ENTRY,
        enteredBy: 'worker-a',
        enteredAt: '2026-08-20T09:05:00.000Z',
      },
    ],
    reviewStatus: options.reviewed === true ? REVIEW_STATUSES.APPROVED : REVIEW_STATUSES.PENDING_REVIEW,
    interfaceLanguage: 'en',
    questionnaireLanguage: 'en',
    questionnaireVersion: '1',
    aiSeverity: {
      score: null,
      category: null,
      modelVersion: null,
      calculatedAt: null,
      thresholdConfigVersion: 1,
      status: 'MODEL_NOT_CONNECTED',
    },
    isDemo: 0,
    createdAt: '2026-08-20T09:00:00.000Z',
  }
  await db.assessments.add(assessment)

  const recording: Recording = {
    id: 'rec-1',
    assessmentId: assessment.id,
    patientId: patient.id,
    locationCode: LOCATION_CODES.R_UPPER,
    audioBlobId: 'blob-1',
    audioSource: AUDIO_SOURCES.DEVICE_WAV_IMPORT,
    importedSampleRate: 16000,
    bitDepth: 16,
    channels: 1,
    durationSec: 20,
    quality: null,
    aiStatus: options.undecided === true ? AI_STATUS.PENDING : AI_STATUS.ANALYZED,
    ...(options.undecided === true
      ? {}
      : {
          aiClassification: CLASSIFICATION_CODES.PNEUMONIA,
          aiConfidence: 0.72,
          modelVersion: 'ei-disease-v5',
        }),
    isDemo: 0,
    createdAt: '2026-08-20T09:10:00.000Z',
  }
  await db.recordings.add(recording)

  if (options.reviewed === true) {
    const review: ClinicalReview = {
      id: 'rev-1',
      assessmentId: assessment.id,
      practitionerId: doctor.id,
      aiResultSnapshot: {},
      interpretationCode: INTERPRETATION_CODES.CONFIRMED,
      notes: 'Consistent with the recording. Refer to district hospital.',
      reviewedAt: '2026-08-21T10:00:00.000Z',
    }
    await db.clinicalReviews.add(review)
  }

  return { patient, assessment, recording }
}

function renderReport(assessmentId = 'asm-1') {
  return render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter initialEntries={[`/review/${assessmentId}/report`]}>
          <Routes>
            <Route path="/review/:assessmentId/report" element={<ReportPage repository={repo} />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

describe('ReportPage', () => {
  it('separates the three voices under their own headings', async () => {
    await seedCase({ reviewed: true })
    renderReport()

    // The patient's account, the software's output and the clinician's
    // judgement are three different kinds of claim, and a referral sheet that
    // blurs them is the failure this page exists to prevent.
    expect(await screen.findByText(t('report.patientReported'))).toBeInTheDocument()
    expect(screen.getByText(t('label.ai'))).toBeInTheDocument()
    expect(screen.getByText(t('label.practitioner'))).toBeInTheDocument()
  })

  it('numbers the sections, so a page read alone still says which voice it is', async () => {
    await seedCase({ reviewed: true })
    renderReport()

    await screen.findByText(t('report.patientReported'))
    for (const number of [1, 2, 3]) {
      expect(screen.getByText(t('report.sectionOf', { number }))).toBeInTheDocument()
    }
  })

  it('names the software as the author of the automatic section', async () => {
    await seedCase({ reviewed: true })
    renderReport()

    // On paper, an unattributed number becomes "the machine said" by the time
    // it reaches a ward.
    expect(await screen.findByText(t('label.aiNote'))).toBeInTheDocument()
    expect(screen.getByText(t('label.practitionerNote'))).toBeInTheDocument()
  })

  it('carries the prototype disclaimer', async () => {
    await seedCase({ reviewed: true })
    renderReport()

    const disclaimer = await screen.findByText(t('report.disclaimer'))
    expect(disclaimer).toBeInTheDocument()
    expect(disclaimer.textContent ?? '').toMatch(/not a diagnostic device/i)
  })

  it('identifies the patient, the date and what was recorded', async () => {
    await seedCase({ reviewed: true })
    renderReport()

    expect(await screen.findByText('Maria Dela Cruz')).toBeInTheDocument()
    expect(screen.getByText('ST-ABCDEFGH12345678')).toBeInTheDocument()
    expect(
      screen.getByText(t('report.locationsCount', { count: 1, total: 6 })),
    ).toBeInTheDocument()
  })

  it('states the model version that produced the result', async () => {
    await seedCase({ reviewed: true })
    renderReport()

    expect(await screen.findByText('ei-disease-v5')).toBeInTheDocument()
  })

  it('reports what the patient said, and only what they said was present', async () => {
    await seedCase({ reviewed: true })
    renderReport()

    await screen.findByText(t('report.patientReported'))
    expect(screen.getByText(tCodes(`symptom.${SYMPTOM_CODES.COUGH}`))).toBeInTheDocument()
    // A symptom recorded as absent is not a finding and must not be listed as one.
    expect(screen.queryByText(tCodes(`symptom.${SYMPTOM_CODES.FEVER}`))).not.toBeInTheDocument()
  })

  it('says plainly when no practitioner has concluded anything yet', async () => {
    await seedCase({ reviewed: false })
    renderReport()

    // An empty heading under "practitioner's conclusion" reads on paper as a
    // clinician having looked and found nothing wrong.
    expect(await screen.findByText(t('report.notReviewedYet'))).toBeInTheDocument()
  })

  it('shows the practitioner conclusion once one exists', async () => {
    await seedCase({ reviewed: true })
    renderReport()

    expect(
      await screen.findByText(/Consistent with the recording/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(tCodes(`interpretation.${INTERPRETATION_CODES.CONFIRMED}`)),
    ).toBeInTheDocument()
  })

  it('prints the model verdict in the same words the screen shows', async () => {
    await seedCase({ reviewed: true })
    renderReport()

    // The verdict vocabulary belongs to the design system and is deliberately
    // un-overridable. An earlier version looked the model's verdict up in
    // `review:outcome.*`, which is keyed by INTERPRETATION_CODES — what a
    // practitioner decided, not what the model said. `uncertain` exists in both
    // with different meanings, so it resolved silently to the wrong wording on
    // a sheet handed to a hospital.
    const expected = appI18n.t(`design:${verdictTitleKey(RESULT_VERDICTS.SUGGESTIVE)}`)
    expect(await screen.findByText(new RegExp(expected))).toBeInTheDocument()
  })

  it('names the pattern the model reported alongside its verdict', async () => {
    await seedCase({ reviewed: true })
    renderReport()

    expect(
      await screen.findByText(
        new RegExp(tCodes(`classification.${CLASSIFICATION_CODES.PNEUMONIA}`)),
      ),
    ).toBeInTheDocument()
  })

  it('says the model decided nothing rather than inventing a result', async () => {
    await seedCase({ undecided: true })
    renderReport()

    expect(await screen.findByText(t('report.nothingDecided'))).toBeInTheDocument()
    expect(screen.queryByText(/72%/)).not.toBeInTheDocument()
  })

  it('exposes exactly one heading per medium, not two documents', async () => {
    await seedCase({ reviewed: true })
    const { container } = renderReport()
    await screen.findByText(t('report.patientReported'))

    // The AppBar and the sheet's document title carry the same words. Rendered
    // together they announced arriving at a second document; the sheet's title
    // is print-only, so on screen there is one h1 and on paper — where the
    // AppBar is hidden — there is also one.
    const headings = [...container.querySelectorAll('h1')]
    const onScreen = headings.filter((h) => !h.classList.contains('print-only'))
    const onPaper = headings.filter((h) => h.classList.contains('print-only'))

    expect(onScreen).toHaveLength(1)
    expect(onPaper).toHaveLength(1)
  })

  it('keeps the print controls off the printed sheet', async () => {
    await seedCase({ reviewed: true })
    const { container } = renderReport()

    await screen.findByText(t('report.patientReported'))
    const printButton = screen.getByRole('button', { name: t('report.print') })
    expect(printButton.closest('.no-print')).not.toBeNull()
    // And the sections are marked to survive a page break intact.
    expect(container.querySelectorAll('.print-keep-together').length).toBeGreaterThan(2)
  })

  it('explains itself rather than blanking when the assessment does not exist', async () => {
    renderReport('no-such-assessment')

    expect(await screen.findByText(t('case.notFound'))).toBeInTheDocument()
  })
})
