import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ROLES, type Role } from '../db/codes'
import { useAuth } from './AuthContext'
import { useAuthTranslation } from './i18n'

/** Where an unauthenticated visitor is always sent. */
export const LOGIN_PATH = '/login'

/**
 * The landing route for each role.
 *
 * Kept as one exported map so the rest of the app has a single place to
 * change if a role's home moves. Only `/admin/users` is owned by this feature;
 * the others are the agreed landing paths for screens built elsewhere.
 */
export const ROLE_HOME_PATHS: Record<Role, string> = {
  [ROLES.ADMIN]: '/admin/users',
  // Real screens, not the placeholders these used to point at: signing in and
  // landing on "your dashboard is still being built" is a dead end for three
  // of the five roles.
  [ROLES.PRACTITIONER]: '/review',
  [ROLES.HEALTH_WORKER]: '/patients',
  [ROLES.RESEARCHER]: '/research',
  [ROLES.PATIENT]: '/patient',
}

/** The home route for `role`, or the login screen when there is no role. */
export function roleHomePath(role: Role | null | undefined): string {
  if (role === null || role === undefined) return LOGIN_PATH
  return ROLE_HOME_PATHS[role] ?? LOGIN_PATH
}

function CheckingSession() {
  const { t } = useAuthTranslation()
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-surface-raised px-6 text-center"
      aria-busy="true"
    >
      <p className="text-lg text-muted">{t('guard.checking')}</p>
    </main>
  )
}

function NotAuthorised() {
  const { t } = useAuthTranslation()
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-raised px-6 text-center">
      <p className="text-lg font-medium text-on-surface">{t('error.NOT_AUTHORISED')}</p>
    </main>
  )
}

export interface GuardProps {
  /** Omit to guard a nested route tree via `<Outlet />` instead. */
  children?: ReactNode
}

/**
 * Requires any signed-in user.
 *
 * Renders a waiting state — not a redirect — while the persisted session is
 * still being read. Bouncing to `/login` first and back on restore would make
 * every cold start of the installed PWA flash the login screen.
 */
export function RequireAuth({ children }: GuardProps) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <CheckingSession />
  if (user === null) return <Navigate to={LOGIN_PATH} replace state={{ from: location }} />
  return <>{children ?? <Outlet />}</>
}

export interface RequireRoleProps extends GuardProps {
  roles: readonly Role[]
}

/**
 * Requires a signed-in user holding one of `roles`.
 *
 * An unauthenticated visitor goes to `/login`; a signed-in user with the wrong
 * role goes to their own role's home rather than to an error page, because on
 * a shared clinic device the common cause is a stale link or a back button,
 * not an attack.
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <CheckingSession />
  if (user === null) return <Navigate to={LOGIN_PATH} replace state={{ from: location }} />

  if (!roles.includes(user.role)) {
    const home = roleHomePath(user.role)
    // If this role's own home is the route being denied, redirecting there
    // would loop forever. Say so plainly instead.
    if (home === location.pathname) return <NotAuthorised />
    return <Navigate to={home} replace />
  }

  return <>{children ?? <Outlet />}</>
}
