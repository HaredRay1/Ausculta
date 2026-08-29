import { Link } from 'react-router-dom'
import {
  Avatar,
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
  IconTile,
  ProgressRing,
  StatTile,
  type IconComponent,
  type TileTone,
} from '../../../components'
import { PatientScreen, WhatAuscultaDoes } from '../components/PatientScreen'
import { ReviewStatusLine } from '../components/Attribution'
import type { PatientRepository } from '../data/patientRepository'
import { BREAKDOWN_KEY, BREAKDOWN_ORDER, type AssessmentSummary } from '../data/resultView'
import { formatLongDate } from '../format'
import { useAuth } from '../../../auth/AuthContext'
import { usePatientTranslation } from '../i18n'
import { PATIENT_PATHS, resultDetailPath } from '../navigation'
import { exampleCopyFor } from '../components/ExampleCopy'

/** The six auscultation sites. The ring's denominator is this, never a guess. */
const ALL_CHEST_PLACES = 6

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
  // The signed-in user's OWN name, from their account -- never the patient
  // record's. When the app showed a seeded record it greeted a real person as
  // somebody fictional, and the greeting is the first thing anyone reads.
  const { user } = useAuth()
  const signedInName = user?.name ?? ''
  const language = i18n.language

  return (
    <PatientScreen
      activeId="home"
      title={t('patient:home.title')}
      {...(repository !== undefined && { repository })}
    >
      {(overview) => {
        const exampleCopy = exampleCopyFor(overview.isFictional)
        const latest: AssessmentSummary | undefined = overview.summaries[0]

        /** A real elapsed count, or null when there is no check to count from. */
        const daysSinceLatest =
          latest === undefined
            ? null
            : Math.max(
                0,
                Math.floor((Date.now() - new Date(latest.date).getTime()) / 86_400_000),
              )

        return (
          <>
            {/* The greeting leads with the person, because "is this me?" is a
                real question on a shared clinic phone and every number below is
                meaningless until it is answered. */}
            <header className="flex items-start gap-3">
              <Avatar name={signedInName} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-headline text-on-surface">
                  {t('patient:home.greeting', { name: signedInName })}
                </h2>
                <p className="mt-1 text-sm leading-snug text-muted">
                  {t('patient:home.subtitle', exampleCopy)}
                </p>
              </div>
            </header>

            <Section
              title={t('patient:home.latestHeading', exampleCopy)}
              description={t('patient:home.latestDescription', exampleCopy)}
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

            {/*
              The record, as counts. Every figure here is something the
              database actually holds — how many checks exist, how long since
              the last one, how many chest places it covered. Nothing derived,
              nothing scored: a big number reads as authoritative, which is
              exactly why an invented one would do more damage here than
              anywhere else on the screen.
            */}
            <Section title={t('patient:home.statsHeading')}>
              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  value={overview.summaries.length > 0 ? overview.summaries.length : null}
                  label={t('patient:home.statChecks')}
                  emptyText={t('patient:home.statChecksEmpty')}
                />
                <StatTile
                  value={daysSinceLatest}
                  label={t('patient:home.statDaysSince')}
                  emptyText={t('patient:home.statDaysSinceEmpty')}
                />
              </div>

              {latest !== undefined && (
                <div className="flex items-center gap-4 rounded-card bg-card p-4">
                  <ProgressRing
                    value={latest.recordedCount}
                    max={ALL_CHEST_PLACES}
                    label={t('patient:home.statLocationsAria')}
                  />
                  <p className="min-w-0 flex-1 text-sm leading-snug text-muted">
                    {t('patient:home.statLocations')}
                  </p>
                </div>
              )}
            </Section>

            <Section title={t('patient:home.goToHeading')}>
              <ul className="flex flex-col gap-3">
                <DestinationCard tone="tone-1"
                  to={PATIENT_PATHS.results}
                  icon={LungsIcon}
                  title={t('patient:home.quickResults', exampleCopy)}
                  body={t('patient:home.quickResultsBody', exampleCopy)}
                />
                <DestinationCard tone="tone-2"
                  to={PATIENT_PATHS.recordings}
                  icon={MicIcon}
                  title={t('patient:home.quickRecordings', exampleCopy)}
                  body={t('patient:home.quickRecordingsBody')}
                />
                <DestinationCard tone="tone-3"
                  to={PATIENT_PATHS.trends}
                  icon={RefreshIcon}
                  title={t('patient:home.quickTrends')}
                  body={t('patient:home.quickTrendsBody', exampleCopy)}
                />
                <DestinationCard tone="tone-4"
                  to={PATIENT_PATHS.history}
                  icon={PeopleIcon}
                  title={t('patient:home.quickHistory', exampleCopy)}
                  body={t('patient:home.quickHistoryBody', exampleCopy)}
                />
                <DestinationCard tone="tone-5"
                  to={PATIENT_PATHS.rehab}
                  icon={InboxIcon}
                  title={t('patient:home.quickRehab')}
                  body={t('patient:home.quickRehabBody', exampleCopy)}
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
  tone = 'accent',
}: {
  to: string
  icon: IconComponent
  title: string
  body: string
  /** A different tint per destination, so the four are told apart at a glance. */
  tone?: TileTone
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-16 items-center gap-3 rounded-card bg-card p-3 text-on-surface transition-colors duration-150 ease-out active:bg-nested"
      >
        <IconTile tone={tone}>
          <Icon className="size-6" />
        </IconTile>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-base font-bold">{title}</span>
          <span className="mt-0.5 block text-sm leading-snug text-muted">{body}</span>
        </span>
        <ChevronRightIcon className="size-6 shrink-0 text-muted" />
      </Link>
    </li>
  )
}
