import { StaffNavFrame } from '../staff/StaffNavFrame'
import type { RouteObject } from 'react-router-dom'
import { ROLES } from '../../db/codes'
import { RequireRole } from '../../auth/guards'
import { ClinicalViewPage } from './ClinicalViewPage'
import { ReviewQueuePage } from './ReviewQueuePage'
import { ReviewFormPage } from './ReviewFormPage'
import { ReportPage } from './ReportPage'

/**
 * The review feature's routes, as data for whoever owns the app router.
 *
 * This module is the integration seam and deliberately does not touch
 * `src/router.tsx`. Consume with `useRoutes(reviewRoutes)` or by passing it to
 * `createBrowserRouter`; to fold into an existing declarative `<Routes>` tree,
 * map each entry to a `<Route>`.
 *
 * Whatever wires these up must render them inside an `<AuthProvider>`.
 *
 * Every route is role-guarded rather than relying on data scoping alone. That
 * differs from the patients feature on purpose: there, a patient reaching the
 * list has a legitimate view of their own record, so the repository scopes it.
 * Here there is no such thing as a patient's own view of the review workflow —
 * adjudicating an AI result is a clinical act — so the role check belongs at
 * the door.
 *
 * `/review/:assessmentId/decide` and `/review/:assessmentId/report` are
 * declared before `/review/:assessmentId` so the bare case route cannot
 * swallow them.
 */
const REVIEWER_ROLES = [ROLES.PRACTITIONER, ROLES.ADMIN]

export const reviewRoutes: RouteObject[] = [
  {
    path: '/review',
    element: (
      <RequireRole roles={REVIEWER_ROLES}>
        <StaffNavFrame><ReviewQueuePage /></StaffNavFrame>
      </RequireRole>
    ),
  },
  {
    path: '/review/:assessmentId/decide',
    element: (
      <RequireRole roles={REVIEWER_ROLES}>
        <StaffNavFrame><ReviewFormPage /></StaffNavFrame>
      </RequireRole>
    ),
  },
  {
    path: '/review/:assessmentId/report',
    element: (
      <RequireRole roles={REVIEWER_ROLES}>
        <StaffNavFrame><ReportPage /></StaffNavFrame>
      </RequireRole>
    ),
  },
  {
    path: '/review/:assessmentId',
    element: (
      <RequireRole roles={REVIEWER_ROLES}>
        <StaffNavFrame><ClinicalViewPage /></StaffNavFrame>
      </RequireRole>
    ),
  },
]

export default reviewRoutes
