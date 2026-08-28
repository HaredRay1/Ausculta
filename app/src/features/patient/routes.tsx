import type { RouteObject } from 'react-router-dom'
import { RequireRole } from '../../auth/guards'
import { ROLES } from '../../db/codes'
import { PATIENT_NAV, PATIENT_PATHS, type PatientNavEntry } from './navigation'
import { PatientHomePage } from './pages/PatientHomePage'
import { PatientHistoryPage } from './pages/PatientHistoryPage'
import { RecordingsPage } from './pages/RecordingsPage'
import { RehabPage } from './pages/RehabPage'
import { ResultDetailPage } from './pages/ResultDetailPage'
import { ResultsListPage } from './pages/ResultsListPage'
import { TrendsPage } from './pages/TrendsPage'

/**
 * The patient experience's routes, as data for whoever owns the app router.
 *
 * This module is the integration seam and deliberately does not touch
 * `src/router.tsx` — it mirrors `src/auth/routes.tsx` exactly. Consume it with
 * `useRoutes(patientRoutes)` or by passing it to `createBrowserRouter`; to fold
 * it into the existing declarative `<Routes>` tree, map each entry to a
 * `<Route>`:
 *
 *     {patientRoutes.map((route) => (
 *       <Route key={route.path} path={route.path} element={route.element} />
 *     ))}
 *
 * `/patient` replaces the RoleHomePlaceholder entry for the patient role; the
 * other six paths are new. Whatever wires these up must render them inside an
 * `<AuthProvider>` — every screen reads the session from it to find the patient
 * record linked to the signed-in account.
 *
 * Every route carries its own `<RequireRole>` so the guard travels with the
 * route rather than depending on the host router remembering to add it. These
 * are a person's own clinical records; an unguarded one is a disclosure bug,
 * not a routing bug.
 */
function patientOnly(element: React.ReactNode) {
  return <RequireRole roles={[ROLES.PATIENT]}>{element}</RequireRole>
}

export const patientRoutes: RouteObject[] = [
  { path: PATIENT_PATHS.home, element: patientOnly(<PatientHomePage />) },
  { path: PATIENT_PATHS.results, element: patientOnly(<ResultsListPage />) },
  // Registered after the list so the literal segment is never shadowed by the
  // parameter, whichever matcher the host router uses.
  {
    path: `${PATIENT_PATHS.results}/:assessmentId`,
    element: patientOnly(<ResultDetailPage />),
  },
  { path: PATIENT_PATHS.recordings, element: patientOnly(<RecordingsPage />) },
  { path: PATIENT_PATHS.trends, element: patientOnly(<TrendsPage />) },
  { path: PATIENT_PATHS.history, element: patientOnly(<PatientHistoryPage />) },
  { path: PATIENT_PATHS.rehab, element: patientOnly(<RehabPage />) },
]

/**
 * The bottom-navigation entries for the patient shell.
 *
 * Exported as data — id, path and translation key, with no icon and no
 * component — so the host shell can render them however it renders navigation,
 * and so this list can be asserted against the route table without mounting
 * React. Resolve `labelKey` through `useTranslation('patient')`.
 *
 * At most five, which is the BottomNav ceiling.
 */
export const patientNavItems: readonly PatientNavEntry[] = PATIENT_NAV

export default patientRoutes
