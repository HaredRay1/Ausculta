import type { RouteObject } from 'react-router-dom'
import { ROLES } from '../../db/codes'
import { RequireRole } from '../../auth/guards'
import { AuditLogPage } from './AuditLogPage'
import { ConfigPage } from './ConfigPage'
import { TranslationsPage } from './TranslationsPage'
import { UsersPage } from './UsersPage'

/**
 * The administration console's routes, as data for whoever owns the app router.
 *
 * This module is the integration seam and deliberately does not touch
 * `src/router.tsx` — it mirrors `auth/routes.tsx` and `features/patient/routes.tsx`
 * exactly. Consume with `useRoutes(adminRoutes)` or by passing it to
 * `createBrowserRouter`; to fold it into the existing declarative `<Routes>`
 * tree, map each entry to a `<Route>`:
 *
 *     {adminRoutes.map((route) => (
 *       <Route key={route.path} path={route.path} element={route.element} />
 *     ))}
 *
 * `/admin/users` is ALREADY mounted from `auth/routes.tsx` and is repeated here
 * so this table is the console's complete description. Mount one or the other,
 * not both — react-router takes the first match, so a duplicate is harmless but
 * misleading. The auth entry is the one to drop if you mount this table.
 *
 * Every route is ADMIN-only. These screens expose the accountability record and
 * the settings that clinical results are stamped against; there is no partial
 * view of them that makes sense for another role.
 */
const ADMIN_ONLY = [ROLES.ADMIN]

export const adminRoutes: RouteObject[] = [
  {
    path: '/admin/users',
    element: (
      <RequireRole roles={ADMIN_ONLY}>
        <UsersPage />
      </RequireRole>
    ),
  },
  {
    path: '/admin/config',
    element: (
      <RequireRole roles={ADMIN_ONLY}>
        <ConfigPage />
      </RequireRole>
    ),
  },
  {
    path: '/admin/audit',
    element: (
      <RequireRole roles={ADMIN_ONLY}>
        <AuditLogPage />
      </RequireRole>
    ),
  },
  {
    path: '/admin/translations',
    element: (
      <RequireRole roles={ADMIN_ONLY}>
        <TranslationsPage />
      </RequireRole>
    ),
  },
]

export default adminRoutes
