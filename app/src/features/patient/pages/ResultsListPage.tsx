import { Link, useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  ChevronRightIcon,
  DisclaimerBanner,
  EmptyState,
  LungsIcon,
  Section,
  StatusPill,
} from '../../../components'
import { ReviewStatusLine } from '../components/Attribution'
import { PatientScreen, WhatAuscultaDoes } from '../components/PatientScreen'
import type { PatientRepository } from '../data/patientRepository'
import { BREAKDOWN_KEY, BREAKDOWN_ORDER, type AssessmentSummary } from '../data/resultView'
import { formatLongDate } from '../format'
import { usePatientTranslation } from '../i18n'
import { PATIENT_PATHS, resultDetailPath } from '../navigation'

/**
 * "My results" — the destination of the scored validator task.
 *
 * One row per visit, newest first, and each row answers the three questions a
 * patient actually has before they open anything: when was this, what did it
 * find, and has a person checked it. The places recorded are listed on the row
 * too, because "they only managed two spots" changes how much the row means.
 */

export interface ResultsListPageProps {
  repository?: PatientRepository
}

export function ResultsListPage({ repository }: ResultsListPageProps) {
  const { t, i18n } = usePatientTranslation()
  const navigate = useNavigate()

  return (
    <PatientScreen
      activeId="results"
      title={t('patient:results.title')}
      {...(repository !== undefined && { repository })}
    >
      {(overview) => (
        <>
          {overview.summaries.length === 0 ? (
            <EmptyState
              title={t('patient:results.empty.title')}
              body={t('patient:results.empty.body')}
              icon={<LungsIcon className="size-10" />}
              action={
                <Button variant="secondary" fullWidth onClick={() => navigate(PATIENT_PATHS.home)}>
                  {t('patient:shared.backHome')}
                </Button>
              }
            />
          ) : (
            <Section
              title={t('patient:results.listHeading')}
              description={t('patient:results.listDescription')}
            >
              <ul className="flex flex-col gap-3">
                {overview.summaries.map((summary) => (
                  <ResultRow key={summary.assessmentId} summary={summary} language={i18n.language} />
                ))}
              </ul>
            </Section>
          )}

          <WhatAuscultaDoes />
          <DisclaimerBanner />
        </>
      )}
    </PatientScreen>
  )
}

function ResultRow({ summary, language }: { summary: AssessmentSummary; language: string }) {
  const { t } = usePatientTranslation()

  return (
    <Card as="li" padding="none">
      <Link
        to={resultDetailPath(summary.assessmentId)}
        className="flex min-h-16 items-start gap-3 p-4"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-lg font-bold text-on-surface">
            {formatLongDate(summary.date, language)}
          </span>

          {summary.dominantVerdict !== null && (
            <span className="mt-2 block">
              <StatusPill verdict={summary.dominantVerdict} size="sm" />
            </span>
          )}

          <span className="mt-2 block text-base text-on-surface">
            {BREAKDOWN_ORDER.filter((state) => summary.counts[state] > 0)
              .map((state) =>
                t(`patient:results.breakdown.${BREAKDOWN_KEY[state]}`, {
                  count: summary.counts[state],
                }),
              )
              .join(' · ')}
          </span>

          <span className="mt-2 block text-sm text-muted">
            {t('patient:results.recordedPlaces')}:{' '}
            {summary.locations.map((code) => t(`codes:location.${code}`)).join(', ')}
          </span>

          <span className="mt-2 block">
            <ReviewStatusLine status={summary.reviewStatus} />
          </span>
        </span>

        <ChevronRightIcon className="mt-1 size-6 shrink-0 text-muted" />
      </Link>
    </Card>
  )
}
