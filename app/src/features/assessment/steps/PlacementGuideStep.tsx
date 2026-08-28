import { useTranslation } from 'react-i18next'
import { Button, Section } from '../../../components'
import type { LocationCode } from '../../../db/codes'
import { GuideFigure } from '../components/GuideFigure'
import { lungPositionNumber, placementCaptionKey, placementGuideSrc } from '../guides'
import { useAssessmentTranslation } from '../i18n'

/**
 * Step 4 — where to hold the chestpiece for the chosen position.
 *
 * All six drawings are the same figure at the same scale and angle, so a health
 * worker flipping between positions sees only the chestpiece move.
 */
export interface PlacementGuideStepProps {
  locationCode: LocationCode
  onContinue: () => void
}

export function PlacementGuideStep({ locationCode, onContinue }: PlacementGuideStepProps) {
  const { t } = useAssessmentTranslation()
  const { t: tCodes } = useTranslation('codes')
  const number = lungPositionNumber(locationCode)

  return (
    <Section
      title={t('placement.title', { number, name: tCodes(`location.${locationCode}`) })}
      description={t('placement.subtitle')}
    >
      <GuideFigure
        src={placementGuideSrc(locationCode)}
        alt={t('placement.imageAlt', { number })}
        caption={t(placementCaptionKey(locationCode))}
      />

      <Button onClick={onContinue} fullWidth size="lg">
        {t('action.continue')}
      </Button>
    </Section>
  )
}
