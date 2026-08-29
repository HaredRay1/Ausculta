import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AppBar,
  Banner,
  Card,
  ChevronRightIcon,
  EmptyState,
  FictionalDataBanner,
  FlaskIcon,
  Page,
  Section,
  Spinner,
} from '../../../components'
import { db as defaultDb, type AuscultaDB } from '../../../db/db'
import { useDemoMode } from '../../demo/useDemoMode'
import { EMPTY_COUNTS, readResearchCounts, type ResearchCounts } from '../data'
import { useResearchTranslation } from '../i18n'

/**
 * The researcher's landing screen.
 *
 * Every number is counted from this device. Nothing is estimated, rounded to a
 * friendly figure, or filled in with a plausible placeholder — a researcher
 * will quote these, and a dashboard that guesses is worse than one that says
 * zero.
 */
export function ResearchDashboardPage({ database = defaultDb }: { database?: AuscultaDB } = {}) {
  const { t } = useResearchTranslation()
  const { enabled: demoEnabled, ready: demoReady } = useDemoMode(database)
  const [counts, setCounts] = useState<ResearchCounts | null>(null)

  useEffect(() => {
    if (!demoReady) return
    let cancelled = false
    void readResearchCounts(database, demoEnabled).then((next) => {
      if (!cancelled) setCounts(next)
    })
    return () => {
      cancelled = true
    }
  }, [database, demoEnabled, demoReady])

  const value = counts ?? EMPTY_COUNTS
  const hasData = counts !== null && value.recordings > 0

  return (
    <>
      <AppBar title={t('dashboard.title')} subtitle={t('subtitle')} />
      <Page>
        {demoEnabled && <FictionalDataBanner />}
        {/*
          The banner says the DATA is fictional; it does not say the NUMBERS
          are. A researcher reads "7 patients" as a study total and quotes it.
          The export screen already warns that seeded rows travel in the file —
          the counts deserve the same sentence, for the same reason.
        */}
        {demoEnabled && (
          <Banner tone="warning" title={t('dashboard.demoCountsTitle')}>
            {t('dashboard.demoCountsBody')}
          </Banner>
        )}

        {counts === null ? (
          <Spinner label={t('dashboard.loading')} />
        ) : !hasData ? (
          <EmptyState
            title={t('dashboard.emptyTitle')}
            body={t('dashboard.emptyBody')}
            icon={<FlaskIcon className="size-10" />}
          />
        ) : (
          <>
            <Section title={t('dashboard.dataHeading')}>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={t('dashboard.patients')} value={value.patients} />
                <Stat label={t('dashboard.assessments')} value={value.assessments} />
                <Stat label={t('dashboard.recordings')} value={value.recordings} />
                <Stat label={t('dashboard.withPrediction')} value={value.withPrediction} />
              </div>
            </Section>

            <Section title={t('dashboard.modelHeading')}>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={t('dashboard.withReferenceLabel')} value={value.withReferenceLabel} />
                <Stat
                  label={t('dashboard.scorable')}
                  value={value.scorable}
                  hint={t('dashboard.scorableHint')}
                />
              </div>
            </Section>
          </>
        )}

        <Section>
          <nav className="flex flex-col gap-2">
            <NavRow to="/research/labels" label={t('dashboard.goLabels')} />
            <NavRow to="/research/performance" label={t('dashboard.goPerformance')} />
            <NavRow to="/research/export" label={t('dashboard.goExport')} />
          </nav>
        </Section>
      </Page>
    </>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card padding="sm">
      <p className="font-heading text-3xl font-bold tabular-nums text-on-surface">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
      {hint !== undefined && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </Card>
  )
}

function NavRow({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-(--size-touch-min) items-center justify-between rounded-control border border-border bg-surface-raised px-4 py-3 text-base text-on-surface elevation-1"
    >
      {label}
      <ChevronRightIcon className="size-5 text-muted" />
    </Link>
  )
}

export default ResearchDashboardPage
