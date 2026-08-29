import type { ReactNode } from 'react'

/**
 * One number, large, over a small label.
 *
 * The card language this app was missing: screens said "6 locations recorded"
 * as a sentence in a list of sentences, and nothing could be compared at a
 * glance. A number set large with a quiet label under it is scannable, and it
 * is what a health app looks like.
 *
 * The value is 32px/700 against a 14px/600 label — 2.29:1, up from the 2.00:1
 * that was the widest ratio anywhere in this app. 14px is the floor and it is
 * test-enforced, so size alone cannot buy more than 4:1 here; the rest of the
 * hierarchy comes from weight and colour, which is what the label's 600 and
 * muted ink are doing.
 *
 * `tabular-nums` is not cosmetic. Figtree's digits are proportional by default
 * and its `1` is 410 units against its `0` at 638 — a 1.56x spread that makes
 * a three-digit value jump about 22px in width at this size as it changes.
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
        'flex flex-col gap-1 rounded-card bg-card p-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon !== undefined && <span className="mb-1">{icon}</span>}
      <span
        className={
          hasValue
            ? 'font-heading text-stat tabular-nums text-on-surface'
            : 'font-heading text-title-s text-muted'
        }
      >
        {hasValue ? value : emptyText}
      </span>
      <span className="text-label text-muted">{label}</span>
    </div>
  )
}
