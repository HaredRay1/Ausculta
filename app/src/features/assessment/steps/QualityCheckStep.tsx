import type { QualityReport } from '../../../audio'
import { Banner, Button, Card, InfoIcon, Section, WarningIcon } from '../../../components'
import { GuideFigure } from '../components/GuideFigure'
import { MISTAKE_GUIDE_FOR_FLAG, mistakeCaptionKey } from '../guides'
import { useAssessmentTranslation } from '../i18n'

/**
 * Step 6 — what the automatic recording check found, before anything is
 * analysed.
 *
 * This screen is the only thing that ever tells a health worker WHY a recording
 * was refused. "Insufficient quality" teaches nobody anything, so each flag is
 * named in plain language, paired with the action that fixes it, and — where
 * one exists — with the wrong/right drawing for that mistake.
 *
 * A rejected recording can still be kept. It is evidence that this position was
 * attempted, it is research data, and the result screen will say plainly that
 * nothing was analysed. What it can never do is acquire a finding.
 */
export interface QualityCheckStepProps {
  report: QualityReport
  errorKey: string | null
  onAnalyse: () => void
  onRecordAgain: () => void
}

export function QualityCheckStep({
  report,
  errorKey,
  onAnalyse,
  onRecordAgain,
}: QualityCheckStepProps) {
  const { t } = useAssessmentTranslation()

  const rejects = report.flags.filter((flag) => flag.severity === 'reject')
  const warnings = report.flags.filter((flag) => flag.severity === 'warn')
  const shown = rejects.length > 0 ? rejects : warnings
  const diagramFlag = shown.find((flag) => MISTAKE_GUIDE_FOR_FLAG[flag.code] !== undefined)

  const title = !report.ok
    ? t('quality.failTitle')
    : warnings.length > 0
      ? t('quality.warnTitle')
      : t('quality.passTitle')
  const body = !report.ok
    ? t('quality.failBody')
    : warnings.length > 0
      ? t('quality.warnBody')
      : t('quality.passBody')

  return (
    <Section title={t('quality.title')} description={t('quality.subtitle')}>
      {errorKey !== null && <Banner tone="danger">{t(errorKey)}</Banner>}

      <Banner
        tone={!report.ok ? 'danger' : warnings.length > 0 ? 'warning' : 'success'}
        title={title}
      >
        {body}
      </Banner>

      {shown.length > 0 && (
        <Card>
          <h3 className="font-heading text-base font-bold text-on-surface">
            {t('quality.problemsHeading')}
          </h3>
          <ul className="mt-2 flex flex-col gap-3">
            {shown.map((flag) => (
              <li key={flag.code} className="flex gap-2">
                {/* Never colour alone: an icon and a word carry the severity. */}
                {flag.severity === 'reject' ? (
                  <WarningIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
                ) : (
                  <InfoIcon className="mt-0.5 size-5 shrink-0 text-warning" />
                )}
                <div className="min-w-0">
                  <p className="text-base text-on-surface">{t(`quality.flag.${flag.code}`)}</p>
                  {/* The fix is shown once. Where a drawing covers this flag it
                      carries the wording as its caption below; only a flag with
                      no drawing spells it out here. */}
                  {MISTAKE_GUIDE_FOR_FLAG[flag.code] === undefined && (
                    <p className="text-sm text-muted">{t(mistakeCaptionKey(flag.code))}</p>
                  )}
                  <p className="text-sm font-medium text-muted">
                    {t(`quality.severity.${flag.severity}`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {diagramFlag !== undefined && (
        <GuideFigure
          src={MISTAKE_GUIDE_FOR_FLAG[diagramFlag.code] as string}
          alt={t('quality.exampleAlt')}
          caption={t(mistakeCaptionKey(diagramFlag.code))}
          eyebrow={t('quality.adviceHeading')}
        />
      )}

      {report.ok ? (
        <Button onClick={onAnalyse} fullWidth size="lg">
          {t('action.analyse')}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Button onClick={onRecordAgain} fullWidth size="lg">
            {t('action.recordAgain')}
          </Button>
          {/* Secondary, and worded as keeping rather than analysing: nothing
              will be analysed, and the button must not suggest otherwise. */}
          <Button variant="secondary" onClick={onAnalyse} fullWidth>
            {t('action.keepAnyway')}
          </Button>
        </div>
      )}
    </Section>
  )
}
