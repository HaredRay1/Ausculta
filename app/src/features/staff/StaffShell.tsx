import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar,
  BottomNav,
  CheckCircleIcon,
  ChipIcon,
  InboxIcon,
  LungsIcon,
  MenuIcon,
  Page,
  PeopleIcon,
  QuestionIcon,
  SettingsIcon,
  TrendIcon,
  WarningIcon,
  type BottomNavItem,
  type IconComponent,
} from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { useStaffTranslation } from './i18n'
import { STAFF_NAV, isStaffRole, type StaffNavEntry } from './navigation'

/**
 * The frame every staff screen sits in.
 *
 * The patient portal has had a bottom navigation since it was built. Every
 * other role had nothing: an admin who finished first-run setup landed on the
 * accounts queue with no way to reach any other screen and no way to sign out,
 * which is where the owner stopped being able to use the app at all. A
 * practitioner could not get from a case to a patient; nobody but a patient
 * could hand the phone to a colleague.
 *
 * So this is deliberately the same shape as PatientShell rather than a new
 * idea. Four destinations at most plus Menu, so every target still clears 48px
 * at 320px, and anything that does not earn a tab is behind Menu rather than
 * unreachable.
 */

const ICONS: Record<StaffNavEntry['icon'], IconComponent> = {
  PeopleIcon,
  SettingsIcon,
  InboxIcon,
  LungsIcon,
  WarningIcon,
  QuestionIcon,
  TrendIcon,
  CheckCircleIcon,
  ChipIcon,
  MenuIcon,
}

export interface StaffShellProps {
  /** Which nav entry is the current place. Omit on a screen that is not one. */
  activeId?: string
  title: string
  subtitle?: string
  /** Shows a back control. Omit on a destination the nav leads to. */
  onBack?: () => void
  /** A single trailing control in the app bar. */
  action?: ReactNode
  children: ReactNode
}

export function StaffShell({
  activeId,
  title,
  subtitle,
  onBack,
  action,
  children,
}: StaffShellProps) {
  const { t } = useStaffTranslation()
  const { role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // A patient reaching a staff screen is a routing accident the guards catch;
  // rendering a staff nav for them would be worse than rendering none.
  const entries: readonly StaffNavEntry[] = isStaffRole(role) ? STAFF_NAV[role] : []

  const items: BottomNavItem[] = entries.map((entry) => {
    const Icon = ICONS[entry.icon]
    return { id: entry.id, label: t(entry.labelKey), icon: <Icon className="size-6" /> }
  })

  /**
   * Falls back to whichever entry matches the current URL.
   *
   * A screen that forgets to pass `activeId` still highlights correctly rather
   * than showing a nav with nothing marked, which reads as "you are nowhere".
   */
  const current =
    activeId ??
    entries.find(
      (entry) => location.pathname === entry.path || location.pathname.startsWith(`${entry.path}/`),
    )?.id ??
    ''

  return (
    <>
      <AppBar title={title} subtitle={subtitle} onBack={onBack} action={action} />
      <Page hasBottomNav={items.length > 0}>{children}</Page>
      {items.length > 0 && (
        <BottomNav
          items={items}
          activeId={current}
          onSelect={(id) => {
            const target = entries.find((entry) => entry.id === id)
            if (target !== undefined) navigate(target.path)
          }}
          label={t('staff:nav.label')}
        />
      )}
    </>
  )
}
