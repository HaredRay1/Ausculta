import type { InputHTMLAttributes, ReactNode } from 'react'
import { FieldShell, controlClassName, useFieldIds } from './Field'

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'id' | 'value' | 'onChange' | 'aria-describedby' | 'aria-invalid'
>

export interface TextFieldProps extends NativeInputProps {
  /** Always visible. There is no placeholder-only mode on purpose. */
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string
  optionalLabel?: string
  id?: string
  /** Rendered inside the control on the trailing edge (e.g. a unit, a toggle). */
  trailing?: ReactNode
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  optionalLabel,
  id,
  trailing,
  required,
  ...rest
}: TextFieldProps) {
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
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={error !== undefined || undefined}
          className={controlClassName(error !== undefined, trailing !== undefined ? 'pr-14' : '')}
          {...rest}
        />
        {trailing !== undefined && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</span>
        )}
      </div>
    </FieldShell>
  )
}
