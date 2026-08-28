import { useTranslation } from 'react-i18next'

interface DisclaimerBannerProps {
  /** i18next key (with namespace, e.g. "common:disclaimer") to render. */
  i18nKey: string
}

/**
 * Reusable prototype/non-medical-device disclaimer banner. Any screen that
 * shows clinical-looking output should include this.
 */
export function DisclaimerBanner({ i18nKey }: DisclaimerBannerProps) {
  const { t } = useTranslation()

  return (
    <div
      role="note"
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      {t(i18nKey)}
    </div>
  )
}
