import { useState } from 'react'
import { Button, Checkbox, Section } from '../../../components'
import { GuideFigure } from '../components/GuideFigure'
import { DEVICE_STEPS, deviceStepCaptionKey } from '../guides'
import { useAssessmentTranslation } from '../i18n'

/**
 * Step 2 — how to use the recorder, one drawing at a time.
 *
 * Skippable from the first screen and suppressible for good, because a health
 * worker who does this ten times a day should not have to page through nine
 * pictures each time. Fieldwork found older clinic staff often will not read
 * instructions at all, which is why the pictures carry the meaning and the
 * caption only supports them.
 */
export interface DeviceGuideStepProps {
  onFinish: (dontShowAgain: boolean) => void
}

export function DeviceGuideStep({ onFinish }: DeviceGuideStepProps) {
  const { t } = useAssessmentTranslation()
  const [index, setIndex] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const step = DEVICE_STEPS[index]
  const isLast = index === DEVICE_STEPS.length - 1

  return (
    <Section title={t('deviceGuide.title')} description={t('deviceGuide.subtitle')}>
      <GuideFigure
        src={step.src}
        alt={t('deviceGuide.imageAlt', { number: index + 1 })}
        caption={t(deviceStepCaptionKey(step))}
        eyebrow={t('deviceGuide.stepOf', { current: index + 1, total: DEVICE_STEPS.length })}
      />

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
          fullWidth
        >
          {t('action.back')}
        </Button>
        <Button
          onClick={() => (isLast ? onFinish(dontShowAgain) : setIndex((current) => current + 1))}
          fullWidth
        >
          {isLast ? t('action.continue') : t('action.next')}
        </Button>
      </div>

      <Checkbox
        label={t('deviceGuide.dontShowAgain')}
        checked={dontShowAgain}
        onChange={setDontShowAgain}
      />

      <Button variant="ghost" onClick={() => onFinish(dontShowAgain)} fullWidth>
        {t('action.skip')}
      </Button>
    </Section>
  )
}
