import { useNavigate } from 'react-router-dom'
import {
  Banner,
  Button,
  Card,
  DisclaimerBanner,
  EmptyState,
  NotConnectedPanel,
  RefreshIcon,
  Section,
} from '../../../components'
import { PatientScreen, WhatAuscultaDoes } from '../components/PatientScreen'
import { TrendChart } from '../components/TrendChart'
import type { PatientRepository } from '../data/patientRepository'
import { buildTrendSeries, MIN_TREND_POINTS } from '../data/trends'
import { usePatientTranslation } from '../i18n'
import { PATIENT_PATHS } from '../navigation'

/**
 * How the checks compare, visit to visit.
 *
 * Everything on this screen is phrased about the *recordings*, never about the
 * person: "places the app flagged", "how many recordings were clear enough". A
 * patient with asthma reading "your asthma is getting worse" from a screening
 * prototype would act on it, and nothing here supports that sentence.
 *
 * Below two visits the screen refuses to draw anything and says why. That
 * refusal is the feature — see `MIN_TREND_POINTS`.
 */

export interface TrendsPageProps {
  repository?: PatientRepository
}

export function TrendsPage({ repository }: TrendsPageProps) {
  const { t, i18n } = usePatientTranslation()
  const navigate = useNavigate()
  const language = i18n.language

  return (
    <PatientScreen
      activeId="trends"
      title={t('patient:trends.title')}
      {...(repository !== undefined && { repository })}
    >
      {(overview) => {
        const series = buildTrendSeries(overview.summaries)

        if (!series.canDrawLine) {
          return (
            <>
              <EmptyState
                title={t('patient:trends.empty.title')}
                body={
                  series.points.length === 0
                    ? t('patient:trends.empty.bodyNone')
                    : t('patient:trends.empty.body')
                }
                icon={<RefreshIcon className="size-10" />}
                action={
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => navigate(PATIENT_PATHS.results)}
                  >
                    {t('patient:trends.empty.action')}
                  </Button>
                }
              />
              <Section title={t('patient:trends.severityTitle')}>
                <NotConnectedPanel
                  title={t('patient:trends.severityTitle')}
                  body={t('patient:trends.severityBody')}
                />
              </Section>
              <DisclaimerBanner />
            </>
          )
        }

        const anyConfidence = series.points.some((point) => point.confidencePercent !== null)

        return (
          <>
            <Section
              title={t('patient:trends.heading')}
              description={t('patient:trends.description')}
            >
              <p className="text-base text-muted">
                {t('patient:trends.visitsCounted', { count: series.points.length })}
              </p>
            </Section>

            <Banner tone="info">
              <p>
                {series.patternChanged === true
                  ? t('patient:trends.changeDetected')
                  : t('patient:trends.noChangeDetected')}
              </p>
              <p className="mt-1">{t('patient:trends.changeNote')}</p>
            </Banner>

            <Card>
              <TrendChart
                points={series.points}
                valueOf={(point) => point.flaggedZones}
                formatValue={(value) => String(value ?? 0)}
                title={t('patient:trends.findingsChartTitle')}
                description={t('patient:trends.findingsChartDescription')}
                language={language}
              />
            </Card>

            <Card>
              {anyConfidence ? (
                <TrendChart
                  points={series.points}
                  valueOf={(point) => point.confidencePercent}
                  // A visit where nothing was named has no confidence. It shows
                  // as "No value", never as 0 % — see TrendPoint.
                  formatValue={(value) =>
                    value === null ? t('design:notConnected.noValue') : `${value}%`
                  }
                  title={t('patient:trends.confidenceChartTitle')}
                  description={t('patient:trends.confidenceChartDescription')}
                  language={language}
                  max={100}
                />
              ) : (
                <>
                  <h3 className="font-heading text-base font-bold text-on-surface">
                    {t('patient:trends.confidenceChartTitle')}
                  </h3>
                  <p className="mt-1 text-base text-muted">
                    {t('patient:trends.confidenceNone')}
                  </p>
                </>
              )}
            </Card>

            <Card>
              <TrendChart
                points={series.points}
                valueOf={(point) => point.qualityPercent}
                formatValue={(value) => `${value ?? 0}%`}
                title={t('patient:trends.qualityChartTitle')}
                description={t('patient:trends.qualityChartDescription')}
                language={language}
                max={100}
              />
            </Card>

            <Section title={t('patient:trends.severityTitle')}>
              <NotConnectedPanel
                title={t('patient:trends.severityTitle')}
                body={t('patient:trends.severityBody')}
              />
            </Section>

            <WhatAuscultaDoes />
            <DisclaimerBanner />
          </>
        )
      }}
    </PatientScreen>
  )
}

export { MIN_TREND_POINTS }
