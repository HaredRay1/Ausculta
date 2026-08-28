import { useDesignTranslation } from '../../design/i18n'

export interface ConfidenceBarProps {
  /** 0-100. Clamped, and rounded to a whole number for display. */
  percent: number
  /**
   * Hides the "this is not your chance of being ill" line.
   *
   * Only pass this where that sentence is already on screen. It exists because
   * a percentage next to a health result is read as a probability of illness by
   * almost everyone who is not a statistician.
   */
  hideExplanation?: boolean
}

/**
 * How confident the model is in its own guess.
 *
 * Two rules shape this component:
 *
 * 1. The numeral is the value. The bar is a secondary cue drawn in neutral ink
 *    on a neutral track — no red-to-green gradient — so the number is what the
 *    reader takes away and the whole thing survives a greyscale screenshot or a
 *    colour-blind reader. A hue scale here would also imply "green = healthy",
 *    which is a different claim entirely from "the model is sure".
 *
 * 2. It says what it is not. "72%" beside a lung result reads as "a 72% chance
 *    I am ill" to almost anyone without statistical training — and the primary
 *    reader here is a patient with asthma, unaided. The explanation is on by
 *    default for that reason.
 */
export function ConfidenceBar({ percent, hideExplanation = false }: ConfidenceBarProps) {
  const { t } = useDesignTranslation()
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const formatted = t('confidence.value', { percent: clamped })

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{t('confidence.label')}</span>
        {/* The value as text: the bar below is decoration, this is the data. */}
        <span className="font-heading text-lg font-bold tabular-nums">{formatted}</span>
      </div>

      <div
        aria-hidden="true"
        className="h-3 w-full overflow-hidden rounded-pill border border-current/30 bg-current/10"
      >
        <div className="h-full rounded-pill bg-current/70" style={{ width: `${clamped}%` }} />
      </div>

      {!hideExplanation && (
        <p className="text-sm opacity-90">{t('confidence.explanation')}</p>
      )}
    </div>
  )
}
