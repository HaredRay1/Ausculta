import { useState } from 'react'
import { useDesignTranslation } from '../../design/i18n'
import { EyeIcon, EyeOffIcon } from '../icons'
import { TextField, type TextFieldProps } from './TextField'

export type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'trailing'>

/**
 * A password entry with a show/hide toggle.
 *
 * The toggle is not a convenience. Typing a password blind on a phone
 * keyboard, outdoors, possibly with gloves, is where sign-in attempts die —
 * and on this app a failed sign-in has no "reset by email" escape, because
 * there is no server. Being able to look at what you typed is the difference
 * between getting in and needing an administrator.
 *
 * The toggle is a real button with an accessible name that changes with the
 * state, and `aria-pressed` so its state is announced rather than inferred
 * from the icon.
 */
export function PasswordField(props: PasswordFieldProps) {
  const { t } = useDesignTranslation()
  const [revealed, setRevealed] = useState(false)

  return (
    <TextField
      {...props}
      type={revealed ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? t('action.hidePassword') : t('action.showPassword')}
          aria-pressed={revealed}
          className="inline-flex size-12 items-center justify-center rounded-control text-muted"
        >
          {revealed ? <EyeOffIcon className="size-6" /> : <EyeIcon className="size-6" />}
        </button>
      }
    />
  )
}
