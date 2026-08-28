import { Banner, Button, CheckCircleIcon, EmptyState, Section } from '../../../components'
import { LOCATION_ORDER } from '../guides'
import { useAssessmentTranslation } from '../i18n'

/**
 * Step 9 — record another position, or hand the assessment to a practitioner.
 *
 * Six positions give the fullest picture, but a health worker can send fewer:
 * a patient who cannot sit through all six should still produce a record worth
 * reviewing.
 */
export interface NextStepProps {
  recordedCount: number
  busy: boolean
  errorKey: string | null
  onRecordAnother: () => void
  onSubmit: () => void
}

export function NextStep({
  recordedCount,
  busy,
  errorKey,
  onRecordAnother,
  onSubmit,
}: NextStepProps) {
  const { t } = useAssessmentTranslation()

  return (
    <Section
      title={t('next.title')}
      description={t('next.body', { done: recordedCount, total: LOCATION_ORDER.length })}
    >
      {errorKey !== null && <Banner tone="danger">{t(errorKey)}</Banner>}

      <Button onClick={onRecordAnother} fullWidth size="lg">
        {t('next.recordAnother')}
      </Button>

      <Button
        variant="secondary"
        onClick={onSubmit}
        loading={busy}
        disabled={recordedCount === 0}
        fullWidth
      >
        {t('action.submit')}
      </Button>

      <p className="text-sm text-muted">
        {recordedCount === 0 ? t('next.needsOne') : t('next.submitHint')}
      </p>
    </Section>
  )
}

export interface SubmittedStepProps {
  onDone: () => void
}

export function SubmittedStep({ onDone }: SubmittedStepProps) {
  const { t } = useAssessmentTranslation()

  return (
    <EmptyState
      title={t('submitted.title')}
      body={t('submitted.body')}
      icon={<CheckCircleIcon className="size-10 text-success" />}
      action={
        <Button onClick={onDone} size="lg">
          {t('submitted.backToStart')}
        </Button>
      }
    />
  )
}
