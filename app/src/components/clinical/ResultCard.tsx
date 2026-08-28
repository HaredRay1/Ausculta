import type { ReactNode } from 'react'
import { useDesignTranslation } from '../../design/i18n'
import { Button } from '../primitives/Button'
import { RefreshIcon } from '../icons'
import { ConfidenceBar } from './ConfidenceBar'
import {
  RESULT_VERDICTS,
  VERDICT_PRESENTATION,
  verdictBodyKey,
  verdictTitleKey,
  type ResultVerdict,
} from './verdict'

export interface ResultCardProps {
  verdict: ResultVerdict
  /**
   * Model confidence, 0-100. Omit when there is none — never pass a
   * placeholder number.
   */
  confidencePercent?: number
  /** Where and when, e.g. "Right upper lung · 12 Aug 2026". */
  meta?: string
  /** Shows the record-again action. Required in practice for poor quality. */
  onRecordAgain?: () => void
  /** Extra detail beneath the message; never a substitute for the copy above. */
  children?: ReactNode
}

/**
 * The result of one recording.
 *
 * The title and the explanatory body are NOT props. They come from the `design`
 * namespace, keyed by verdict, and a calling screen cannot override or omit
 * them. That is deliberate: the safety-critical sentences — "this is not a
 * diagnosis", and above all "this does not rule out illness" on the
 * nothing-found state — are the part most likely to be dropped for space by
 * whoever builds the next screen, and they are exactly the part that must never
 * be dropped. Making them structural rather than optional is the whole design
 * of this component.
 *
 * Every state carries an icon and a word as well as a colour, so the result
 * survives greyscale, colour blindness, and a screen reader.
 */
export function ResultCard({
  verdict,
  confidencePercent,
  meta,
  onRecordAgain,
  children,
}: ResultCardProps) {
  const { t } = useDesignTranslation()
  const { icon: Icon, surface, iconClass } = VERDICT_PRESENTATION[verdict]

  return (
    <section
      aria-label={t('result.heading')}
      className={`flex flex-col gap-3 rounded-card border-2 p-4 ${surface}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-8 shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-xl font-bold">{t(verdictTitleKey(verdict))}</h3>
          {meta !== undefined && <p className="mt-0.5 text-sm opacity-90">{meta}</p>}
        </div>
      </div>

      {/* Fixed wording. Not overridable, not omittable. */}
      <p className="text-base leading-relaxed">{t(verdictBodyKey(verdict))}</p>

      {confidencePercent !== undefined && <ConfidenceBar percent={confidencePercent} />}

      {children}

      {onRecordAgain !== undefined && (
        <Button
          variant={verdict === RESULT_VERDICTS.INSUFFICIENT_QUALITY ? 'primary' : 'secondary'}
          onClick={onRecordAgain}
          iconStart={<RefreshIcon className="size-5" />}
          fullWidth
        >
          {t('action.recordAgain')}
        </Button>
      )}

      {/*
       * Short form here rather than the full paragraph: a screen can show one
       * of these per lung location, and six repeated paragraphs would train the
       * reader to skip exactly the thing they must not skip. The screen still
       * carries the full DisclaimerBanner once.
       */}
      <p className="border-t border-current/20 pt-2 text-sm opacity-90">
        {t('disclaimer.short')}
      </p>
    </section>
  )
}
