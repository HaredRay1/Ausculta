import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'
import { Banner, Button } from '../../components'

/**
 * Stand-in for a role's dashboard until that phase builds the real one.
 *
 * `roleHomePath()` sends every signed-in user to a per-role home, so without
 * these the app would route a successful login to a path no route matches and
 * render a blank page. Each real dashboard replaces its own entry in the
 * router; this file disappears once the last one lands.
 */
export function RoleHomePlaceholder() {
  const { t } = useTranslation('common')
  const { user, logout } = useAuth()

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-surface p-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-on-surface">{t('appName')}</h1>
        <p className="mt-1 text-muted">{t('signedInAs', { name: user?.name ?? '' })}</p>
      </div>

      <Banner tone="info">{t('dashboardComingSoon')}</Banner>

      <Button variant="secondary" onClick={() => void logout()}>
        {t('signOut')}
      </Button>
    </main>
  )
}
