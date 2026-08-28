import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar,
  Banner,
  BottomNav,
  Button,
  FictionalDataBanner,
  ExerciseIcon,
  HomeIcon,
  LungsIcon,
  Page,
  PersonIcon,
  RefreshIcon,
  TrendIcon,
  Spinner,
  type BottomNavItem,
} from '../../../components'
import { usePatientTranslation } from '../i18n'
import { PATIENT_NAV, PATIENT_PATHS, type PatientNavId } from '../navigation'

/**
 * The frame every patient screen sits in.
 *
 * One component owns the app bar, the bottom navigation and the two banners
 * that must never be forgotten — the prototype disclaimer and the sample-data
 * label. Making them structural rather than per-screen is the same reasoning as
 * ResultCard's fixed wording: the safety furniture is exactly what gets dropped
 * for space on the next screen someone builds.
 */

const NAV_ICONS: Record<PatientNavId, ReactNode> = {
  home: <HomeIcon className="size-6" />,
  results: <LungsIcon className="size-6" />,
  trends: <TrendIcon className="size-6" />,
  history: <PersonIcon className="size-6" />,
  rehab: <ExerciseIcon className="size-6" />,
}

export interface PatientShellProps {
  /** Which bottom-nav entry is the current place. */
  activeId: PatientNavId
  title: string
  subtitle?: string
  /** Shows a back control. Omit on a top-level screen. */
  onBack?: () => void
  /** Labels this screen's content as invented, for the demo walkthrough. */
  fictional?: boolean
  children: ReactNode
}

export function PatientShell({
  activeId,
  title,
  subtitle,
  onBack,
  fictional = false,
  children,
}: PatientShellProps) {
  const { t } = usePatientTranslation()
  const navigate = useNavigate()

  const items: BottomNavItem[] = PATIENT_NAV.map((entry) => ({
    id: entry.id,
    label: t(`patient:nav.${entry.id}`),
    icon: NAV_ICONS[entry.id],
  }))

  return (
    <>
      <AppBar title={title} subtitle={subtitle} onBack={onBack} />
      <Page hasBottomNav>
        {fictional && <FictionalDataBanner />}
        {children}
      </Page>
      <BottomNav
        items={items}
        activeId={activeId}
        onSelect={(id) => navigate(PATIENT_PATHS[id as PatientNavId])}
        label={t('patient:nav.label')}
      />
    </>
  )
}

/** Sends the user back one screen, or to their home if there is nowhere back to. */
export function useGoBack(fallback: string = PATIENT_PATHS.home) {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (location.key === 'default') navigate(fallback)
    else navigate(-1)
  }
}

/** The waiting state, shown while the record is being read off the device. */
export function PatientLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10" aria-busy="true">
      <Spinner className="size-6" />
      <p className="text-base text-muted">{label}</p>
    </div>
  )
}

export interface PatientLoadErrorProps {
  onRetry: () => void
}

export function PatientLoadError({ onRetry }: PatientLoadErrorProps) {
  const { t } = usePatientTranslation()
  return (
    <Banner
      tone="danger"
      action={
        <Button variant="secondary" onClick={onRetry} iconStart={<RefreshIcon className="size-5" />}>
          {t('patient:shared.retry')}
        </Button>
      }
    >
      {t('patient:shared.loadError')}
    </Banner>
  )
}
