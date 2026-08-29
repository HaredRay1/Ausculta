import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components'
import { DEVICE_LANGUAGE_STORAGE_KEY } from '../../lib/deviceLanguage'
import type { SupportedLanguage } from '../../i18n'

interface LanguageOption {
  code: SupportedLanguage
  /** i18n key resolved in each language's own bundle. */
  labelKey: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', labelKey: 'languageNameEn' },
  { code: 'fil', labelKey: 'languageNameFil' },
]

export function LanguageSelect() {
  const { t, i18n } = useTranslation('common')
  const navigate = useNavigate()

  const selectLanguage = (code: SupportedLanguage) => {
    window.localStorage.setItem(DEVICE_LANGUAGE_STORAGE_KEY, code)
    void i18n.changeLanguage(code).then(() => navigate('/landing'))
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface px-6">
      <h1 className="font-heading text-2xl font-semibold text-on-surface">{t('appName')}</h1>
      {/*
        Written in both languages at once, deliberately. This is the one screen
        where the reader's language is still unknown, so a prompt in only one of
        them asks half the audience to guess — and the Filipino half is the half
        this app is built for.
      */}
      <div className="text-center">
        <p className="text-lg text-on-surface">{t('chooseLanguage', { lng: 'en' })}</p>
        <p className="text-lg text-on-surface">{t('chooseLanguage', { lng: 'fil' })}</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-4">
        {LANGUAGE_OPTIONS.map((option) => (
          <Button key={option.code} size="lg" fullWidth onClick={() => selectLanguage(option.code)}>
            {t(option.labelKey, { lng: option.code })}
          </Button>
        ))}
      </div>
    </main>
  )
}
