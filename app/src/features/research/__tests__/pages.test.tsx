import { cleanup, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuscultaDB, db as appDb } from '../../../db/db'
import { i18n as appI18n } from '../../../i18n'
import { setDemoMode } from '../../demo/demoMode'
import { seedDemoData } from '../../demo/seed'
import { saveResearchLabel } from '../data'
import { GROUND_TRUTH_STATUSES } from '../groundTruth'
import { registerResearchResources } from '../i18n'
import { MINIMUM_SCORED_FOR_METRICS } from '../metrics'
import { AuthProvider } from '../../../auth/AuthContext'
import { createTestAuthService } from '../../../auth/testing'
import { LabellingPage } from '../pages/LabellingPage'
import { ExportPage } from '../pages/ExportPage'
import { PerformancePage } from '../pages/PerformancePage'

registerResearchResources(appI18n)
const t = (key: string, options?: Record<string, unknown>) =>
  appI18n.t(`research:${key}`, options)

let db: AuscultaDB
const NOW = Date.parse('2026-08-29T06:00:00.000Z')

beforeEach(() => {
  db = new AuscultaDB(`ausculta-research-pages-${crypto.randomUUID()}`)
})
afterEach(cleanup)

function renderPage(element: React.ReactNode) {
  return render(
    <I18nextProvider i18n={appI18n}>
      <MemoryRouter>{element}</MemoryRouter>
    </I18nextProvider>,
  )
}

/** Every percentage or bare metric-looking number on screen. */
function renderedNumbers(): string[] {
  const text = document.body.textContent ?? ''
  return [...text.matchAll(/\d+(?:\.\d+)?%/g)].map((match) => match[0])
}

async function labelFirst(count: number) {
  const withPrediction = (await db.recordings.toArray()).filter(
    (recording) => recording.aiClassification !== undefined,
  )
  for (const recording of withPrediction.slice(0, count)) {
    await saveResearchLabel(
      {
        recordingId: recording.id,
        groundTruthStatus: GROUND_TRUTH_STATUSES.CORRECT,
        labelCode: recording.aiClassification,
        labeledBy: 'researcher-1',
      },
      db,
    )
  }
}

describe('performance screen, insufficient labelled data', () => {
  it('renders no metric numbers at all when nothing is labelled', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)

    renderPage(<PerformancePage database={db} />)
    expect(await screen.findByText(t('performance.insufficientTitle'))).toBeInTheDocument()

    // The whole point: not a greyed-out figure, not a provisional one. None.
    expect(renderedNumbers()).toEqual([])
    expect(screen.queryByText(t('performance.accuracy'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('performance.matrixHeading'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('performance.perClassHeading'))).not.toBeInTheDocument()
  })

  it('renders no metric numbers just below the threshold', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)
    await labelFirst(MINIMUM_SCORED_FOR_METRICS - 1)

    renderPage(<PerformancePage database={db} />)
    expect(await screen.findByText(t('performance.insufficientTitle'))).toBeInTheDocument()
    expect(renderedNumbers()).toEqual([])
  })

  it('says how many more are needed, and offers the way to get them', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)
    await labelFirst(3)

    renderPage(<PerformancePage database={db} />)
    await screen.findByText(t('performance.insufficientTitle'))

    expect(
      screen.getByText(
        t('performance.insufficientBody', { scored: 3, needed: MINIMUM_SCORED_FOR_METRICS }),
      ),
    ).toBeInTheDocument()
    // An empty screen with no way forward is a dead end.
    expect(screen.getByRole('link', { name: t('performance.labelMore') })).toBeInTheDocument()
  })
})

describe('performance screen, once there is enough', () => {
  it('shows metrics, each with its denominator', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)
    await labelFirst(MINIMUM_SCORED_FOR_METRICS + 5)

    renderPage(<PerformancePage database={db} />)
    expect(await screen.findByText(t('performance.accuracy'))).toBeInTheDocument()

    // Every label agreed with the model, so accuracy is exactly 100% — and so
    // are the per-class metrics, hence several matching cells.
    expect(screen.getAllByText('100.0%').length).toBeGreaterThan(0)
    // And it never appears without saying what it is 100% of.
    expect(
      screen.getAllByText(t('performance.ofN', { n: MINIMUM_SCORED_FOR_METRICS + 5 })).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(t('performance.matrixHeading'))).toBeInTheDocument()
  })

  it('prints an em dash, never 0%, for a class the model never predicted', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)
    await labelFirst(MINIMUM_SCORED_FOR_METRICS + 5)

    renderPage(<PerformancePage database={db} />)
    await screen.findByText(t('performance.accuracy'))

    // The seeded labels cover only some classes, so at least one class has no
    // predictions and therefore no defined precision.
    expect(screen.getAllByText(t('performance.notEnough')).length).toBeGreaterThan(0)
  })

  it('states that regression error statistics are deliberately absent', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)
    await labelFirst(MINIMUM_SCORED_FOR_METRICS + 5)

    renderPage(<PerformancePage database={db} />)
    await screen.findByText(t('performance.accuracy'))
    expect(screen.getByText(t('performance.noRegression'))).toBeInTheDocument()
  })
})

describe('export screen', () => {
  it('warns that the file will contain fictional rows while demo mode is on', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)

    renderPage(<ExportPage database={db} />)
    expect(await screen.findByText(t('export.demoWarningTitle'))).toBeInTheDocument()
    expect(screen.getByText(t('export.privacyHeading'))).toBeInTheDocument()
  })

  it('shows the empty state rather than an export of nothing', async () => {
    await seedDemoData(db, { now: NOW })
    // Demo mode off, so no seeded row is in scope and there is nothing real.
    renderPage(<ExportPage database={db} />)
    expect(await screen.findByText(t('export.emptyTitle'))).toBeInTheDocument()
    expect(screen.queryByText(t('export.download'))).not.toBeInTheDocument()
  })

  it('lists every column it will write, so the claim can be checked', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)

    renderPage(<ExportPage database={db} />)
    await screen.findByText(t('export.columnsHeading'))

    expect(screen.getByText('studyId')).toBeInTheDocument()
    expect(screen.getByText('isDemo')).toBeInTheDocument()
    for (const forbidden of ['name', 'birthDate', 'address', 'contact']) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument()
    }
  })
})

/**
 * The labelling screen must handle a recording the model declined to classify.
 *
 * UNCERTAIN and INSUFFICIENT_QUALITY recordings carry no `aiClassification` by
 * design — the rule is enforced in features/assessment/data/mapping.ts and
 * mirrored by the seeder — and they are a meaningful share of the queue rather
 * than an edge case. A researcher needs to see them precisely because the model
 * would not answer. Interpolating `undefined` into a translation key would put
 * `classification.undefined` on screen and log a missing key, so this asserts
 * against the app's own missing-key ledger rather than against the rendered
 * text, which would only catch the visible half of the bug.
 */
describe('labelling screen, recordings with no prediction', () => {
  it('renders them without ever looking up an undefined classification key', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)

    const unclassified = (await db.recordings.toArray()).filter(
      (recording) => recording.aiClassification === undefined,
    )
    // Guard the guard: if the seeder ever stopped producing these, this test
    // would pass for the wrong reason.
    expect(unclassified.length).toBeGreaterThan(0)

    const auth = createTestAuthService(db)
    render(
      <I18nextProvider i18n={appI18n}>
        <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
          <MemoryRouter>
            <LabellingPage database={db} />
          </MemoryRouter>
        </AuthProvider>
      </I18nextProvider>,
    )
    await screen.findByText(t('labels.queueHeading'))

    const missing = await appDb.missingTranslations.toArray()
    const offenders = missing.filter((row) => row.key.includes('undefined'))
    expect(offenders.map((row) => row.key)).toEqual([])

    expect(document.body.textContent ?? '').not.toContain('classification.undefined')
    expect(document.body.textContent ?? '').not.toContain('undefined')
  })

  it('says plainly that the model gave no classification', async () => {
    await seedDemoData(db, { now: NOW })
    await setDemoMode(true, db)

    // Make an unclassified recording the first thing in the queue.
    const unclassified = (await db.recordings.toArray()).find(
      (recording) => recording.aiClassification === undefined,
    )!
    await db.recordings.where('id').notEqual(unclassified.id).delete()

    const auth = createTestAuthService(db)
    render(
      <I18nextProvider i18n={appI18n}>
        <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
          <MemoryRouter>
            <LabellingPage database={db} />
          </MemoryRouter>
        </AuthProvider>
      </I18nextProvider>,
    )

    expect(await screen.findByText(t('labels.modelSaidNothing'))).toBeInTheDocument()
  })
})
