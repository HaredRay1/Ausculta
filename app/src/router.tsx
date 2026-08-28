import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { authRoutes } from './auth/routes'
import { RequireAuth } from './auth/guards'
import { assessmentRoutes } from './features/assessment/routes'
import { demoRoutes } from './features/demo'
// Two different features, deliberately named apart: `features/patient` (singular)
// is the patient's own portal; `features/patients` (plural) is clinician-facing
// patient management. Both export `patientRoutes`, hence the alias.
import { patientRoutes as patientPortalRoutes } from './features/patient/routes'
import { patientRoutes as patientManagementRoutes } from './features/patients/routes'
import { getStoredDeviceLanguage } from './lib/deviceLanguage'
import { LanguageSelect } from './features/landing/LanguageSelect'
import { Landing } from './features/landing/Landing'
import { RoleHomePlaceholder } from './features/placeholders/RoleHomePlaceholder'
import { SystemStatusPage } from './features/status/SystemStatusPage'

/** `/` redirects to `/language` (no device language chosen yet) or `/landing`. */
function Root() {
  const hasChosenLanguage = getStoredDeviceLanguage() !== null
  return <Navigate to={hasChosenLanguage ? '/landing' : '/language'} replace />
}

/**
 * Role homes that still have no real dashboard. `/patient` is deliberately
 * absent — the patient portal now provides it — and `/admin/users` comes from
 * the auth routes.
 */
const ROLE_HOME_ROUTES = ['/practitioner', '/health-worker', '/researcher']

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
      {/* Unguarded on purpose: a validator must be able to see what is real
          before signing in, and it contains no patient data. */}
      <Route path="/status" element={<SystemStatusPage />} />

      {/* Each feature owns its own guards; the router only mounts them. */}
      {authRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}

      {/*
        Order is load-bearing here: `/patients/new` must be declared before
        `/patients/:patientId` or "new" is swallowed as an id. The source array
        is already in that order — preserve it.
      */}
      {patientManagementRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}

      {patientPortalRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}

      {assessmentRoutes.map((route) => (
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
