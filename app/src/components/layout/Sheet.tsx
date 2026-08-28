import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDesignTranslation } from '../../design/i18n'
import { CloseIcon } from '../icons'

export type SheetVariant = 'sheet' | 'modal'

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** Names the dialog for assistive technology and is shown as its heading. */
  title: string
  children: ReactNode
  /** Rendered along the bottom, e.g. the confirm/cancel pair. */
  footer?: ReactNode
  /** `sheet` rises from the bottom edge (thumb-reachable); `modal` is centred. */
  variant?: SheetVariant
  /** Set false for a decision the user must actually answer. */
  dismissOnScrimClick?: boolean
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A modal surface: bottom sheet or centred dialog.
 *
 * Everything a dialog has to get right, done here once so no screen has to
 * remember it — focus moves in on open and returns to whatever opened it on
 * close, Tab cycles inside rather than escaping to the page behind, Escape
 * closes, the scrim closes (unless the decision is mandatory), the page behind
 * cannot scroll, and there is always a visible close control rather than only
 * an invisible gesture.
 *
 * Rendered through a portal so no ancestor's `overflow` or `transform` can clip
 * it or trap it in the wrong stacking context.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  variant = 'sheet',
  dismissOnScrimClick = true,
}: SheetProps) {
  const { t } = useDesignTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  const focusableIn = useCallback((): HTMLElement[] => {
    const root = dialogRef.current
    if (root === null) return []
    // Filtering on `offsetParent !== null` would look like a reasonable
    // visibility check and quietly break the trap: an element inside a
    // `position: fixed` panel — which is exactly what this dialog is — reports
    // a null offsetParent in a real browser even while plainly visible.
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => !node.hasAttribute('hidden') && node.closest('[aria-hidden="true"]') === null,
    )
  }, [])

  // Remember what had focus, then move it inside.
  useEffect(() => {
    if (!open) return

    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const first = focusableIn()[0] ?? dialogRef.current
    first?.focus()

    return () => {
      // Returning focus is what makes a dialog non-disorienting: a keyboard or
      // screen-reader user lands back on the control they opened it from.
      restoreFocusRef.current?.focus?.()
    }
  }, [open, focusableIn])

  // Hold the page behind still, so closing does not lose the reader's place.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = focusableIn()
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      // Wrap at both ends, and pull focus back in if it somehow escaped.
      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose, focusableIn])

  if (!open) return null

  const panelPosition =
    variant === 'sheet'
      ? 'absolute inset-x-0 bottom-0 rounded-t-sheet max-h-[85vh]'
      : 'absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-sheet max-h-[85vh]'

  return createPortal(
    <div className="fixed inset-0 z-(--z-modal)">
      <div
        className="absolute inset-0 bg-(--color-scrim)"
        // The scrim is a convenience shortcut for the close control, which is
        // always present; announcing it as well would just be a second, worse
        // way to say the same thing.
        aria-hidden="true"
        onClick={dismissOnScrimClick ? onClose : undefined}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${panelPosition} flex flex-col overflow-hidden border border-border bg-surface-raised text-on-surface elevation-3`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <h2 id={titleId} className="font-heading text-xl font-bold text-on-surface">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('action.close')}
            className="-m-1 inline-flex size-12 shrink-0 items-center justify-center rounded-control text-on-surface active:bg-surface-sunken"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {footer !== undefined && (
          <div className="flex flex-col gap-2 border-t border-border p-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
