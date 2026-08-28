import { Link } from 'react-router-dom'
import {
  Card,
  ChevronRightIcon,
  DisclaimerBanner,
  EmptyState,
  InboxIcon,
  LungsIcon,
  PeopleIcon,
  RefreshIcon,
  Section,
  StatusPill,
  MicIcon,
  type IconComponent,
} from '../../../components'
import { PatientScreen, WhatAuscultaDoes } from '../components/PatientScreen'
import { ReviewStatusLine } from '../components/Attribution'
import type { PatientRepository } from '../data/patientRepository'
import { BREAKDOWN_KEY, BREAKDOWN_ORDER, type AssessmentSummary } from '../data/resultView'
import { formatLongDate } from '../format'
import { usePatientTranslation } from '../i18n'
import { PATIENT_PATHS, resultDetailPath } from '../navigation'

/**
 * The screen a person with asthma opens.
 *
 * Priority order, top to bottom, and the reasoning for it:
 *
 * 1. **Who they are.** One line. A shared clinic phone makes "is this me?" a
 *    real question, and every number below is meaningless until it is answered.
 * 2. **Their most recent check, in full, with its review status.** Not a
 *    teaser — the actual verdict and whether a person has confirmed it. This is
 *    what they opened the app to find out, and burying it under navigation
 *    would make them hunt for their own health.
 * 3. **Where to go next**, as four large labelled cards. The validator task is
 *    *"find where you can view your respiratory assessment results"*, and "My
 *    results" is both the first card here AND the second item in the bottom bar:
 *    two independent one-tap routes to the same place, because a validator who
 *    misses one must still find the other.
 * 4. **What the app is not.** Last, because it is the sentence they need when
 *    they act on any of the above.
 */

export interface PatientHomePageProps {
  /** Injectable for tests; production uses the real database. */
  repository?: PatientRepository
}

export function PatientHomePage({ repository }: PatientHomePageProps) {
  const { t, i18n } = usePatientTranslation()
  const language = i18n.language

  return (
    <PatientScreen
      activeId="home"
      title={t('patient:home.title')}
      {...(repository !== undefined && { repository })}
    >
      {(overview) => {
        const patient = overview.patient
        const latest: AssessmentSummary | undefined = overview.summaries[0]

        return (
          <>
            <header>
              <h2 className="font-heading text-2xl font-bold text-on-surface">
                {t('patient:home.greeting', { name: patient?.name ?? '' })}
              </h2>
              <p className="mt-1 text-base text-muted">{t('patient:home.subtitle')}</p>
            </header>

            <Section
              title={t('patient:home.latestHeading')}
              description={t('patient:home.latestDescription')}
            >
              {latest === undefined ? (
                <EmptyState
                  title={t('patient:results.empty.title')}
                  body={t('patient:results.empty.body')}
                  icon={<LungsIcon className="size-10" />}
                />
              ) : (
                <LatestCheckCard summary={latest} language={language} />
              )}
            </Section>

            <Section title={t('patient:home.goToHeading')}>
              <ul className="flex flex-col gap-3">
                <DestinationCard
                  to={PATIENT_PATHS.results}
                  icon={LungsIcon}
                  title={t('patient:home.quickResults')}
                  body={t('patient:home.quickResultsBody')}
                />
                <DestinationCard
                  to={PATIENT_PATHS.recordings}
                  icon={MicIcon}
                  title={t('patient:home.quickRecordings')}
                  body={t('patient:home.quickRecordingsBody')}
                />
                <DestinationCard
                  to={PATIENT_PATHS.trends}
                  icon={RefreshIcon}
                  title={t('patient:home.quickTrends')}
                  body={t('patient:home.quickTrendsBody')}
                />
                <DestinationCard
                  to={PATIENT_PATHS.history}
                  icon={PeopleIcon}
                  title={t('patient:home.quickHistory')}
                  body={t('patient:home.quickHistoryBody')}
                />
                <DestinationCard
                  to={PATIENT_PATHS.rehab}
                  icon={InboxIcon}
                  title={t('patient:home.quickRehab')}
                  body={t('patient:home.quickRehabBody')}
                />
              </ul>
            </Section>

            <WhatAuscultaDoes />
            <DisclaimerBanner />
          </>
        )
      }}
    </PatientScreen>
  )
}

/**
 * The most recent visit, summarised.
 *
 * Shows the loudest verdict as a pill AND the full count of what was heard
 * where — five clear zones and one inconclusive one is a different thing from
 * six clear zones, and a single pill cannot say which happened.
 */
function LatestCheckCard({
  summary,
  language,
}: {
  summary: AssessmentSummary
  language: string
}) {
  const { t } = usePatientTranslation()

  return (
    <Card>
      <p className="text-base text-muted">
        {t('patient:home.checkedOn', { date: formatLongDate(summary.date, language) })}
      </p>

      {summary.dominantVerdict !== null && (
        <div className="mt-2">
          <StatusPill verdict={summary.dominantVerdict} />
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-1 text-base text-on-surface">
        {BREAKDOWN_ORDER.filter((state) => summary.counts[state] > 0).map((state) => (
          <li key={state}>
            {t(`patient:results.breakdown.${BREAKDOWN_KEY[state]}`, {
              count: summary.counts[state],
            })}
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <ReviewStatusLine status={summary.reviewStatus} />
      </div>

      <Link
        to={resultDetailPath(summary.assessmentId)}
        className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-primary-strong px-5 text-lg font-semibold text-on-primary"
      >
        {t('patient:home.openLatest')}
        <ChevronRightIcon className="size-5 shrink-0" />
      </Link>
    </Card>
  )
}

/**
 * One destination.
 *
 * A whole-card link rather than a card with a button in it: the entire tile is
 * the 48px-plus target, which is what a validator's thumb actually hits.
 */
function DestinationCard({
  to,
  icon: Icon,
  title,
  body,
}: {
  to: string
  icon: IconComponent
  title: string
  body: string
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-16 items-center gap-3 rounded-card border border-border bg-surface-raised p-4 text-on-surface elevation-1"
      >
        <Icon className="size-7 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-lg font-bold">{title}</span>
          <span className="mt-0.5 block text-base text-muted">{body}</span>
        </span>
        <ChevronRightIcon className="size-6 shrink-0 text-muted" />
      </Link>
    </li>
  )
}
