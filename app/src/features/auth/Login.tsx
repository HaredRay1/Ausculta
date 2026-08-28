import { useTranslation } from 'react-i18next'

/**
 * Placeholder — the real login/auth flow lands in Phase 3 (RBAC).
 */
export function Login() {
  const { t } = useTranslation('common')

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-white px-6 text-center">
      <h1 className="text-xl font-semibold text-teal-900">{t('loginPlaceholder')}</h1>
    </main>
  )
}
