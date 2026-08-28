import type { RouteObject } from 'react-router-dom'
import { DemoSettingsPage } from './pages/DemoSettingsPage'

/**
 * The demo layer's routes, as data for whoever owns the app router.
 *
 * Mirrors `src/auth/routes.tsx`: this module is the integration seam and
 * deliberately does not touch `src/router.tsx`. Consume it with
 * `useRoutes(demoRoutes)` or by passing it to `createBrowserRouter`; to fold it
 * into an existing declarative `<Routes>` tree, map each entry to a `<Route>`.
 *
 * No role guard. Demo mode is how a validator or a trainer makes the app
 * navigable at all, and a device that has not finished admin setup still needs
 * to reach this screen. Nothing here exposes real clinical data — the screen
 * only ever loads, shows or deletes records that are already marked fictional.
 *
 * Worth linking from settings as well as routing: the seed control is the
 * difference between a populated app and an empty one, and someone who has not
 * read the code will not guess the URL.
 */
export const demoRoutes: RouteObject[] = [{ path: '/demo', element: <DemoSettingsPage /> }]

export default demoRoutes
