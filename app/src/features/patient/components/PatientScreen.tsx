import { useCallback, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner, Button, EmptyState, InfoIcon } from '../../../components'
import { isExampleRecordShown, setExampleRecordShown } from '../data/examplePreview'
import { ExampleCopyProvider } from './ExampleCopy'
import { usePatientOverview } from '../data/usePatientOverview'
import type { LoadedPatientOverview, PatientRepository } from '../data/patientRepository'
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
  /** Only ever called once a patient record is loaded — see LoadedPatientOverview. */
  children: (overview: LoadedPatientOverview) => ReactNode
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
  // Reading a demonstration record is a choice the user makes, not something
  // the app does for them when their own record is missing.
  const [showExample, setShowExample] = useState(isExampleRecordShown)
  const chooseExample = useCallback((shown: boolean) => {
    setExampleRecordShown(shown)
    setShowExample(shown)
  }, [])

  const { overview, isLoading, error, reload } = usePatientOverview({
    ...(repository !== undefined && { repository }),
    example: showExample,
  })

  const heading = title ?? t(`patient:nav.${activeId}`)
  /**
   * `compactFictionalLabel` is an argument rather than something read from
   * `overview`, so the pill can only ever appear in a tree that also renders
   * the demo-preview panel below it.
   *
   * Keying it off `source === 'demo-preview'` up here would look equivalent and
   * is not: `frame` also wraps the loading, error and no-record branches, none
   * of which render that panel. In those the shortened label would be the only
   * thing on screen saying the data is invented, which is the one outcome this
   * change must not produce.
   */
  const frame = (content: ReactNode, compactFictionalLabel = false) => (
    <PatientShell
      activeId={activeId}
      title={heading}
      fictional={overview.isFictional}
      compactFictionalLabel={compactFictionalLabel}
      {...(subtitle !== undefined && { subtitle })}
      {...(onBack !== undefined && { onBack })}
    >
      {content}
    </PatientShell>
  )

  if (isLoading) return frame(<PatientLoading label={t('patient:shared.loading')} />)
  if (error !== null) return frame(<PatientLoadError onRetry={reload} />)

  const { patient } = overview
  if (patient === null) {
    // Either nothing is linked, or the user asked for an example and the
    // device has no seeded data. Both are the same honest state.
    return frame(
      <NoLinkedRecord
        onSeeExample={() => chooseExample(true)}
        // On the home screen the 'back to my health' button would navigate to
        // the screen it is already on. That is the first thing a brand-new
        // account sees, so a control that visibly does nothing is the worst
        // possible place for one.
        showBackHome={activeId !== 'home'}
      />,
    )
  }
  const loaded: LoadedPatientOverview = { ...overview, patient }

  // The one branch that renders the demo-preview panel, and therefore the only
  // one allowed to shorten the label above it. Same expression, one line apart,
  // on purpose: if the panel ever stops rendering here the pill goes with it.
  const showsPreviewNotice = overview.source === 'demo-preview'

  return frame(
    <>
      {showsPreviewNotice && (
        <Banner
          tone="info"
          title={t('patient:shared.demoPreview.title')}
          action={
            <Button size="sm" variant="ghost" onClick={() => chooseExample(false)}>
              {t('patient:shared.demoPreview.stop')}
            </Button>
          }
        >
          {/* Names whose example it is. "Sample data" alone still leaves a
              reader wondering why an unfamiliar name is on their screen. */}
          {t('patient:shared.demoPreview.bodyNamed', { name: patient.name })}
        </Banner>
      )}
      {/*
        The portal speaks in the second person -- "your breathing sounds",
        "places on your chest". That is right for someone reading their own
        record and a false statement over an example, so the copy switches to
        third person underneath here rather than every screen threading a flag
        through every string.
      */}
      <ExampleCopyProvider example={overview.isFictional}>{children(loaded)}</ExampleCopyProvider>
    </>,
    showsPreviewNotice,
  )
}

/**
 * No patient record is linked to this account.
 *
 * Deliberately not an error and not a dead end: it says why, says who fixes it,
 * and still offers somewhere to go — the plain-language explanation of what the
 * app is for, which is useful to read while waiting to be registered.
 */
export function NoLinkedRecord({
  onSeeExample,
  showBackHome = true,
}: { onSeeExample?: () => void; showBackHome?: boolean } = {}) {
  const { t } = usePatientTranslation()
  const navigate = useNavigate()

  return (
    <EmptyState
      title={t('patient:shared.noRecord.title')}
      body={t('patient:shared.noRecord.body')}
      icon={<InfoIcon className="size-10" />}
      action={
        <div className="flex w-full flex-col gap-3">
          {/* The replacement for the substitution that used to happen
              silently. A validator with no record still has something to
              navigate — they just have to ask for it, and it never arrives
              wearing their name. */}
          {onSeeExample !== undefined && (
            <Button fullWidth onClick={onSeeExample}>
              {t('patient:shared.noRecord.seeExample')}
            </Button>
          )}
          {showBackHome && (
            <Button variant="secondary" fullWidth onClick={() => navigate(PATIENT_PATHS.home)}>
              {t('patient:shared.backHome')}
            </Button>
          )}
        </div>
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
