import type { TextareaHTMLAttributes } from 'react'
import { FieldShell, controlClassName, useFieldIds } from './Field'

type NativeTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className' | 'id' | 'value' | 'onChange' | 'aria-describedby' | 'aria-invalid'
>

export interface TextareaProps extends NativeTextareaProps {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string
  optionalLabel?: string
  id?: string
}

export function Textarea({
  label,
  value,
  onChange,
  hint,
  error,
  optionalLabel,
  id,
  rows = 4,
  required,
  ...rest
}: TextareaProps) {
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
      <textarea
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={error !== undefined || undefined}
        className={controlClassName(error !== undefined, 'resize-y leading-relaxed')}
        {...rest}
      />
    </FieldShell>
  )
}
