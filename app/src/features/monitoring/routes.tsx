import type { RouteObject } from 'react-router-dom'
import { ROLES } from '../../db/codes'
import { RequireAuth, RequireRole } from '../../auth/guards'
import { AlertsPage } from './AlertsPage'
import { MonitoringPlanPage } from './MonitoringPlanPage'
import { TrendsPage } from './TrendsPage'

/**
 * The monitoring feature's routes, as data for whoever owns the app router.
 *
 * This module is the integration seam and deliberately does not touch
 * `src/router.tsx`. Consume with `useRoutes(monitoringRoutes)` or by passing it
 * to `createBrowserRouter`; to fold into an existing declarative `<Routes>`
 * tree, map each entry to a `<Route>`. They must render inside an
 * `<AuthProvider>`.
 *
 * Guarding differs per route, deliberately:
 *
 * - `/monitoring/alerts` is practitioner-only. Adjudicating an alert is a
 *   clinical act, so the check belongs at the door, as with the review queue.
 * - `/monitoring/plan/:patientId` and `/monitoring/trends/:patientId` are
 *   RequireAuth, because a health worker legitimately needs to see the plan
 *   they are being asked to follow and a patient needs to see what is expected
 *   of them. The repository scopes what each role can actually read, and the
 *   plan screen only renders the editing form for a practitioner or admin.
 *
 * `/monitoring/alerts` is declared before the parameterised routes so it can
 * never be captured as a patient id.
 */
const REVIEWER_ROLES = [ROLES.PRACTITIONER, ROLES.ADMIN]

export const monitoringRoutes: RouteObject[] = [
  {
    path: '/monitoring/alerts',
    element: (
      <RequireRole roles={REVIEWER_ROLES}>
        <AlertsPage />
      </RequireRole>
    ),
  },
  {
    path: '/monitoring/plan/:patientId',
    element: (
      <RequireAuth>
        <MonitoringPlanPage />
      </RequireAuth>
    ),
  },
  {
    path: '/monitoring/trends/:patientId',
    element: (
      <RequireAuth>
        <TrendsPage />
      </RequireAuth>
    ),
  },
]

export default monitoringRoutes
