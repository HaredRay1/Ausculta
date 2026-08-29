import type { RouteObject } from 'react-router-dom'
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
 * These three are the pre-authentication screens. `/admin/users` used to live
 * here too; it moved to `features/admin/routes.tsx`, because the account queue
 * belongs to the administration console rather than to authentication, and one
 * table describing the whole console beats the path being declared in two.
 */
export const authRoutes: RouteObject[] = [
  { path: '/setup-admin', element: <SetupAdminPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
]

export default authRoutes
