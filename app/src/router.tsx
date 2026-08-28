import { Navigate, Route, Routes } from 'react-router-dom'
import { authRoutes } from './auth/routes'
import { RequireAuth } from './auth/guards'
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
    </Routes>
  )
}
