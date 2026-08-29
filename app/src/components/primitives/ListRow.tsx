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
  /**
   * Status or a count. Sits with the chips below the title rather than beside
   * it — see the note on `body` for the 360px name-shattering this prevents.
   */
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
  /*
   * The title gets a line to itself, and `trailing` sits with the chips below.
   *
   * It used to share the title's line as a shrink-0 element, which is fine
   * until the name is long and the phone is 360px. Measured on a real capture:
   * "Waiting 11 days" took its natural width and left 78px for the name, so
   * "Corazon Villaflor" broke across two lines and "Rosalinda Mangubat" on the
   * admin screen shattered into "Rosalind / a / Manguba / t" — single
   * characters orphaned on their own lines. Filipino names are long and this is
   * the row a practitioner identifies a patient by, so that is not a rare case,
   * it is the common one.
   *
   * `break-words` was not the culprit and forbidding it would only trade a
   * shattered name for one that overflows its card. The bug was giving the
   * primary identifier whatever width a secondary label left over. Nothing
   * shares its line now, at any width, so no future label can take it away.
   */
  const body = (
    <div className="flex w-full items-start gap-3">
      {leading !== undefined && <span className="mt-0.5 shrink-0">{leading}</span>}

      <span className="min-w-0 flex-1 text-left">
        <span className="block font-heading text-base font-bold text-on-surface">{title}</span>

        {subtitle !== undefined && (
          <span className="mt-0.5 block text-sm text-muted">{subtitle}</span>
        )}
        {(detail !== undefined || trailing !== undefined) && (
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {trailing}
            {detail}
          </span>
        )}
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
