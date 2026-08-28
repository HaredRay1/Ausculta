import { Section } from '../../../components'
import type { LocationCode } from '../../../db/codes'
import { LungMap } from '../components/LungMap'
import { LOCATION_ORDER } from '../guides'
import { useAssessmentTranslation } from '../i18n'

/**
 * Step 3 — which position to record next.
 *
 * Also the screen a resumed assessment lands on, because the completed
 * positions are the only thing a health worker needs to see to pick up where
 * they stopped.
 */
export interface LungLocationStepProps {
  recorded: readonly LocationCode[]
  onChoose: (code: LocationCode) => void
}

export function LungLocationStep({ recorded, onChoose }: LungLocationStepProps) {
  const { t } = useAssessmentTranslation()

  return (
    <Section title={t('location.title')} description={t('location.subtitle')}>
      <p className="text-sm font-medium text-muted">
        {t('location.progress', { done: recorded.length, total: LOCATION_ORDER.length })}
      </p>
      <LungMap recorded={recorded} onChoose={onChoose} />
      {recorded.length > 0 && <p className="text-sm text-muted">{t('location.rerecordHint')}</p>}
    </Section>
  )
}
