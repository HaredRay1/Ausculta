import { useTranslation } from 'react-i18next'
import type { AnalysisResult } from '../../../audio'
import {
  Banner,
  Button,
  Card,
  DisclaimerBanner,
  NotConnectedPanel,
  RESULT_VERDICTS,
  ResultCard,
  Section,
  type ResultVerdict,
} from '../../../components'
import type { LocationCode } from '../../../db/codes'
import { toResultView, type ResultState } from '../analysis/verdict'
import { RecordingPlayer } from '../components/RecordingPlayer'
import { lungPositionNumber } from '../guides'
import { useAssessmentTranslation } from '../i18n'

/**
 * Step 8 — what the app is willing to say about this recording.
 *
 * The whole screen is driven by `toResultView`, which decides once, in testable
 * data, whether there is a number to show at all. The three states that mean
 * "no answer" — uncertain, unusable, and no model — simply never receive a
 * `confidencePercent`, so the hard project rule (never fabricate a clinical
 * value) is structural here rather than a thing to remember.
 *
 * The title and body of `ResultCard` are fixed by the design system and cannot
 * be overridden from here. That is where "this does not rule out illness"
 * lives, and it is un-omittable on purpose.
 */
export interface ResultStepProps {
  analysis: AnalysisResult
  locationCode: LocationCode
  audioBlob: Blob | null
  onRecordAgain: () => void
  onContinue: () => void
}

/** This feature's result states -> the design system's four verdicts. */
const DESIGN_VERDICT: Partial<Record<ResultState, ResultVerdict>> = {
  suggestive: RESULT_VERDICTS.SUGGESTIVE,
  'no-abnormality': RESULT_VERDICTS.NO_ABNORMALITY_DETECTED,
  uncertain: RESULT_VERDICTS.UNCERTAIN,
  'insufficient-quality': RESULT_VERDICTS.INSUFFICIENT_QUALITY,
}

export function ResultStep({
  analysis,
  locationCode,
  audioBlob,
  onRecordAgain,
  onContinue,
}: ResultStepProps) {
  const { t } = useAssessmentTranslation()
  const { t: tCodes } = useTranslation('codes')

  const view = toResultView(analysis)
  const heading = t('result.locationHeading', {
    number: lungPositionNumber(locationCode),
    name: tCodes(`location.${locationCode}`),
  })
  const verdict = DESIGN_VERDICT[view.state]

  /**
   * The sentence beneath the fixed body, where it adds something the fixed
   * wording cannot carry: the condition's name for a suggestive finding, and
   * the reason for an uncertain or unusable one. The no-abnormality state gets
   * nothing here — the design system's body already states both required
   * sentences, and repeating them would train the reader to skim past them.
   */
  const detail =
    view.state === 'suggestive'
      ? t(view.messageKey, { condition: tCodes(`classification.${view.conditionCode}`) })
      : view.state === 'uncertain' || view.state === 'insufficient-quality'
        ? t(view.messageKey)
        : null

  return (
    <Section title={t('result.title')}>
      <p className="font-heading text-lg font-bold text-on-surface">{heading}</p>

      {view.state === 'model-not-connected' && (
        <NotConnectedPanel
          title={t('result.notConnectedTitle')}
          body={t('result.notConnectedBody')}
        />
      )}

      {view.state === 'error' && (
        <Banner tone="danger" title={t('result.errorTitle')}>
          {t('result.errorBody')}
        </Banner>
      )}

      {verdict !== undefined && (
        <ResultCard
          verdict={verdict}
          // Passed ONLY when the view carries one. Never a placeholder, never
          // a zero — an absent number must render as no number.
          {...(view.confidencePercent !== undefined && {
            confidencePercent: view.confidencePercent,
          })}
          meta={heading}
          {...(view.showRecordAgain && { onRecordAgain })}
        >
          {detail !== null && <p className="text-base leading-relaxed">{detail}</p>}
          {view.state === 'uncertain' && (
            <p className="text-sm opacity-90">{t('result.uncertainHelp')}</p>
          )}
          {view.state === 'insufficient-quality' && (
            <p className="text-sm opacity-90">{t('result.insufficientHelp')}</p>
          )}
        </ResultCard>
      )}

      <Card>
        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-bold text-on-surface">
            {t('result.audioHeading')}
          </h3>
          <RecordingPlayer blob={audioBlob} />
          <dl className="flex items-baseline gap-2 text-sm">
            <dt className="font-medium text-muted">{t('result.modelLabel')}</dt>
            {/* No model ran means no model version. Saying so beats printing
                the identity of a model that never saw this audio. */}
            <dd className="text-on-surface">{view.modelVersion ?? t('result.modelNone')}</dd>
          </dl>
        </div>
      </Card>

      <p className="text-sm text-muted">{t('result.reviewNote')}</p>
      <DisclaimerBanner />

      {view.state === 'model-not-connected' && (
        <Button variant="secondary" onClick={onRecordAgain} fullWidth>
          {t('action.changeFile')}
        </Button>
      )}

      <Button onClick={onContinue} fullWidth size="lg">
        {t('action.continue')}
      </Button>
    </Section>
  )
}
