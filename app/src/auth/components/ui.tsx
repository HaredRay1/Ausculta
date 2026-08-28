import { useId, useState, type ReactNode } from 'react'
import { useAuthTranslation } from '../i18n'

/**
 * Shared building blocks for the auth screens.
 *
 * The audience is a rural health worker on a 360x740 phone, often outdoors and
 * often not a confident phone user. Everything here follows from that: one
 * column, controls at least 48px tall so they can be hit without aiming, labels
 * always visible rather than placeholder-only (a placeholder disappears the
 * moment you start typing, and there is then nothing left to tell you what the
 * box was for), and near-black text on white rather than the soft greys that
 * vanish in sunlight.
 */

/** Full-height screen shell with a title, optional subtitle, and body. */
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="min-h-dvh bg-white px-5 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-teal-900">{title}</h1>
          {subtitle !== undefined && <p className="text-base text-slate-700">{subtitle}</p>}
        </header>
        {children}
        {footer !== undefined && <footer className="pt-2 text-center">{footer}</footer>}
      </div>
    </main>
  )
}

function AlertIcon({ tone }: { tone: BannerTone }) {
  if (tone === 'success') {
    return (
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.7 7.7-5.4 5.4a1 1 0 0 1-1.4 0l-2.6-2.6 1.4-1.4 1.9 1.9 4.7-4.7 1.4 1.4Z" />
      </svg>
    )
  }
  if (tone === 'error') {
    return (
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z" />
    </svg>
  )
}

export type BannerTone = 'info' | 'error' | 'success' | 'warning'

const BANNER_TONES: Record<BannerTone, string> = {
  info: 'bg-slate-100 text-slate-900',
  error: 'bg-red-50 text-red-900',
  success: 'bg-teal-50 text-teal-900',
  warning: 'bg-amber-50 text-amber-900',
}

/**
 * A message the user must not miss.
 *
 * Errors and successes are announced to screen readers as well as shown:
 * `role="alert"` for errors (interrupts), `role="status"` for the rest.
 */
export function Banner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl px-4 py-3 text-base font-medium ${BANNER_TONES[tone]}`}
    >
      <AlertIcon tone={tone} />
      <span>{children}</span>
    </div>
  )
}

export interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  type?: 'text' | 'password'
  autoComplete?: string
  required?: boolean
  disabled?: boolean
  /** Rendered inside the control, e.g. the password show/hide button. */
  trailing?: ReactNode
  inputId?: string
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  type = 'text',
  autoComplete,
  required,
  disabled,
  trailing,
  inputId,
}: TextFieldProps) {
  const generatedId = useId()
  const id = inputId ?? generatedId
  const hintId = `${id}-hint`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-medium text-slate-900">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          aria-describedby={hint === undefined ? undefined : hintId}
          className="min-h-14 w-full rounded-xl border-2 border-slate-400 bg-white px-4 py-3 pr-14 text-lg text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700 disabled:bg-slate-100"
        />
        {trailing}
      </div>
      {hint !== undefined && (
        <p id={hintId} className="text-sm text-slate-600">
          {hint}
        </p>
      )}
    </div>
  )
}

/** A text field with an eye toggle, so a typo can be found before submitting. */
export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const { t } = useAuthTranslation()
  const [revealed, setRevealed] = useState(false)

  return (
    <TextField
      {...props}
      type={revealed ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? t('field.hidePassword') : t('field.showPassword')}
          aria-pressed={revealed}
          className="absolute inset-y-0 right-0 flex w-14 items-center justify-center rounded-r-xl text-slate-700"
        >
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="currentColor">
            {revealed ? (
              <path d="M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM3.7 2.3 2.3 3.7l18 18 1.4-1.4-18-18Z" />
            ) : (
              <path d="M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
            )}
          </svg>
        </button>
      }
    />
  )
}

/** The one action a screen exists for. Full width, unmissable, never ambiguous. */
export function PrimaryButton({
  children,
  disabled,
  type = 'submit',
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  type?: 'submit' | 'button'
  onClick?: () => void
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="min-h-14 w-full rounded-xl bg-teal-700 px-6 py-4 text-lg font-semibold text-white shadow-sm active:bg-teal-800 disabled:bg-slate-400"
    >
      {children}
    </button>
  )
}
