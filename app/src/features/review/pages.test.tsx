import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AI_STATUS,
  AUDIO_SOURCES,
  CLASSIFICATION_CODES,
  INTERPRETATION_CODES,
  LOCATION_CODES,
  REVIEW_STATUSES,
  ROLES,
  SEX_CODES,
  USER_STATUSES,
} from '../../db/codes'
import { AuscultaDB } from '../../db/db'
import type { Assessment, Patient, Recording, User } from '../../db/types'
import { i18n as appI18n } from '../../i18n'
import { AuthProvider } from '../../auth/AuthContext'
import type { AuthService } from '../../auth/authService'
import { createTestAuthService } from '../../auth/testing'
import { ClinicalViewPage } from './ClinicalViewPage'
import { ReviewFormPage } from './ReviewFormPage'
import { ReviewQueuePage } from './ReviewQueuePage'
import { registerReviewResources } from './i18n'
import { createReviewRepository, type Actor } from './repository'

registerReviewResources(appI18n)

const t = (key: string, options?: Record<string, unknown>) => appI18n.t(`review:${key}`, options)

const PASSWORD = 'clinic-pass-1'

let db: AuscultaDB
let auth: AuthService
let repo: ReturnType<typeof createReviewRepository>
let doctor: Actor

beforeEach(async () => {
  db = new AuscultaDB(`ausculta-review-pages-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
  repo = createReviewRepository(db)
  doctor = await signIn(ROLES.PRACTITIONER)
})

afterEach(cleanup)

async function signIn(role: User['role']): Promise<Actor> {
  const user = await auth.register({
    username: `user-${role.toLowerCase()}`,
    password: PASSWORD,
    role,
    name: 'Dr Ricardo',
    preferredLanguage: 'en',
  })
  await db.users.update(user.id, { status: USER_STATUSES.ACTIVE })
  await auth.login(user.username, PASSWORD)
  return { id: user.id, role }
}

function renderWithAuth(element: React.ReactNode, path: string, routePath: string) {
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

async function seedCase(options: {
  aiClassification?: Recording['aiClassification']
  aiStatus?: Recording['aiStatus']
  withPrevious?: boolean
} = {}): Promise<{ patient: Patient; assessment: Assessment; recording: Recording }> {
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

  if (options.withPrevious === true) {
    const earlier: Assessment = {
      id: 'asm-earlier',
      patientId: patient.id,
      assessorId: 'worker-a',
      date: '2026-07-01T09:00:00.000Z',
      symptoms: [],
      vitals: [],
      reviewStatus: REVIEW_STATUSES.APPROVED,
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
      createdAt: '2026-07-01T09:00:00.000Z',
    }
    await db.assessments.add(earlier)
    await db.recordings.add({
      id: 'rec-earlier',
      assessmentId: earlier.id,
      patientId: patient.id,
      locationCode: LOCATION_CODES.R_UPPER,
      audioBlobId: 'blob-earlier',
      audioSource: AUDIO_SOURCES.DEVICE_WAV_IMPORT,
      importedSampleRate: 16000,
      bitDepth: 16,
      channels: 1,
      durationSec: 20,
      quality: null,
      aiStatus: AI_STATUS.ANALYZED,
      aiClassification: CLASSIFICATION_CODES.HEALTHY,
      aiConfidence: 0.6,
      isDemo: 0,
      createdAt: '2026-07-01T09:00:00.000Z',
    })
  }

  const assessment: Assessment = {
    id: 'asm-1',
    patientId: patient.id,
    assessorId: 'worker-a',
    date: '2026-08-20T09:00:00.000Z',
    symptoms: [],
    vitals: [],
    reviewStatus: REVIEW_STATUSES.PENDING_REVIEW,
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
    aiStatus: options.aiStatus ?? AI_STATUS.ANALYZED,
    aiClassification: options.aiClassification ?? CLASSIFICATION_CODES.ASTHMA,
    aiConfidence: 0.82,
    uncertainFlag: false,
    modelVersion: 'impulse-1-v5',
    isDemo: 0,
    createdAt: '2026-08-20T09:00:00.000Z',
  }
  await db.recordings.add(recording)

  return { patient, assessment, recording }
}

function renderCase(assessmentId = 'asm-1') {
  return renderWithAuth(
    <ClinicalViewPage repository={repo} />,
    `/review/${assessmentId}`,
    '/review/:assessmentId',
  )
}

describe('clinical view: telling the machine from the clinician', () => {
  it('names the automatic result as the app’s, in words', async () => {
    // The brief's central rule. Colour and icons do not survive a glance, a
    // greyscale print, or a screen reader, so the attribution is text.
    await seedCase()
    renderCase()

    expect(await screen.findByText(t('label.ai'))).toBeInTheDocument()
    expect(screen.getByText(t('label.aiNote'))).toBeInTheDocument()
  })

  it('gives the practitioner’s conclusion its own heading, distinct in the DOM', async () => {
    await seedCase()
    renderCase()

    const aiHeading = await screen.findByText(t('label.ai'))
    const practitionerHeading = screen.getByText(t('label.practitioner'))

    // Different nodes, different words — not the same block styled differently.
    expect(aiHeading).not.toBe(practitionerHeading)
    expect(aiHeading.textContent).not.toBe(practitionerHeading.textContent)
    expect(practitionerHeading.contains(aiHeading)).toBe(false)
    expect(aiHeading.contains(practitionerHeading)).toBe(false)
  })

  it('says plainly when no practitioner has reviewed yet', async () => {
    // Without this the machine's output would be the only thing on the page,
    // which is exactly the confusion the split exists to prevent.
    await seedCase()
    renderCase()

    expect(await screen.findByText(t('label.notReviewed'))).toBeInTheDocument()
    expect(screen.getByText(t('label.notReviewedNote'))).toBeInTheDocument()
  })

  it('shows the practitioner’s conclusion once one exists', async () => {
    await seedCase()
    await repo.submitReview(
      'asm-1',
      { interpretationCode: INTERPRETATION_CODES.DISAGREED, notes: 'Clear on my examination.' },
      doctor,
    )

    renderCase()

    expect(
      await screen.findByText(t(`outcome.${INTERPRETATION_CODES.DISAGREED}`)),
    ).toBeInTheDocument()
    expect(screen.getByText('Clear on my examination.')).toBeInTheDocument()
    // And the machine's block is still there, still labelled as the machine's.
    expect(screen.getByText(t('label.ai'))).toBeInTheDocument()
  })

  it('names the model version, so the reviewer knows what produced the output', async () => {
    await seedCase()
    renderCase()
    expect(
      await screen.findByText(t('case.modelVersion', { version: 'impulse-1-v5' })),
    ).toBeInTheDocument()
  })
})

describe('clinical view: longitudinal comparison', () => {
  it('renders no comparison at all when there is no earlier recording', async () => {
    await seedCase()
    renderCase()

    await screen.findByText(t('label.ai'))
    expect(screen.queryByText(t('location.changed'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('location.unchanged'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('location.previous'))).not.toBeInTheDocument()
  })

  it('describes a change in the recordings, never in the patient', async () => {
    await seedCase({ withPrevious: true })
    renderCase()

    const message = await screen.findByText(t('location.changed'))
    expect(message).toBeInTheDocument()
    // Neutral wording only: the app observes, the clinician concludes.
    const text = message.textContent ?? ''
    for (const forbidden of ['worse', 'deteriorat', 'improv', 'better']) {
      expect(text.toLowerCase()).not.toContain(forbidden)
    }
  })
})

describe('clinical view: missing audio', () => {
  it('says the audio is missing rather than showing a silent player', async () => {
    // No blob was ever written for this recording. A dead player would let a
    // practitioner conclude there was nothing to hear.
    await seedCase()
    renderCase()

    expect(await screen.findByText(t('location.audioMissing'))).toBeInTheDocument()
    expect(screen.getByText(t('location.audioMissingHint'))).toBeInTheDocument()
  })
})

describe('review form', () => {
  it('records a conclusion and leaves the recording untouched', async () => {
    // The end-to-end form of the guarantee: through the real UI, not just the
    // repository.
    await seedCase()
    const before = structuredClone(await db.recordings.toArray())

    renderWithAuth(
      <ReviewFormPage repository={repo} />,
      '/review/asm-1/decide',
      '/review/:assessmentId/decide',
    )

    const confirm = await screen.findByLabelText(
      new RegExp(t(`outcome.${INTERPRETATION_CODES.CONFIRMED}`), 'i'),
    )
    fireEvent.click(confirm)
    fireEvent.click(screen.getByRole('button', { name: t('form.submit') }))

    expect(await screen.findByText(t('form.submittedHint'))).toBeInTheDocument()

    expect(await db.recordings.toArray()).toEqual(before)
    const assessment = await db.assessments.get('asm-1')
    expect(assessment?.reviewStatus).toBe(REVIEW_STATUSES.APPROVED)
  })

  it('says what is missing instead of doing nothing, when no conclusion is chosen', async () => {
    // The button is deliberately not disabled. A greyed control with no stated
    // reason is the most frustrating thing on a form, and a disabled attribute
    // announces nothing to a screen reader either.
    await seedCase()
    renderWithAuth(
      <ReviewFormPage repository={repo} />,
      '/review/asm-1/decide',
      '/review/:assessmentId/decide',
    )

    const submit = await screen.findByRole('button', { name: t('form.submit') })
    expect(submit).not.toBeDisabled()

    fireEvent.click(submit)

    expect(
      await screen.findByText(t('error.REVIEW_INVALID_INTERPRETATION')),
    ).toBeInTheDocument()
    expect(await db.clinicalReviews.count()).toBe(0)
  })

  it('tells the practitioner their conclusion does not change the automatic result', async () => {
    await seedCase()
    renderWithAuth(
      <ReviewFormPage repository={repo} />,
      '/review/asm-1/decide',
      '/review/:assessmentId/decide',
    )
    expect(await screen.findByText(t('form.immutabilityNote'))).toBeInTheDocument()
  })

  it('reports a missing reason rather than saving a bare disagreement', async () => {
    await seedCase()
    renderWithAuth(
      <ReviewFormPage repository={repo} />,
      '/review/asm-1/decide',
      '/review/:assessmentId/decide',
    )

    fireEvent.click(
      await screen.findByLabelText(
        new RegExp(t(`outcome.${INTERPRETATION_CODES.DISAGREED}`), 'i'),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: t('form.submit') }))

    expect(await screen.findByText(t('error.REVIEW_NOTES_REQUIRED'))).toBeInTheDocument()
    expect(await db.clinicalReviews.count()).toBe(0)
  })

  it('asks which location a repeat request applies to', async () => {
    await seedCase()
    renderWithAuth(
      <ReviewFormPage repository={repo} />,
      '/review/asm-1/decide',
      '/review/:assessmentId/decide',
    )

    fireEvent.click(
      await screen.findByLabelText(
        new RegExp(t(`outcome.${INTERPRETATION_CODES.REPEAT_REQUESTED}`), 'i'),
      ),
    )
    expect(await screen.findByText(t('form.locationHint'))).toBeInTheDocument()
  })
})

describe('review queue', () => {
  it('lists a waiting case with what the app reported', async () => {
    await seedCase()
    renderWithAuth(<ReviewQueuePage repository={repo} />, '/review', '/review')

    expect(await screen.findByText('Maria Dela Cruz')).toBeInTheDocument()
    expect(screen.getByText(t('queue.flagged', { count: 1 }))).toBeInTheDocument()
  })

  it('says what the ordering means, so the top is not read as sickest', async () => {
    await seedCase()
    renderWithAuth(<ReviewQueuePage repository={repo} />, '/review', '/review')
    expect(await screen.findByText(t('queue.orderNote'))).toBeInTheDocument()
  })

  it('offers a way to the alerts queue, which nothing else links to', async () => {
    await seedCase()
    renderWithAuth(<ReviewQueuePage repository={repo} />, '/review', '/review')
    expect(await screen.findByRole('button', { name: t('queue.openAlerts') })).toBeInTheDocument()
  })

  it('shows an honest empty state when nothing is waiting', async () => {
    renderWithAuth(<ReviewQueuePage repository={repo} />, '/review', '/review')
    expect(await screen.findByText(t('queue.empty'))).toBeInTheDocument()
  })

  it('does not list another practitioner’s patient', async () => {
    const { patient } = await seedCase()
    await db.patients.update(patient.id, { assignedPractitionerIds: ['someone-else'] })

    renderWithAuth(<ReviewQueuePage repository={repo} />, '/review', '/review')
    expect(await screen.findByText(t('queue.empty'))).toBeInTheDocument()
    expect(screen.queryByText('Maria Dela Cruz')).not.toBeInTheDocument()
  })
})
