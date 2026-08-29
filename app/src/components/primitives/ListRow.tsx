import type { ReactNode } from 'react'
import { ChevronRightIcon } from '../icons'

/**
 * One item in a list of things you can open.
 *
 * The shape every list in this app was missing: an anchor on the left, a bold
 * name, quiet supporting detail, and status on the right. Without it a list of
 * patients is a wall of sentences and every row looks like every other row.
 *
 * The whole row is the target, which is both the 48px rule and the behaviour
 * people expect from a list on a phone — nobody aims for the name.
 */
export interface ListRowProps {
  /** Avatar or icon. The visual anchor for the row. */
  leading?: ReactNode
  title: string
  /** One quiet line under the title. Keep it to one. */
  subtitle?: string
  /** Chips or a status pill, below the subtitle. */
  detail?: ReactNode
  /** Status or a count, right-aligned against the title. */
  trailing?: ReactNode
  onClick?: () => void
  /** Shown under everything — the sample-data pill lives here. */
  footer?: ReactNode
}

export function ListRow({
  leading,
  title,
  subtitle,
  detail,
  trailing,
  onClick,
  footer,
}: ListRowProps) {
  const body = (
    <div className="flex w-full items-start gap-3">
      {leading !== undefined && <span className="mt-0.5 shrink-0">{leading}</span>}

      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-start justify-between gap-3">
          <span className="font-heading text-base font-bold text-on-surface">{title}</span>
          {trailing !== undefined && <span className="shrink-0">{trailing}</span>}
        </span>

        {subtitle !== undefined && (
          <span className="mt-0.5 block text-sm text-muted">{subtitle}</span>
        )}
        {detail !== undefined && <span className="mt-2 flex flex-wrap gap-1.5">{detail}</span>}
        {footer !== undefined && <span className="mt-2 block">{footer}</span>}
      </span>

      {onClick !== undefined && (
        <ChevronRightIcon className="mt-1 size-5 shrink-0 text-muted" />
      )}
    </div>
  )

  if (onClick === undefined) {
    return (
      <div className="rounded-card border border-card-border bg-surface-raised p-3 elevation-1">
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-card border border-card-border bg-surface-raised p-3 text-left transition-colors duration-150 ease-out elevation-1 active:bg-surface-sunken"
    >
      {body}
    </button>
  )
}
