import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from '../feedback/Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Disables the button and announces it busy. Keeps the label in place. */
  loading?: boolean
  fullWidth?: boolean
  iconStart?: ReactNode
  iconEnd?: ReactNode
  children: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  // Filled with the darkened teal so white sits on it at 7.6:1, not 5.5:1.
  primary: 'bg-primary-strong text-on-primary border-2 border-transparent active:opacity-90',
  secondary: 'bg-surface-raised text-on-surface border-2 border-border-strong active:bg-surface-sunken',
  ghost: 'bg-transparent text-primary border-2 border-transparent active:bg-accent',
  destructive:
    'bg-destructive text-on-destructive border-2 border-transparent active:opacity-90',
}

/**
 * Sizes, all at or above the 48px touch floor.
 *
 * Users may be wearing gloves, so there is no "small enough to miss" size on
 * offer. `sm` is the floor itself, not a compact exception to it.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-12 px-5 text-base gap-2',
  md: 'min-h-13 px-6 text-base gap-2.5',
  lg: 'min-h-14 px-8 text-lg gap-3',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  iconStart,
  iconEnd,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  // A loading button must not be pressable — a second submit is exactly what a
  // user does when nothing appears to have happened.
  const isDisabled = disabled === true || loading

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center rounded-pill font-semibold',
        'transition-[background-color,opacity] duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        fullWidth ? 'w-full' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <Spinner className="size-5 shrink-0" />
      ) : (
        iconStart !== undefined && <span className="shrink-0">{iconStart}</span>
      )}
      <span>{children}</span>
      {!loading && iconEnd !== undefined && <span className="shrink-0">{iconEnd}</span>}
    </button>
  )
}
