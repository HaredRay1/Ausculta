import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { DisclaimerBanner } from '../../components/DisclaimerBanner'

export function Landing() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-between gap-8 bg-white px-6 py-12">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-4xl font-bold uppercase tracking-widest text-teal-900">
          {t('appName')}
        </h1>
        <p className="text-lg text-slate-600">{t('tagline')}</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-4">
        <DisclaimerBanner i18nKey="common:disclaimer" />

        <button
          type="button"
          onClick={() => navigate('/login')}
          className="w-full rounded-xl bg-teal-700 px-6 py-4 text-lg font-medium text-white shadow-sm active:bg-teal-800"
        >
          {t('getStarted')}
        </button>

        <Link to="/language" className="text-center text-sm text-teal-700 underline">
          {t('changeLanguage')}
        </Link>
      </div>
    </main>
  )
}
