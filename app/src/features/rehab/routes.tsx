import type { RouteObject } from 'react-router-dom'
import { ActionPlanPage } from './pages/ActionPlanPage'
import { RedFlagsPage } from './pages/RedFlagsPage'
import { RehabHomePage } from './pages/RehabHomePage'
import { TechniqueDetailPage } from './pages/TechniqueDetailPage'
import { TechniquesPage } from './pages/TechniquesPage'
import { REHAB_PATHS, TECHNIQUE_ROUTE_PATTERN } from './navigation'

/**
 * The rehabilitation module's routes, as data for whoever owns the app router.
 *
 * This module is the integration seam and deliberately does not touch
 * `src/router.tsx` — it mirrors `src/auth/routes.tsx` and
 * `src/features/patient/routes.tsx` exactly. Consume it with
 * `useRoutes(rehabRoutes)` or by passing it to `createBrowserRouter`; to fold
 * it into an existing declarative `<Routes>` tree, map each entry to a
 * `<Route>`:
 *
 *     {rehabRoutes.map((route) => (
 *       <Route key={route.path} path={route.path} element={route.element} />
 *     ))}
 *
 * ## Why there is no role guard here
 *
 * The other feature route tables guard every entry, because they show a named
 * person's clinical records. These screens do not. `/rehab`, `/rehab/safety`
 * and `/rehab/techniques` are generic education — identical for every user,
 * personalised to nobody — and the safety screen in particular is the single
 * page in this app most worth reaching without a login: it is what to do during
 * an asthma attack.
 *
 * `/rehab/plan` reads a patient's own approved plan, but it reads it through
 * the signed-in session (`useRehabOverview` → `loadForUser`), so a visitor with
 * no session simply gets "your practitioner has not assigned a plan yet" — the
 * same screen as a patient who genuinely has no plan. There is nothing to
 * disclose. If the host router prefers these behind `<RequireAuth>`, wrapping
 * them changes no behaviour inside the feature.
 *
 * ## Mounting under the patient shell as well
 *
 * `features/patient/navigation.ts` already reserves `/patient/rehab` in the
 * patient bottom bar. That feature owns its own route table; it can point that
 * entry at `RehabHomePage`, which is exported from this feature's index, and
 * both paths then render the same screen. Nothing here needs to change for that
 * to work, and this table stays the canonical one.
 */
export const rehabRoutes: RouteObject[] = [
  { path: REHAB_PATHS.home, element: <RehabHomePage /> },
  // Safety is registered immediately after home: it is the destination that
  // must never be shadowed or lost in a merge.
  { path: REHAB_PATHS.safety, element: <RedFlagsPage /> },
  { path: REHAB_PATHS.plan, element: <ActionPlanPage /> },
  { path: REHAB_PATHS.techniques, element: <TechniquesPage /> },
  // After the list, so the literal segment is never shadowed by the parameter
  // whichever matcher the host router uses.
  { path: TECHNIQUE_ROUTE_PATTERN, element: <TechniqueDetailPage /> },
]

export default rehabRoutes
