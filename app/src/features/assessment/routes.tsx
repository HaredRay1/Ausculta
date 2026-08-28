import type { RouteObject } from 'react-router-dom'
import { RequireAuth } from '../../auth/guards'
import { AssessmentWizard } from './AssessmentWizard'

/**
 * The assessment flow's routes, as data for whoever owns the app router.
 *
 * The integration seam, mirroring `src/auth/routes.tsx`: this module does not
 * touch `src/router.tsx`. Consume it with `useRoutes(assessmentRoutes)`, pass
 * it to `createBrowserRouter`, or map each entry to a `<Route>` inside the
 * existing declarative tree — the same way `authRoutes` is consumed today.
 * Both entries must render inside an `<AuthProvider>`; the wizard reads the
 * signed-in user from it to stamp the assessment and the audit trail.
 *
 * `RequireAuth` rather than `RequireRole`. Recording a patient is the app's
 * core loop and every role handed the device reaches for it: the health worker
 * running a clinic session, the practitioner checking a position themselves,
 * and the patient testing at home, who the design system treats as the primary
 * unaided reader. A role gate here would lock out whichever of them happens to
 * be signed in, and the consequence — a screen that simply cannot be reached —
 * is worse than the one it would prevent.
 *
 * - `/assessment/new?patientId=PT-XXXX-XXXX` starts a new assessment. The
 *   patient is chosen upstream; without the parameter the first screen says so
 *   rather than inventing one.
 * - `/assessment/:assessmentId` resumes an assessment already on this device,
 *   landing on the position picker with the completed positions marked.
 */
export const assessmentRoutes: RouteObject[] = [
  {
    path: '/assessment/new',
    element: (
      <RequireAuth>
        <AssessmentWizard />
      </RequireAuth>
    ),
  },
  {
    path: '/assessment/:assessmentId',
    element: (
      <RequireAuth>
        <AssessmentWizard />
      </RequireAuth>
    ),
  },
]

export default assessmentRoutes
