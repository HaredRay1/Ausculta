import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner, Button, EmptyState, InfoIcon } from '../../../components'
import { usePatientOverview } from '../data/usePatientOverview'
import type { PatientOverview, PatientRepository } from '../data/patientRepository'
import { usePatientTranslation } from '../i18n'
import { PATIENT_PATHS, type PatientNavId } from '../navigation'
import { PatientLoadError, PatientLoading, PatientShell } from './PatientShell'

/**
 * Every patient screen, minus its content.
 *
 * Loading, a failed read, and "this account has no patient record yet" are the
 * same three cases on all six screens, and each of them is a place a validator
 * could hit a blank page. Handling them once means none of the six can forget
 * one — and the "no record" case in particular is written as a teaching state
 * rather than an error, because it is not an error: nobody has linked the
 * account yet, which is a normal thing to be true five minutes after
 * registering.
 */

export interface PatientScreenProps {
  activeId: PatientNavId
  /** Falls back to the nav label for this destination. */
  title?: string
  subtitle?: string
  onBack?: () => void
  repository?: PatientRepository
  children: (overview: PatientOverview) => ReactNode
}

export function PatientScreen({
  activeId,
  title,
  subtitle,
  onBack,
  repository,
  children,
}: PatientScreenProps) {
  const { t } = usePatientTranslation()
  const { overview, isLoading, error, reload } = usePatientOverview(
    repository !== undefined ? { repository } : {},
  )

  const heading = title ?? t(`patient:nav.${activeId}`)
  const frame = (content: ReactNode) => (
    <PatientShell
      activeId={activeId}
      title={heading}
      fictional={overview.isFictional}
      {...(subtitle !== undefined && { subtitle })}
      {...(onBack !== undefined && { onBack })}
    >
      {content}
    </PatientShell>
  )

  if (isLoading) return frame(<PatientLoading label={t('patient:shared.loading')} />)
  if (error !== null) return frame(<PatientLoadError onRetry={reload} />)
  if (overview.patient === null) return frame(<NoLinkedRecord />)

  return frame(
    <>
      {overview.source === 'demo-preview' && (
        <Banner tone="info" title={t('patient:shared.demoPreview.title')}>
          {t('patient:shared.demoPreview.body')}
        </Banner>
      )}
      {children(overview)}
    </>,
  )
}

/**
 * No patient record is linked to this account.
 *
 * Deliberately not an error and not a dead end: it says why, says who fixes it,
 * and still offers somewhere to go — the plain-language explanation of what the
 * app is for, which is useful to read while waiting to be registered.
 */
export function NoLinkedRecord() {
  const { t } = usePatientTranslation()
  const navigate = useNavigate()

  return (
    <EmptyState
      title={t('patient:shared.noRecord.title')}
      body={t('patient:shared.noRecord.body')}
      icon={<InfoIcon className="size-10" />}
      action={
        <Button variant="secondary" fullWidth onClick={() => navigate(PATIENT_PATHS.home)}>
          {t('patient:shared.backHome')}
        </Button>
      }
    />
  )
}

/**
 * The standing explanation of what Ausculta is.
 *
 * The validation protocol requires participants to be told the prototype is not
 * for diagnosis or treatment, and requires the interface not to contradict
 * that. This is that sentence, in the patient's own words, on the screen they
 * spend the most time on.
 */
export function WhatAuscultaDoes() {
  const { t } = usePatientTranslation()
  return (
    <Banner tone="info" title={t('patient:shared.aboutTitle')}>
      {t('patient:shared.aboutBody')}
    </Banner>
  )
}
