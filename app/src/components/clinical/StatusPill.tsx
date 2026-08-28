import { useDesignTranslation } from '../../design/i18n'
import { VERDICT_PRESENTATION, verdictTitleKey, type ResultVerdict } from './verdict'

export interface StatusPillProps {
  verdict: ResultVerdict
  /** Smaller variant for dense list rows. Still shows icon and word. */
  size?: 'sm' | 'md'
}

/**
 * A verdict in one line, for list rows and headers.
 *
 * The compact form of a result still shows the icon AND the word — there is no
 * icon-only or colour-only variant on offer, because a coloured dot in a list
 * of recordings is unreadable to a colour-blind user and silent to a screen
 * reader. Compactness is not a good enough reason to make a clinical state
 * ambiguous.
 *
 * The full explanation always lives in a ResultCard; this is a pointer to it,
 * never a replacement.
 */
export function StatusPill({ verdict, size = 'md' }: StatusPillProps) {
  const { t } = useDesignTranslation()
  const { icon: Icon, surface, iconClass } = VERDICT_PRESENTATION[verdict]

  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-pill border font-semibold',
        surface,
        size === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-3 py-1.5 text-base',
      ].join(' ')}
    >
      <Icon className={`${size === 'sm' ? 'size-4' : 'size-5'} shrink-0 ${iconClass}`} />
      {t(verdictTitleKey(verdict))}
    </span>
  )
}
