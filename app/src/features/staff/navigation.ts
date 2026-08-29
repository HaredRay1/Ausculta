import { ROLES, type Role } from '../../db/codes'

/**
 * Where each staff role can go.
 *
 * Four of the five roles had no cross-feature navigation at all: they landed
 * wherever the login redirect dropped them and could reach nothing else, and
 * none of them could sign out. On a shared clinic phone, where the normal case
 * is one person handing it to another, that is not a missing feature — it is
 * the app being unusable past the first screen.
 *
 * Every path here is a real mounted route. A nav item leading nowhere is worse
 * than no nav item, and this table is the one place to check that.
 */
export const MENU_PATH = '/menu'

export interface StaffNavEntry {
  id: string
  path: string
  labelKey: string
  /** Name of the icon in the design system's set. */
  icon:
    | 'PeopleIcon'
    | 'SettingsIcon'
    | 'InboxIcon'
    | 'LungsIcon'
    | 'WarningIcon'
    | 'QuestionIcon'
    | 'TrendIcon'
    | 'CheckCircleIcon'
    | 'ChipIcon'
    | 'MenuIcon'
}

/** The roles that get this shell. PATIENT has its own portal and is unaffected. */
export type StaffRole = Exclude<Role, typeof ROLES.PATIENT>

const MENU_ENTRY: StaffNavEntry = {
  id: 'menu',
  path: MENU_PATH,
  labelKey: 'staff:nav.menu',
  icon: 'MenuIcon',
}

/**
 * At most four destinations plus Menu, so every target clears 48px at 320px.
 * Anything that does not earn a tab lives behind Menu instead of being lost.
 */
export const STAFF_NAV: Record<StaffRole, readonly StaffNavEntry[]> = {
  [ROLES.ADMIN]: [
    { id: 'accounts', path: '/admin/users', labelKey: 'staff:nav.accounts', icon: 'PeopleIcon' },
    { id: 'settings', path: '/admin/config', labelKey: 'staff:nav.settings', icon: 'SettingsIcon' },
    { id: 'activity', path: '/admin/audit', labelKey: 'staff:nav.activity', icon: 'InboxIcon' },
    MENU_ENTRY,
  ],
  [ROLES.PRACTITIONER]: [
    { id: 'cases', path: '/review', labelKey: 'staff:nav.cases', icon: 'LungsIcon' },
    { id: 'patients', path: '/patients', labelKey: 'staff:nav.patients', icon: 'PeopleIcon' },
    { id: 'alerts', path: '/monitoring/alerts', labelKey: 'staff:nav.alerts', icon: 'WarningIcon' },
    MENU_ENTRY,
  ],
  [ROLES.HEALTH_WORKER]: [
    { id: 'patients', path: '/patients', labelKey: 'staff:nav.patients', icon: 'PeopleIcon' },
    { id: 'help', path: '/help', labelKey: 'staff:nav.help', icon: 'QuestionIcon' },
    MENU_ENTRY,
  ],
  [ROLES.RESEARCHER]: [
    { id: 'overview', path: '/research', labelKey: 'staff:nav.overview', icon: 'TrendIcon' },
    {
      id: 'labels',
      path: '/research/labels',
      labelKey: 'staff:nav.labels',
      icon: 'CheckCircleIcon',
    },
    {
      id: 'results',
      path: '/research/performance',
      labelKey: 'staff:nav.results',
      icon: 'ChipIcon',
    },
    MENU_ENTRY,
  ],
}

export function isStaffRole(role: Role | null | undefined): role is StaffRole {
  return role !== null && role !== undefined && role !== ROLES.PATIENT
}

/** Everything reachable from Menu that is not a tab, per role. */
export interface MenuLink {
  path: string
  labelKey: string
  roles?: readonly Role[]
}

export const MENU_LINKS: readonly MenuLink[] = [
  { path: '/help', labelKey: 'staff:menu.help' },
  { path: '/status', labelKey: 'staff:menu.status' },
  { path: '/demo', labelKey: 'staff:menu.demo' },
  { path: '/language', labelKey: 'staff:menu.language' },
  { path: '/admin/translations', labelKey: 'staff:menu.translations', roles: [ROLES.ADMIN] },
  { path: '/research/export', labelKey: 'staff:menu.export', roles: [ROLES.RESEARCHER] },
]
