import { Navigate, Route, Routes } from 'react-router-dom'
import { getStoredDeviceLanguage } from './lib/deviceLanguage'
import { LanguageSelect } from './features/landing/LanguageSelect'
import { Landing } from './features/landing/Landing'
import { Login } from './features/auth/Login'

/** `/` redirects to `/language` (no device language chosen yet) or `/landing`. */
function Root() {
  const hasChosenLanguage = getStoredDeviceLanguage() !== null
  return <Navigate to={hasChosenLanguage ? '/landing' : '/language'} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/language" element={<LanguageSelect />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />
    </Routes>
  )
}
