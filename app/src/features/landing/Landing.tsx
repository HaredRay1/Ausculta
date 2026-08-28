import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Button, DisclaimerBanner, LungsIcon } from '../../components'

export function Landing() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-between gap-8 bg-surface px-6 py-12">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <LungsIcon className="h-14 w-14 text-primary" />
        <h1 className="text-4xl font-bold uppercase tracking-widest text-on-surface">
          {t('appName')}
        </h1>
        <p className="text-lg text-muted">{t('tagline')}</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-4">
        <DisclaimerBanner i18nKey="common:disclaimer" />

        <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/login')}>
          {t('getStarted')}
        </Button>

        <div className="flex flex-col items-center gap-2">
          <Link to="/language" className="text-sm text-primary underline">
            {t('changeLanguage')}
          </Link>
          {/*
            Demo data normally seeds itself on first launch. This link is the
            recovery path when it did not — an empty app with no visible way to
            populate it is the worst state to hand someone evaluating it.
          */}
          <Link to="/demo" className="text-sm text-muted underline">
            {t('demoData')}
          </Link>
        </div>
      </div>
    </main>
  )
}
