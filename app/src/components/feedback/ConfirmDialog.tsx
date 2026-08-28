import type { ReactNode } from 'react'
import { useDesignTranslation } from '../../design/i18n'
import { Sheet } from '../layout/Sheet'
import { Button } from '../primitives/Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** What will actually happen, named plainly. */
  children: ReactNode
  onConfirm: () => void
  onCancel: () => void
  /** Label the button with the action, not with "OK". */
  confirmLabel?: string
  cancelLabel?: string
  /** Styles confirm as destructive and keeps the scrim from dismissing. */
  destructive?: boolean
  /** Disables both controls and shows the confirm button busy. */
  busy?: boolean
}

/**
 * A decision the user has to make before anything happens.
 *
 * Cancel comes first in the DOM, so it is the first thing focus lands on and
 * the first thing a screen reader reads — the safe option should be the easy
 * one to hit by accident, not the irreversible one.
 *
 * A destructive confirmation cannot be dismissed by tapping the scrim. Escape
 * and Cancel both still work, so there is no trap; what is removed is the
 * ambiguous outcome where a stray tap outside the dialog leaves the user unsure
 * whether the delete happened.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
}: ConfirmDialogProps) {
  const { t } = useDesignTranslation()

  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      variant="modal"
      dismissOnScrimClick={!destructive}
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy} fullWidth>
            {cancelLabel ?? t('action.cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            loading={busy}
            fullWidth
          >
            {confirmLabel ?? t('action.confirm')}
          </Button>
        </div>
      }
    >
      <div className="text-base text-on-surface">{children}</div>
    </Sheet>
  )
}
