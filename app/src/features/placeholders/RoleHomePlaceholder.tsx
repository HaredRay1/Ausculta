import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthContext'

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t('appName')}</h1>
        <p className="mt-1 text-slate-600">{t('signedInAs', { name: user?.name ?? '' })}</p>
      </div>
      <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-700">
        {t('dashboardComingSoon')}
      </p>
      <button
        type="button"
        onClick={() => void logout()}
        className="rounded-lg border border-slate-300 px-4 py-3 text-slate-900"
      >
        {t('signOut')}
      </button>
    </main>
  )
}
