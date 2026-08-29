import { Link, useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  DisclaimerBanner,
  EmptyState,
  MicIcon,
  Section,
} from '../../../components'
import { AiAttribution } from '../components/Attribution'
import { PatientScreen } from '../components/PatientScreen'
import { RecordingResult } from '../components/RecordingResult'
import { useGoBack } from '../components/PatientShell'
import type { PatientRepository } from '../data/patientRepository'
import { toPatientRecordingView } from '../data/resultView'
import { formatLongDate } from '../format'
import { usePatientTranslation } from '../i18n'
import { PATIENT_PATHS, resultDetailPath } from '../navigation'
import { exampleCopyFor } from '../components/ExampleCopy'

/**
 * Every recording, flat and newest first.
 *
 * A separate screen from "my results" because the two answer different
 * questions: results are organised by visit and are about findings, this is
 * organised by recording and is about *listening*. A patient who wants to hear
 * what their own chest sounded like should not have to work out which visit it
 * belonged to first.
 *
 * The whole list sits inside the AI attribution block, since everything stated
 * beside a recording here was produced by the app alone — a practitioner's
 * review belongs to a visit, and this screen is not organised by visit.
 */

export interface RecordingsPageProps {
  repository?: PatientRepository
}

export function RecordingsPage({ repository }: RecordingsPageProps) {
  const { t, i18n } = usePatientTranslation()
  const navigate = useNavigate()
  const goBack = useGoBack(PATIENT_PATHS.home)
  const language = i18n.language

  return (
    <PatientScreen
      activeId="results"
      title={t('patient:recordings.title')}
      onBack={goBack}
      {...(repository !== undefined && { repository })}
    >
      {(overview) => {
        const exampleCopy = exampleCopyFor(overview.isFictional)
        if (overview.recordings.length === 0) {
          return (
            <>
              <EmptyState
                title={t('patient:recordings.empty.title')}
                body={t('patient:recordings.empty.body')}
                icon={<MicIcon className="size-10" />}
                action={
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => navigate(PATIENT_PATHS.home)}
                  >
                    {t('patient:recordings.empty.action')}
                  </Button>
                }
              />
              <DisclaimerBanner />
            </>
          )
        }

        return (
          <>
            <Section
              title={t('patient:recordings.heading')}
              description={t('patient:recordings.description', exampleCopy)}
            >
              <AiAttribution>
                {overview.recordings.map((recording) => {
                  const view = toPatientRecordingView(recording)
                  return (
                    <Card key={view.recordingId} padding="sm">
                      <p className="text-sm text-muted">
                        {formatLongDate(view.createdAt, language)}
                      </p>
                      <div className="mt-2">
                        <RecordingResult
                          view={view}
                          language={language}
                          withAudio
                          {...(repository !== undefined && { repository })}
                        />
                      </div>
                      <Link
                        to={resultDetailPath(view.assessmentId)}
                        className="mt-3 inline-flex min-h-12 items-center text-base font-semibold text-primary underline"
                      >
                        {t('patient:recordings.openAssessment')}
                      </Link>
                    </Card>
                  )
                })}
              </AiAttribution>
            </Section>

            <DisclaimerBanner />
          </>
        )
      }}
    </PatientScreen>
  )
}
