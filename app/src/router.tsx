import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { authRoutes } from './auth/routes'
import { RequireAuth } from './auth/guards'
import { demoRoutes } from './features/demo'
import { patientRoutes } from './features/patients/routes'
import { getStoredDeviceLanguage } from './lib/deviceLanguage'
import { LanguageSelect } from './features/landing/LanguageSelect'
import { Landing } from './features/landing/Landing'
import { RoleHomePlaceholder } from './features/placeholders/RoleHomePlaceholder'

/** `/` redirects to `/language` (no device language chosen yet) or `/landing`. */
function Root() {
  const hasChosenLanguage = getStoredDeviceLanguage() !== null
  return <Navigate to={hasChosenLanguage ? '/landing' : '/language'} replace />
}

/**
 * Per-role landing routes that `roleHomePath()` sends users to after login.
 * `/admin/users` is a real screen and comes from `authRoutes`; the other four
 * are placeholders until their dashboards are built.
 */
const ROLE_HOME_ROUTES = ['/patient', '/practitioner', '/health-worker', '/researcher']

/**
 * The component gallery renders every design-system component in every state.
 * It is a development aid, not a product screen, so it is lazy-loaded — that
 * keeps it out of the initial bundle a clinic phone downloads.
 */
const Gallery = lazy(async () => ({ default: (await import('./design/Gallery')).Gallery }))

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/language" element={<LanguageSelect />} />
      <Route path="/landing" element={<Landing />} />

      {/* Auth layer's own routes, carrying their own guards where needed. */}
      {authRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}

      {/*
        Patient management. Order is load-bearing: `/patients/new` must be
        declared before `/patients/:patientId` or "new" is swallowed as an id.
        The source array is already in that order — preserve it.
      */}
      {patientRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}

      {/*
        Deliberately unguarded: a device that has not finished admin setup still
        needs to reach the seed control, and the screen only ever touches records
        already marked fictional.
      */}
      {demoRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}

      {ROLE_HOME_ROUTES.map((path) => (
        <Route
          key={path}
          path={path}
          element={
            <RequireAuth>
              <RoleHomePlaceholder />
            </RequireAuth>
          }
        />
      ))}

      <Route
        path="/design-gallery"
        element={
          <Suspense fallback={null}>
            <Gallery />
          </Suspense>
        }
      />
    </Routes>
  )
}
