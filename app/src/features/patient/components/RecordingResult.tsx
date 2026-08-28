import { Banner, NotConnectedPanel, ResultCard } from '../../../components'
import { formatShortDate } from '../format'
import { usePatientTranslation } from '../i18n'
import type { PatientRecordingView } from '../data/resultView'
import { RecordingAudio } from './RecordingAudio'
import type { PatientRepository } from '../data/patientRepository'

export interface RecordingResultProps {
  view: PatientRecordingView
  language: string
  /** Shows the audio player beneath the result. */
  withAudio?: boolean
  repository?: PatientRepository
}

/**
 * One place on the chest: what was heard there, and the sound itself.
 *
 * The three states that are NOT a verdict — the listening tool was not running,
 * the recording has not been through it, and it failed outright — get their own
 * panel rather than a `ResultCard`. A ResultCard is a statement about the
 * person; these are statements about the software, and dressing one as the
 * other is how "we did not check" becomes "we checked and found nothing".
 *
 * `confidencePercent` is passed straight through from the view, which only ever
 * sets it on `suggestive`. Nothing here re-derives a number, so the no-number
 * rule holds by construction: there is no branch in this file where a numeral
 * could be reintroduced.
 */
export function RecordingResult({
  view,
  language,
  withAudio = false,
  repository,
}: RecordingResultProps) {
  const { t } = usePatientTranslation()
  const locationLabel = t(`codes:location.${view.locationCode}`)
  const meta = `${locationLabel} · ${formatShortDate(view.createdAt, language)}`

  const audio = withAudio ? (
    <RecordingAudio
      audioBlobId={view.audioBlobId}
      locationLabel={locationLabel}
      durationSec={view.durationSec}
      {...(repository !== undefined && { repository })}
    />
  ) : null

  const modelLine =
    view.modelVersion !== undefined
      ? t('patient:results.modelVersion', { version: view.modelVersion })
      : t('patient:results.modelVersionUnknown')

  if (view.verdict === null) {
    const notDecided =
      view.state === 'model-not-connected' ? (
        <NotConnectedPanel
          title={locationLabel}
          body={t('patient:results.modelNotConnectedBody')}
        />
      ) : (
        <Banner
          tone={view.state === 'error' ? 'danger' : 'info'}
          title={
            view.state === 'error'
              ? t('patient:results.errorTitle')
              : t('patient:results.notAnalysedTitle')
          }
        >
          <p>
            {view.state === 'error'
              ? t('patient:results.errorBody')
              : t('patient:results.notAnalysedBody')}
          </p>
          <p className="mt-1 text-sm">{meta}</p>
        </Banner>
      )

    return (
      <div className="flex flex-col gap-2">
        {notDecided}
        {audio}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <ResultCard
        verdict={view.verdict}
        meta={meta}
        {...(view.confidencePercent !== undefined && {
          confidencePercent: view.confidencePercent,
        })}
      >
        {view.conditionCode !== undefined && (
          <div className="rounded-control border border-current/30 p-3">
            <p className="text-base font-semibold">
              {t('patient:results.possibleFindingIs', {
                condition: t(`codes:classification.${view.conditionCode}`),
              })}
            </p>
            <p className="mt-1 text-sm">{t('patient:results.possibleFindingNote')}</p>
          </div>
        )}
        {/*
          Three states, not two. A recording that carries no quality report was
          never measured for clearness — most seeded and imported audio is in
          exactly that position — and telling a patient it was "clear enough to
          check" would be asserting the result of a check nobody ran.
        */}
        <p className="text-sm opacity-90">
          {view.state === 'insufficient-quality'
            ? t('patient:results.qualityBad')
            : view.hasQualityReport
              ? t('patient:results.qualityOk')
              : t('patient:results.qualityUnknown')}
        </p>
        <p className="text-sm opacity-90">{modelLine}</p>
      </ResultCard>
      {audio}
    </div>
  )
}
