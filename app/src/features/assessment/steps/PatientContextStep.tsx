import { Banner, Button, Card, EmptyState, PeopleIcon, Section } from '../../../components'
import { useAssessmentTranslation } from '../i18n'

/**
 * Step 1 — confirm who this assessment is about.
 *
 * The patient is chosen upstream and arrives as an id; this screen only
 * confirms it, because starting a recording against the wrong person is the
 * kind of mistake nothing downstream can undo.
 */
export interface PatientContextStepProps {
  patientId: string | null
  busy: boolean
  errorKey: string | null
  onStart: () => void
  /** Sends the health worker to the patient list to pick someone. */
  onChoosePatient: () => void
}

export function PatientContextStep({
  patientId,
  busy,
  errorKey,
  onStart,
  onChoosePatient,
}: PatientContextStepProps) {
  const { t } = useAssessmentTranslation()

  if (patientId === null) {
    return (
      <EmptyState
        title={t('patient.missingTitle')}
        body={t('patient.missingBody')}
        icon={<PeopleIcon className="size-10" />}
        // Without this the screen is a dead end: the app bar shows no back
        // button on the opening step, so someone who reached /assessment/new
        // without a patient — a bookmark, a typed URL, a menu that forgot the
        // parameter — would have no way forward at all.
        action={
          <Button onClick={onChoosePatient} size="lg">
            {t('patient.choosePatient')}
          </Button>
        }
      />
    )
  }

  return (
    <Section title={t('patient.title')} description={t('patient.subtitle')}>
      {errorKey !== null && <Banner tone="danger">{t(errorKey)}</Banner>}

      <Card>
        <dl className="flex flex-col gap-1">
          <dt className="text-sm font-medium text-muted">{t('patient.idLabel')}</dt>
          <dd className="font-heading text-xl font-bold text-on-surface">{patientId}</dd>
        </dl>
      </Card>

      <Button onClick={onStart} loading={busy} fullWidth size="lg">
        {t('action.start')}
      </Button>
    </Section>
  )
}
