import { CheckIcon } from '../icons'
import { useFieldIds } from './Field'

export interface CheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  error?: string
  disabled?: boolean
  id?: string
}

/**
 * A single checkbox.
 *
 * The whole row is the label, so the tap target is the width of the screen
 * rather than a 20px square — the difference between usable and unusable with
 * gloves on. The native input stays in the DOM (it is what a screen reader and
 * the keyboard talk to) and is visually replaced by a box that can carry a
 * thick enough tick to see outdoors.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  hint,
  error,
  disabled,
  id,
}: CheckboxProps) {
  const { inputId, hintId, errorId, describedBy } = useFieldIds(
    id,
    hint !== undefined,
    error !== undefined,
  )

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={[
          'flex min-h-12 cursor-pointer items-center gap-3 rounded-control py-2',
          disabled === true ? 'cursor-not-allowed opacity-60' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="relative inline-flex shrink-0">
          <input
            id={inputId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            aria-describedby={describedBy}
            aria-invalid={error !== undefined || undefined}
            className="peer size-7 appearance-none rounded-md border-2 border-border-strong bg-card checked:border-primary-strong checked:bg-primary-strong disabled:bg-nested"
          />
          <CheckIcon
            className="pointer-events-none absolute inset-0 m-auto size-5 text-on-primary opacity-0 peer-checked:opacity-100"
            strokeWidth={3}
          />
        </span>
        <span className="text-base text-on-surface">{label}</span>
      </label>

      {hint !== undefined && (
        <p id={hintId} className="pl-10 text-sm text-muted">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p
          id={errorId}
          role="alert"
          className="pl-10 text-sm font-medium text-on-destructive-surface"
        >
          {error}
        </p>
      )}
    </div>
  )
}
