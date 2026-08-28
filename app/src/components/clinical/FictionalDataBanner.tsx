import { useDesignTranslation } from '../../design/i18n'
import { FlaskIcon } from '../icons'

export interface FictionalDataBannerProps {
  /** One-line form for a list row or a card header. */
  compact?: boolean
  className?: string
}

/**
 * Marks seeded demo records as invented.
 *
 * Demo mode exists because the people validating this prototype are asthma
 * patients who have no recordings of their own, and would otherwise meet empty
 * screens. The cost of that is a screen full of clinical-looking data about a
 * person who does not exist — so the label has one job, and it is a safety job:
 * a clinician must never mistake seeded data for a real patient.
 *
 * Which is why this is a solid, fully opaque fill rather than the pale wash the
 * other banners use. It has to stay unmistakable sitting on a card, on a sunken
 * well, on a result surface or on a coloured header — a translucent tint would
 * take on whatever is behind it and quietly lose its force on exactly the
 * busiest screen. It also states what it means in plain words ("not a real
 * person"), rather than trusting a reader to decode "demo".
 */
export function FictionalDataBanner({ compact = false, className = '' }: FictionalDataBannerProps) {
  const { t } = useDesignTranslation()

  if (compact) {
    return (
      <span
        role="note"
        className={[
          'inline-flex items-center gap-1.5 rounded-pill border-2 border-warning bg-warning px-3 py-1 text-sm font-bold text-on-warning',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <FlaskIcon className="size-4 shrink-0" />
        {t('fictional.shortLabel')}
      </span>
    )
  }

  return (
    <div
      role="note"
      aria-label={t('fictional.title')}
      className={[
        'flex items-start gap-3 rounded-card border-2 border-warning bg-warning p-4 text-on-warning',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <FlaskIcon className="mt-0.5 size-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-lg font-bold">{t('fictional.title')}</p>
        <p className="mt-0.5 text-base">{t('fictional.body')}</p>
      </div>
    </div>
  )
}
