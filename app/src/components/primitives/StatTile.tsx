import type { ReactNode } from 'react'

/**
 * One number, large, over a small label.
 *
 * The card language this app was missing: screens said "6 locations recorded"
 * as a sentence in a list of sentences, and nothing could be compared at a
 * glance. A number set large with a quiet label under it is scannable, and it
 * is what a health app looks like.
 *
 * THE ONLY NUMBERS ALLOWED HERE ARE ONES THE DATABASE ACTUALLY HOLDS — counts,
 * dates, durations. Setting a figure at 30px makes it look authoritative, which
 * is exactly why a fabricated one would be worse here than anywhere else in the
 * app. If there is no value, pass `value={null}` and it says so rather than
 * showing a zero, because "none recorded" and "zero" are different facts.
 */
export interface StatTileProps {
  /** The count or date. `null` renders the placeholder, never a zero. */
  value: string | number | null
  label: string
  /** Shown in place of a value when there is none. */
  emptyText: string
  icon?: ReactNode
  className?: string
}

export function StatTile({ value, label, emptyText, icon, className = '' }: StatTileProps) {
  const hasValue = value !== null && value !== undefined && value !== ''

  return (
    <div
      className={[
        'flex flex-col gap-1 rounded-card border border-card-border bg-surface-raised p-4 elevation-1',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon !== undefined && <span className="mb-1">{icon}</span>}
      <span
        className={
          hasValue
            ? 'font-heading text-[1.75rem] font-bold leading-none tabular-nums text-on-surface'
            : 'font-heading text-base font-semibold leading-tight text-muted'
        }
      >
        {hasValue ? value : emptyText}
      </span>
      <span className="text-sm leading-snug text-muted">{label}</span>
    </div>
  )
}
