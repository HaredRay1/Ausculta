import { useTranslation } from 'react-i18next'
import type { MeasurementSource } from '../../db/codes'
import { ChipIcon, HandIcon, type IconComponent } from '../icons'

/**
 * The stored code itself, not a copy of it.
 *
 * Re-declaring the union here would be a second place for the vocabulary to
 * live, which is the drift this component just suffered from.
 */
export type ValueSource = MeasurementSource

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
 * Every number on a clinical screen must say whether a person measured it or
 * the app worked it out. A reviewing clinician weighs the two differently, and
 * a screen that blurs them invites a derived estimate to be read as an
 * observation.
 *
 * The wording comes from `codes.json` and nowhere else. This component briefly
 * carried its own copy in the design namespace, which drifted until it read
 * "Measured by the device" for an auscultation-derived value — a false claim
 * about provenance, on the one control whose whole purpose is stating
 * provenance. Clinical vocabulary lives in the code registry, which the
 * exhaustiveness test polices and whose values leave the device in research
 * exports.
 *
 * Icon plus words, never the icon alone.
 */
export function SourceBadge({ source, className = '' }: SourceBadgeProps) {
  const { t } = useTranslation('codes', { useSuspense: false })
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
      {t(`measurementSource.${source}`)}
    </span>
  )
}
