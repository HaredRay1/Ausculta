import type { RouteObject } from 'react-router-dom'
import { ROLES } from '../../db/codes'
import { RequireAuth, RequireRole } from '../../auth/guards'
import { PatientDetailPage } from './PatientDetailPage'
import { PatientListPage } from './PatientListPage'
import { PatientRegistrationPage } from './PatientRegistrationPage'

/**
 * The patients feature's routes, as data for whoever owns the app router.
 *
 * This module is the integration seam and deliberately does not touch
 * `src/router.tsx`. Consume with `useRoutes(patientRoutes)` or by passing it to
 * `createBrowserRouter`; to fold into an existing declarative `<Routes>` tree,
 * map each entry to a `<Route>`.
 *
 * Whatever wires these up must render them inside an `<AuthProvider>` — every
 * screen here reads the session from it.
 *
 * Each route carries its own guard, so protection travels with the route
 * rather than depending on the host router remembering to add it. `/patients`
 * and `/patients/:patientId` are open to any signed-in user because the
 * repository scopes what they can actually see by role — a patient reaching
 * `/patients` gets their own record and nothing else. Registration is
 * restricted at the route, because it is a write and there is no per-record
 * scoping to fall back on.
 *
 * `/patients/new` is declared before `/patients/:patientId` so "new" is never
 * swallowed as a patient id.
 */
export const patientRoutes: RouteObject[] = [
  {
    path: '/patients',
    element: (
      <RequireAuth>
        <PatientListPage />
      </RequireAuth>
    ),
  },
  {
    path: '/patients/new',
    element: (
      <RequireRole roles={[ROLES.HEALTH_WORKER, ROLES.PRACTITIONER, ROLES.ADMIN]}>
        <PatientRegistrationPage />
      </RequireRole>
    ),
  },
  {
    path: '/patients/:patientId',
    element: (
      <RequireAuth>
        <PatientDetailPage />
      </RequireAuth>
    ),
  },
]

export default patientRoutes
