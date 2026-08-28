import { useTranslation } from 'react-i18next'
import { Banner } from './feedback/Banner'
import '../design/i18n'

interface DisclaimerBannerProps {
  /**
   * i18next key (with namespace, e.g. "common:disclaimer") to render.
   *
   * Defaults to the design system's own long-form wording, which is the one
   * the validation protocol requires the interface to carry.
   */
  i18nKey?: string
}

/**
 * The prototype / not-a-medical-device disclaimer.
 *
 * The validation protocol requires the app to state its prototype status
 * plainly, and a pulmonologist scores patient safety directly — so this is a
 * full-weight Banner with an icon and a border, not grey fine print. Any screen
 * showing clinical-looking output should carry it.
 *
 * Kept at this path with `i18nKey` still optional-compatible because
 * features/landing/Landing.tsx already imports it this way.
 */
export function DisclaimerBanner({ i18nKey = 'design:disclaimer.long' }: DisclaimerBannerProps) {
  const { t } = useTranslation()

  return (
    <Banner tone="warning" className="border-l-4">
      {t(i18nKey)}
    </Banner>
  )
}
