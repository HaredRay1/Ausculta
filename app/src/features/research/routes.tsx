import { StaffNavFrame } from '../staff/StaffNavFrame'
import type { RouteObject } from 'react-router-dom'
import { ROLES } from '../../db/codes'
import { RequireRole } from '../../auth/guards'
import { ExportPage } from './pages/ExportPage'
import { LabellingPage } from './pages/LabellingPage'
import { PerformancePage } from './pages/PerformancePage'
import { ResearchDashboardPage } from './pages/ResearchDashboardPage'

/**
 * The researcher module's routes, as data for whoever owns the app router.
 *
 * Mirrors `src/auth/routes.tsx`: this module is the integration seam and does
 * not touch `src/router.tsx`. Consume with `useRoutes(researchRoutes)` or pass
 * to `createBrowserRouter`; to fold into a declarative `<Routes>` tree, map
 * each entry to a `<Route>`.
 *
 * Every route carries its own `<RequireRole>` so the guard travels with the
 * route rather than depending on the host router remembering to add it. That
 * matters more here than elsewhere: these screens read across every patient on
 * the device, and the export screen writes a file to disk.
 *
 * Whatever wires these must render them inside an `<AuthProvider>`.
 */
const RESEARCH_ROLES = [ROLES.RESEARCHER, ROLES.ADMIN]

function guarded(element: React.ReactNode) {
  return (
    <RequireRole roles={RESEARCH_ROLES}>
      <StaffNavFrame>{element}</StaffNavFrame>
    </RequireRole>
  )
}

export const researchRoutes: RouteObject[] = [
  { path: '/research', element: guarded(<ResearchDashboardPage />) },
  { path: '/research/labels', element: guarded(<LabellingPage />) },
  { path: '/research/performance', element: guarded(<PerformancePage />) },
  { path: '/research/export', element: guarded(<ExportPage />) },
]

export default researchRoutes
