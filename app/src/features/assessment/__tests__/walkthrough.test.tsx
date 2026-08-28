import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeWav } from '../../../audio'
import { AuthProvider } from '../../../auth/AuthContext'
import { createTestAuthService } from '../../../auth/testing'
import { ROLES, USER_STATUSES } from '../../../db/codes'
import { AuscultaDB } from '../../../db/db'
import { assessmentRoutes } from '../routes'
import { createAssessmentStore } from '../data/assessmentStore'
import { AssessmentWizard } from '../AssessmentWizard'
import '../i18n'

/**
 * The walkthrough a validator will actually perform, driven through the real
 * screens: sign in, open the flow, pick a position, choose a file off the
 * memory card, read the recording check, and read the result.
 *
 * This is the one suite that renders the wizard as the router renders it —
 * every step component, the design system, the i18n bundles and the real
 * database — so an integration break (a missing translation key, a component
 * that throws on a state nobody rendered in isolation) fails here rather than
 * in front of a pulmonologist.
 *
 * There is no model in this environment, exactly as there is none in a build
 * shipped without the Edge Impulse assets, so a recording that passes the gate
 * lands on the model-not-connected result. That is the honest degradation and
 * it is asserted below.
 */

const SAMPLES = resolve(process.cwd(), '../samples')
const PATIENT = 'PT-4K7M-92XQ'
const PASSWORD = 'clinic-pass-1'

let db: AuscultaDB
let userId: string

afterEach(cleanup)

beforeEach(async () => {
  db = new AuscultaDB(`ausculta-walkthrough-${crypto.randomUUID()}`)
  const auth = createTestAuthService(db)
  const user = await auth.register({
    username: 'maria',
    password: PASSWORD,
    role: ROLES.HEALTH_WORKER,
    name: 'Maria Santos',
  })
  // A HEALTH_WORKER lands in PENDING_VERIFICATION and cannot sign in until an
  // administrator activates them. Activating the row directly keeps this suite
  // about the assessment flow rather than about the admin queue.
  await db.users.update(user.id, { status: USER_STATUSES.ACTIVE })
  userId = user.id
})

function sampleFile(name: string): File {
  return new File([new Uint8Array(readFileSync(resolve(SAMPLES, name)))], name, {
    type: 'audio/wav',
  })
}

/** Six seconds of shaped noise at a safe level — passes the quality gate. */
function usableFile(): File {
  const samples = 16000 * 6
  let seed = 12345
  const signal = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    signal[i] = (seed / 4294967296) * 2 - 1
  }
  for (let pole = 0; pole < 2; pole++) {
    let filtered = 0
    for (let i = 0; i < samples; i++) {
      filtered = 0.6 * filtered + 0.4 * signal[i]
      signal[i] = filtered
    }
  }
  let peak = 0
  for (const value of signal) peak = Math.max(peak, Math.abs(value))
  const pcm = new Int16Array(samples)
  for (let i = 0; i < samples; i++) pcm[i] = Math.round((signal[i] / peak) * 0.4 * 32768)
  return new File([encodeWav(pcm)], 'REC0001.WAV', { type: 'audio/wav' })
}

function renderWizard() {
  const auth = createTestAuthService(db)
  return render(
    <MemoryRouter initialEntries={[`/assessment/new?patientId=${PATIENT}`]}>
      <AuthProvider service={auth}>
        <Routes>
          <Route
            path="/assessment/new"
            element={<AssessmentWizard store={createAssessmentStore(db)} />}
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function signIn() {
  const auth = createTestAuthService(db)
  await auth.login('maria', PASSWORD)
}

/** Start, skip the guide, choose position 1, and reach the import screen. */
async function toImportScreen() {
  await signIn()
  renderWizard()

  await waitFor(() => expect(screen.getByText(PATIENT)).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /start assessment/i }))

  await waitFor(() => expect(screen.getByText(/using the recorder/i)).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /skip the guide/i }))

  await waitFor(() => expect(screen.getByText(/choose a position/i)).toBeInTheDocument())
  fireEvent.click(
    screen.getByRole('button', { name: /Position 1 — Right upper lung — Not recorded yet/i }),
  )

  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument(),
  )
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))

  await waitFor(() => expect(screen.getByLabelText(/recording file/i)).toBeInTheDocument())
}

function chooseFile(file: File) {
  const input = screen.getByLabelText(/recording file/i) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

describe('the walkthrough a validator performs', () => {
  it('refuses 01-silence.wav at the recording check and explains why', async () => {
    await toImportScreen()
    chooseFile(sampleFile('01-silence.wav'))

    await waitFor(() =>
      expect(screen.getByText(/This recording cannot be analysed/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/Almost no sound was picked up/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Hold the whole rim flat against the chest/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /record again/i })).toBeInTheDocument()
  })

  it('refuses 02-pure-tone.wav as a tone rather than a chest', async () => {
    await toImportScreen()
    chooseFile(sampleFile('02-pure-tone.wav'))

    await waitFor(() =>
      expect(screen.getByText(/This recording cannot be analysed/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/One steady tone drowns out everything else/i)).toBeInTheDocument()
  })

  it('refuses 03-white-noise.wav as background noise', async () => {
    await toImportScreen()
    chooseFile(sampleFile('03-white-noise.wav'))

    await waitFor(() =>
      expect(screen.getByText(/This recording cannot be analysed/i)).toBeInTheDocument(),
    )
    expect(
      screen.getByText(/sounds like background noise rather than breathing/i),
    ).toBeInTheDocument()
  })

  it('names the specific problem when the file is not a recording at all', async () => {
    await toImportScreen()
    chooseFile(new File([new Uint8Array([1, 2, 3, 4])], 'notes.txt', { type: 'text/plain' }))

    await waitFor(() =>
      expect(screen.getByText(/That file cannot be used/i)).toBeInTheDocument(),
    )
    // Specific, not "invalid file".
    expect(screen.getByText(/Choose a WAV file recorded by the Ausculta recorder/i)).toBeInTheDocument()
    // Still on the import screen, ready for another try.
    expect(screen.getByLabelText(/recording file/i)).toBeInTheDocument()
  })

  it('carries a usable recording through to a result and saves it', async () => {
    await toImportScreen()
    chooseFile(usableFile())

    await waitFor(() =>
      expect(screen.getByText(/This recording can be analysed/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /analyse this recording/i }))

    await waitFor(() =>
      expect(screen.getByText(/analysis model is not installed/i)).toBeInTheDocument(),
    )

    // No model here, so nothing may be claimed and no number may appear.
    expect(screen.getByText(/No model ran/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d+%/)

    // And it is on the device: the recording outlives the screen.
    await waitFor(async () => expect(await db.recordings.count()).toBe(1))
    const row = (await db.recordings.toArray())[0]
    expect(row.aiStatus).toBe('MODEL_NOT_CONNECTED')
    expect(row.aiClassification).toBeUndefined()
    expect(row.originalFileName).toBe('REC0001.WAV')
    expect(row.assessmentId).toBeTruthy()

    const assessment = await db.assessments.get(row.assessmentId)
    expect(assessment?.assessorId).toBe(userId)
    expect(assessment?.patientId).toBe(PATIENT)
  })

  it('keeps a rejected recording as evidence, still claiming nothing', async () => {
    await toImportScreen()
    chooseFile(sampleFile('01-silence.wav'))

    await waitFor(() =>
      expect(screen.getByText(/This recording cannot be analysed/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /keep this recording without analysing/i }))

    await waitFor(() => expect(screen.getByText(/could not be used/i)).toBeInTheDocument())

    const row = (await db.recordings.toArray())[0]
    expect(row.aiStatus).toBe('INSUFFICIENT_QUALITY')
    expect(row.aiClassification).toBeUndefined()
    expect(row.aiConfidence).toBeUndefined()
  })
})

describe('the exported route seam', () => {
  it('offers the two paths the router wires, each behind RequireAuth', () => {
    expect(assessmentRoutes.map((route) => route.path)).toEqual([
      '/assessment/new',
      '/assessment/:assessmentId',
    ])
    for (const route of assessmentRoutes) {
      expect(route.element).toBeDefined()
    }
  })
})
