import type { ReactNode } from 'react'
import { useDesignTranslation } from '../../design/i18n'
import { ChevronLeftIcon } from '../icons'

export interface AppBarProps {
  title: string
  /** Shows a back control. Omit on a top-level screen. */
  onBack?: () => void
  /** Overrides the back control's accessible name (default: "Go back"). */
  backLabel?: string
  /** A single trailing control. Icon-only actions must carry an aria-label. */
  action?: ReactNode
  /** Second line under the title — a patient name, a date. */
  subtitle?: string
}

/**
 * The top bar of a screen.
 *
 * Sticky rather than fixed, so it participates in normal document flow and
 * cannot cover the first line of content. The title is a real `<h1>`: it is the
 * screen's name for a screen reader, not just large text.
 *
 * Back is a labelled 48px control, never a bare chevron relying on the platform
 * gesture — validators navigate this app unaided, and an edge-swipe is not
 * discoverable.
 */
export function AppBar({ title, onBack, backLabel, action, subtitle }: AppBarProps) {
  const { t } = useDesignTranslation()

  return (
    <header
      className="sticky top-0 z-(--z-appbar) border-b border-border bg-surface-raised"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex w-full max-w-lg items-center gap-2 px-2 py-2">
        {onBack !== undefined && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel ?? t('action.back')}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-control text-on-surface active:bg-surface-sunken"
          >
            <ChevronLeftIcon />
          </button>
        )}

        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate font-heading text-xl font-bold text-on-surface">{title}</h1>
          {subtitle !== undefined && (
            <p className="truncate text-sm text-muted">{subtitle}</p>
          )}
        </div>

        {action !== undefined && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  )
}
