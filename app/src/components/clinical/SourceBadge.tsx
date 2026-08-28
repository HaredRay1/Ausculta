import { useDesignTranslation } from '../../design/i18n'
import { ChipIcon, HandIcon, type IconComponent } from '../icons'

/**
 * Matches MEASUREMENT_SOURCES in src/db/codes.ts, so a stored value maps
 * straight onto a badge with no translation table in between.
 */
export type ValueSource = 'MANUAL_ENTRY' | 'AUSCULTATION_DERIVED'

const SOURCE_ICONS: Record<ValueSource, IconComponent> = {
  MANUAL_ENTRY: HandIcon,
  AUSCULTATION_DERIVED: ChipIcon,
}

export interface SourceBadgeProps {
  source: ValueSource
  className?: string
}

/**
 * Where a clinical value came from.
 *
 * Every number on a clinical screen must say whether a person typed it or the
 * device produced it. A reviewing clinician weighs the two differently, and a
 * screen that mixes them silently invites a device-derived estimate to be read
 * as a measured observation.
 *
 * Icon plus words, never the icon alone.
 */
export function SourceBadge({ source, className = '' }: SourceBadgeProps) {
  const { t } = useDesignTranslation()
  const Icon = SOURCE_ICONS[source]

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface-sunken px-2.5 py-1 text-sm text-muted',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon className="size-4 shrink-0" />
      {t(`source.${source}`)}
    </span>
  )
}
