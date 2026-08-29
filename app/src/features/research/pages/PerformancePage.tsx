import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AppBar,
  Banner,
  Card,
  EmptyState,
  FictionalDataBanner,
  FlaskIcon,
  Page,
  Section,
  Spinner,
  WarningIcon,
} from '../../../components'
import { db } from '../../../db/db'
import { useDemoMode } from '../../demo/useDemoMode'
import { readPerformance, type PerformanceView } from '../data'
import { GROUND_TRUTH_STATUS_LIST } from '../groundTruth'
import { useResearchTranslation } from '../i18n'
import {
  CLASS_ORDER,
  MINIMUM_CLASS_SUPPORT,
  MINIMUM_SCORED_FOR_METRICS,
  formatPercent,
  type ClassMetrics,
} from '../metrics'

/**
 * Model performance against human reference labels.
 *
 * The screen's real job is refusing to show numbers it cannot support. Below
 * the minimum sample it renders no metric at all — not a greyed-out one, not a
 * provisional one — because a reader takes a rendered figure at face value
 * however it is styled. Above the minimum, every metric carries its
 * denominator, an undefined metric prints an em dash rather than 0%, and a
 * class resting on too few recordings says so next to its own row.
 */
export function PerformancePage() {
  const { t } = useResearchTranslation()
  const { enabled: demoEnabled, ready: demoReady } = useDemoMode(db)
  const [view, setView] = useState<PerformanceView | null>(null)

  useEffect(() => {
    if (!demoReady) return
    let cancelled = false
    void readPerformance(db, demoEnabled).then((next) => {
      if (!cancelled) setView(next)
    })
    return () => {
      cancelled = true
    }
  }, [demoEnabled, demoReady])

  return (
    <>
      <AppBar title={t('performance.title')} />
      <Page>
        {demoEnabled && <FictionalDataBanner />}
        <p className="text-base text-muted">{t('performance.intro')}</p>

        {view === null ? (
          <Spinner label={t('performance.title')} />
        ) : !view.report.sufficient ? (
          <EmptyState
            title={t('performance.insufficientTitle')}
            body={t('performance.insufficientBody', {
              scored: view.report.scored,
              needed: MINIMUM_SCORED_FOR_METRICS,
            })}
            icon={<FlaskIcon className="size-10" />}
            action={
              <Link
                to="/research/labels"
                className="inline-flex min-h-(--size-touch-min) items-center rounded-control bg-primary-strong px-5 text-base font-semibold text-on-primary"
              >
                {t('performance.labelMore')}
              </Link>
            }
          />
        ) : (
          <>
            <Section>
              <div className="grid grid-cols-2 gap-3">
                <Headline
                  label={t('performance.accuracy')}
                  value={formatPercent(view.report.accuracy)}
                  denominator={t('performance.ofN', { n: view.report.scored })}
                />
                <Headline
                  label={t('performance.macroF1')}
                  value={
                    view.report.macroF1 === null ? null : view.report.macroF1.toFixed(3)
                  }
                  denominator={t('performance.ofN', { n: view.report.scored })}
                />
              </div>
            </Section>

            <Section title={t('performance.perClassHeading')}>
              <PerClassTable perClass={view.report.perClass} />
            </Section>

            <Section title={t('performance.matrixHeading')} description={t('performance.matrixCaption')}>
              <ConfusionMatrix view={view} />
            </Section>

            <ExcludedSummary view={view} />

            <Banner tone="info" title={t('performance.title')}>
              {t('performance.noRegression')}
            </Banner>
          </>
        )}
      </Page>
    </>
  )
}

function Headline({
  label,
  value,
  denominator,
}: {
  label: string
  value: string | null
  denominator: string
}) {
  const { t } = useResearchTranslation()
  return (
    <Card padding="sm">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-heading text-3xl font-bold tabular-nums text-on-surface">
        {value ?? t('performance.notEnough')}
      </p>
      {/* The denominator is not optional decoration: 100% of 2 and 100% of 200
          are different findings and the percentage alone cannot say which. */}
      <p className="mt-1 text-sm text-muted tabular-nums">{denominator}</p>
    </Card>
  )
}

function Cell({ value }: { value: number | null }) {
  const { t } = useResearchTranslation()
  return (
    <td className="px-2 py-2 text-right tabular-nums">
      {value === null ? (
        <span title={t('performance.notEnoughLabel')} className="text-muted">
          {t('performance.notEnough')}
        </span>
      ) : (
        formatPercent(value)
      )}
    </td>
  )
}

function PerClassTable({ perClass }: { perClass: readonly ClassMetrics[] }) {
  const { t } = useResearchTranslation()
  const { t: tc } = useTranslation('codes', { useSuspense: false })

  return (
    <Card padding="sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th scope="col" className="px-2 py-2 font-semibold">
                {t('performance.class')}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                {t('performance.support')}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                {t('performance.precision')}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                {t('performance.recall')}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                {t('performance.specificity')}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                {t('performance.f1')}
              </th>
            </tr>
          </thead>
          <tbody>
            {perClass.map((entry) => (
              <tr key={entry.code} className="border-b border-border last:border-0">
                <th scope="row" className="px-2 py-2 text-left font-normal text-on-surface">
                  {tc(`classification.${entry.code}`)}
                  {entry.underSupported && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-on-warning-surface">
                      <WarningIcon className="size-3.5" />
                      {t('performance.underSupported', { n: MINIMUM_CLASS_SUPPORT })}
                    </span>
                  )}
                </th>
                <td className="px-2 py-2 text-right tabular-nums text-muted">{entry.support}</td>
                <Cell value={entry.precision} />
                <Cell value={entry.recall} />
                <Cell value={entry.specificity} />
                <Cell value={entry.f1} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/**
 * Rows are the true class, columns are the prediction.
 *
 * A real `<table>` rather than an SVG grid: this is tabular data, and a screen
 * reader can navigate a table by row and column headers, which is exactly the
 * structure a confusion matrix has. Cells carry a shaded background scaled to
 * their share of the row, but the number is always present — the shading is a
 * second signal, never the only one.
 */
function ConfusionMatrix({ view }: { view: PerformanceView }) {
  const { t } = useResearchTranslation()
  const { t: tc } = useTranslation('codes', { useSuspense: false })
  const { counts } = view.report

  return (
    <Card padding="sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t('performance.matrixCaption')}</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="px-2 py-2 text-left font-semibold">
                {t('performance.matrixActual')}
              </th>
              {CLASS_ORDER.map((code) => (
                <th key={code} scope="col" className="px-2 py-2 text-right font-semibold">
                  {tc(`classification.${code}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CLASS_ORDER.map((actual) => {
              const rowTotal = CLASS_ORDER.reduce((sum, p) => sum + counts[actual][p], 0)
              return (
                <tr key={actual} className="border-t border-border">
                  <th scope="row" className="px-2 py-2 text-left font-normal text-on-surface">
                    {tc(`classification.${actual}`)}
                  </th>
                  {CLASS_ORDER.map((predicted) => {
                    const value = counts[actual][predicted]
                    const share = rowTotal === 0 ? 0 : value / rowTotal
                    const onDiagonal = actual === predicted
                    return (
                      <td
                        key={predicted}
                        className="px-2 py-2 text-right tabular-nums text-on-surface"
                        style={{
                          // Opacity only, over a token colour, so this follows
                          // the theme instead of baking a palette value in.
                          backgroundColor: `color-mix(in srgb, var(--color-${
                            onDiagonal ? 'success' : 'warning'
                          }) ${Math.round(share * 45)}%, transparent)`,
                        }}
                      >
                        {value}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/** Every labelled recording that did not reach the matrix, and why. */
function ExcludedSummary({ view }: { view: PerformanceView }) {
  const { t } = useResearchTranslation()
  const entries: { label: string; count: number }[] = [
    ...GROUND_TRUTH_STATUS_LIST.map((code) => ({
      label: t(`groundTruth.${code}`),
      count: view.excluded[code] ?? 0,
    })),
    { label: t('performance.excludedNoPrediction'), count: view.excluded.NO_PREDICTION },
  ].filter((entry) => entry.count > 0)

  if (entries.length === 0) return null

  return (
    <Section title={t('performance.excludedHeading')} description={t('performance.excludedBody')}>
      <Card padding="sm">
        <ul className="flex flex-col gap-1 text-sm">
          {entries.map((entry) => (
            <li key={entry.label} className="flex justify-between gap-4">
              <span className="text-on-surface">{entry.label}</span>
              <span className="tabular-nums text-muted">{entry.count}</span>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  )
}

export default PerformancePage
