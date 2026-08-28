import type { SelectHTMLAttributes } from 'react'
import { ChevronDownIcon } from '../icons'
import { FieldShell, controlClassName, useFieldIds } from './Field'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

type NativeSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'className' | 'id' | 'value' | 'onChange' | 'aria-describedby' | 'aria-invalid' | 'children'
>

export interface SelectProps extends NativeSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly SelectOption[]
  /** Shown as a disabled first option when `value` is empty. */
  placeholder?: string
  hint?: string
  error?: string
  optionalLabel?: string
  id?: string
}

/**
 * A native <select>.
 *
 * Deliberately not a custom listbox: the platform picker is the control this
 * audience already knows, it is reachable with one tap, and it stays usable
 * with a screen reader, a keyboard and gloves without any of it being
 * reimplemented here.
 */
export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  error,
  optionalLabel,
  id,
  required,
  ...rest
}: SelectProps) {
  const { inputId, hintId, errorId, describedBy } = useFieldIds(
    id,
    hint !== undefined,
    error !== undefined,
  )

  return (
    <FieldShell
      label={label}
      inputId={inputId}
      hintId={hintId}
      errorId={errorId}
      hint={hint}
      error={error}
      optionalLabel={optionalLabel}
      required={required}
    >
      <div className="relative">
        <select
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined || undefined}
          className={controlClassName(error !== undefined, 'appearance-none pr-12')}
          {...rest}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
      </div>
    </FieldShell>
  )
}
