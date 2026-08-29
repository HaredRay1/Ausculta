import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  DisclaimerBanner,
  EmptyState,
  NotConnectedPanel,
  Section,
  StatusPill,
  SearchIcon,
} from '../../../components'
import { AiAttribution, PractitionerAttribution } from '../components/Attribution'
import { PatientScreen, WhatAuscultaDoes } from '../components/PatientScreen'
import { RecordingResult } from '../components/RecordingResult'
import { useGoBack } from '../components/PatientShell'
import type { PatientRepository } from '../data/patientRepository'
import { BREAKDOWN_KEY, BREAKDOWN_ORDER } from '../data/resultView'
import { formatLongDate } from '../format'
import { usePatientTranslation } from '../i18n'
import { PATIENT_PATHS } from '../navigation'
import { exampleCopyFor } from '../components/ExampleCopy'

/**
 * One visit, in full.
 *
 * The screen is ordered so the two sources can never be read as one another:
 * everything the app worked out sits inside a single labelled block, and
 * everything a person said sits inside a second, separately labelled one. The
 * per-place results are children of the AI block rather than siblings of it,
 * so there is no reading order in which a `ResultCard` appears to be under the
 * practitioner's heading.
 *
 * The severity slot renders `NotConnectedPanel`. Severity scoring is not built,
 * and `Assessment.aiSeverity.status` says so — so this screen prints "No value"
 * where a score would go rather than deriving something plausible from the
 * recordings, which would be a fabricated clinical value.
 */

export interface ResultDetailPageProps {
  repository?: PatientRepository
}

export function ResultDetailPage({ repository }: ResultDetailPageProps) {
  const { t, i18n } = usePatientTranslation()
  const { assessmentId = '' } = useParams()
  const navigate = useNavigate()
  const goBack = useGoBack(PATIENT_PATHS.results)
  const language = i18n.language

  return (
    <PatientScreen
      activeId="results"
      title={t('patient:results.detailTitle')}
      onBack={goBack}
      {...(repository !== undefined && { repository })}
    >
      {(overview) => {
        const exampleCopy = exampleCopyFor(overview.isFictional)
        const summary = overview.summaries.find((row) => row.assessmentId === assessmentId)
        const assessment = overview.assessmentsById[assessmentId]

        if (summary === undefined || assessment === undefined) {
          return (
            <EmptyState
              title={t('patient:results.notFound.title')}
              body={t('patient:results.notFound.body')}
              icon={<SearchIcon className="size-10" />}
              action={
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => navigate(PATIENT_PATHS.results)}
                >
                  {t('patient:results.notFound.action')}
                </Button>
              }
            />
          )
        }

        const reviewerId = assessment.practitionerReviewerId
        const reviewer = reviewerId === undefined ? undefined : overview.staffById[reviewerId]

        return (
          <>
            <Card>
              <h2 className="font-heading text-xl font-bold text-on-surface">
                {formatLongDate(summary.date, language)}
              </h2>
              <p className="mt-1 text-base text-muted">
                {t('patient:results.placesCounted', {
                  count: summary.recordedCount,
                  total: summary.recordedCount,
                })}
              </p>
              <p className="mt-1 text-base text-on-surface">
                {t('patient:results.recordedPlaces')}:{' '}
                {summary.locations.map((code) => t(`codes:location.${code}`)).join(', ')}
              </p>
            </Card>

            <AiAttribution>
              <section aria-label={t('patient:results.overallHeading')}>
                <h3 className="font-heading text-base font-bold text-on-surface">
                  {t('patient:results.overallHeading')}
                </h3>
                {summary.dominantVerdict !== null && (
                  <div className="mt-2">
                    <StatusPill verdict={summary.dominantVerdict} />
                  </div>
                )}
                <ul className="mt-2 flex flex-col gap-1 text-base text-on-surface">
                  {BREAKDOWN_ORDER.filter((state) => summary.counts[state] > 0).map((state) => (
                    <li key={state}>
                      {t(`patient:results.breakdown.${BREAKDOWN_KEY[state]}`, {
                        count: summary.counts[state],
                      })}
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-label={t('patient:results.perLocationHeading', exampleCopy)}>
                <h3 className="font-heading text-base font-bold text-on-surface">
                  {t('patient:results.perLocationHeading', exampleCopy)}
                </h3>
                <div className="mt-2 flex flex-col gap-4">
                  {summary.views.map((view) => (
                    <RecordingResult
                      key={view.recordingId}
                      view={view}
                      language={language}
                      withAudio
                      {...(repository !== undefined && { repository })}
                    />
                  ))}
                </div>
              </section>
            </AiAttribution>

            <PractitionerAttribution
              assessment={assessment}
              language={language}
              {...(reviewer !== undefined && { reviewer })}
            />

            <Section title={t('patient:results.severityTitle')}>
              <NotConnectedPanel
                title={t('patient:results.severityTitle')}
                body={t('patient:results.severityBody')}
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
