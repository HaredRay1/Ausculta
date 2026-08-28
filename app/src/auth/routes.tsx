import type { RouteObject } from 'react-router-dom'
import { ROLES } from '../db/codes'
import { UsersPage } from '../features/admin/UsersPage'
import { RequireRole } from './guards'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { SetupAdminPage } from './pages/SetupAdminPage'

/**
 * The auth layer's routes, as data for whoever owns the app router.
 *
 * This module is the integration seam and deliberately does not touch
 * `src/router.tsx`. Consume it with `useRoutes(authRoutes)` or by passing it
 * to `createBrowserRouter`; to fold it into the existing declarative
 * `<Routes>` tree, map each entry to a `<Route>`.
 *
 * Whatever wires these up must render them inside an `<AuthProvider>` (see
 * AuthContext.tsx) — every screen here reads the session from it.
 *
 * `/admin/users` carries its own `<RequireRole>` so the guard travels with the
 * route rather than depending on the host router remembering to add it.
 */
export const authRoutes: RouteObject[] = [
  { path: '/setup-admin', element: <SetupAdminPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/admin/users',
    element: (
      <RequireRole roles={[ROLES.ADMIN]}>
        <UsersPage />
      </RequireRole>
    ),
  },
]

export default authRoutes
