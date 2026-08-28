import { useId, type ReactNode } from 'react'
import { WarningIcon } from '../icons'

/**
 * Shared scaffolding for every form control.
 *
 * The rules it exists to enforce, once, rather than per-component:
 *
 * - The label is always visible. A placeholder disappears the moment someone
 *   starts typing, and a user who is interrupted mid-form — which, in a clinic,
 *   is most of the time — comes back to an unlabelled box.
 * - Helper text and the error are wired to the control through
 *   `aria-describedby`, so a screen reader reads them as part of the field
 *   rather than as loose text nearby.
 * - The error sits directly beneath the field it belongs to, carries an icon as
 *   well as red, and is announced (`role="alert"`) when it appears.
 */

export interface FieldIds {
  inputId: string
  hintId: string
  errorId: string
  /** Pass straight to the control's `aria-describedby`. */
  describedBy: string | undefined
}

export function useFieldIds(
  providedId: string | undefined,
  hasHint: boolean,
  hasError: boolean,
): FieldIds {
  const generated = useId()
  const inputId = providedId ?? generated
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  const described = [hasHint ? hintId : null, hasError ? errorId : null].filter(Boolean)

  return {
    inputId,
    hintId,
    errorId,
    describedBy: described.length > 0 ? described.join(' ') : undefined,
  }
}

export interface FieldShellProps {
  label: string
  inputId: string
  hintId: string
  errorId: string
  hint?: string
  error?: string
  /** Marks the control optional in the label rather than starring the required ones. */
  optionalLabel?: string
  required?: boolean
  children: ReactNode
  /** Renders the label as a `<legend>` for grouped controls (radios). */
  as?: 'label' | 'legend'
}

export function FieldShell({
  label,
  inputId,
  hintId,
  errorId,
  hint,
  error,
  optionalLabel,
  required,
  children,
  as = 'label',
}: FieldShellProps) {
  const labelContent = (
    <>
      {label}
      {optionalLabel !== undefined && required !== true && (
        <span className="ml-2 font-normal text-muted">({optionalLabel})</span>
      )}
    </>
  )

  const body = (
    <>
      {children}

      {hint !== undefined && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}

      {error !== undefined && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm font-medium text-on-destructive-surface"
        >
          <WarningIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{error}</span>
        </p>
      )}
    </>
  )

  /**
   * A <legend> only names its <fieldset> when it is the fieldset's first
   * child, so the grouped variant must not wrap it in the layout div the
   * single-control variant uses. Nesting it cost the radio group its
   * accessible name entirely.
   */
  if (as === 'legend') {
    return (
      <>
        <legend className="mb-1 text-base font-semibold text-on-surface">{labelContent}</legend>
        <div className="flex flex-col gap-1.5">{body}</div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-base font-semibold text-on-surface">
        {labelContent}
      </label>
      {body}
    </div>
  )
}

/**
 * The shared look of a text-entry control.
 *
 * 56px tall (well over the 48px floor), a 2px boundary that clears 3:1 against
 * the surface, and a red boundary plus `aria-invalid` when it is wrong — never
 * red alone, since the error text beneath carries the same signal in words.
 */
export function controlClassName(hasError: boolean, extra = ''): string {
  return [
    'w-full min-h-14 rounded-control border-2 bg-surface-raised px-4 py-3',
    'text-lg text-on-surface placeholder:text-muted',
    'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted',
    hasError ? 'border-destructive' : 'border-border-strong',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}
