import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BottomNav,
  CheckCircleIcon,
  ChipIcon,
  InboxIcon,
  LungsIcon,
  MenuIcon,
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
 * Staff navigation added around a screen that already has its own app bar.
 *
 * StaffShell is the shape to use for a new screen. This exists for the screens
 * that were built before any of this: they render their own `AppBar` and
 * `Page`, often across several return branches for loading, empty and error
 * states, and rewriting all of that under time pressure is how a working screen
 * becomes a broken one. Wrapping them at the route instead adds the navigation
 * without touching a line of their content.
 *
 * It reserves the bar's height itself rather than relying on the wrapped page
 * passing `hasBottomNav`, because those pages do not know they are inside a
 * frame — and content hidden behind a fixed bar is the defect this whole change
 * exists to fix, not one to reintroduce.
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

export function StaffNavFrame({ children }: { children: ReactNode }) {
  const { t } = useStaffTranslation()
  const { role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const entries: readonly StaffNavEntry[] = isStaffRole(role) ? STAFF_NAV[role] : []
  if (entries.length === 0) return <>{children}</>

  const items: BottomNavItem[] = entries.map((entry) => {
    const Icon = ICONS[entry.icon]
    return { id: entry.id, label: t(entry.labelKey), icon: <Icon className="size-6" /> }
  })

  // Longest path first, so /research/labels wins over /research.
  const activeId =
    [...entries]
      .sort((a, b) => b.path.length - a.path.length)
      .find(
        (entry) =>
          location.pathname === entry.path || location.pathname.startsWith(`${entry.path}/`),
      )?.id ?? ''

  return (
    <>
      <div
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + var(--size-bottom-nav))',
        }}
      >
        {children}
      </div>
      <BottomNav
        items={items}
        activeId={activeId}
        onSelect={(id) => {
          const target = entries.find((entry) => entry.id === id)
          if (target !== undefined) navigate(target.path)
        }}
        label={t('staff:nav.label')}
      />
    </>
  )
}
