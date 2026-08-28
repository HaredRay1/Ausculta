import { Section, Spinner } from '../../../components'
import { useAssessmentTranslation } from '../i18n'

/**
 * Step 7 — the model running.
 *
 * It classifies overlapping one-second windows and on a mid-range phone that
 * takes seconds, not milliseconds, so the wait is given a screen of its own
 * with an honest explanation rather than a spinner over a frozen page.
 */
export function AnalysisStep() {
  const { t } = useAssessmentTranslation()

  return (
    <Section title={t('analysis.title')} description={t('analysis.body')}>
      <div className="flex flex-col items-center gap-4 py-8" aria-busy="true">
        <Spinner label={t('analysis.progress')} />
        <p className="text-base text-muted">{t('analysis.keepOpen')}</p>
      </div>
    </Section>
  )
}
