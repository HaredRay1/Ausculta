import { useId, type ReactNode } from 'react'
import { FieldShell, useFieldIds } from './Field'

export interface RadioOption {
  value: string
  label: string
  /** A plain-language sentence under the label. Worth using. */
  description?: string
  icon?: ReactNode
  disabled?: boolean
}

export interface RadioGroupProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly RadioOption[]
  hint?: string
  error?: string
  name?: string
  id?: string
}

/**
 * A choice between a handful of options, rendered as full-width cards.
 *
 * Cards rather than a compact list because validators navigate this app
 * unaided: an option that states what it means in a sentence gets picked
 * correctly by someone who has never seen the screen before, and a bare radio
 * label does not. The selected option is marked by border, background *and*
 * the native checked state — never by colour alone.
 */
export function RadioGroup({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  name,
  id,
}: RadioGroupProps) {
  const generatedName = useId()
  const groupName = name ?? generatedName
  const { inputId, hintId, errorId, describedBy } = useFieldIds(
    id,
    hint !== undefined,
    error !== undefined,
  )

  return (
    <fieldset aria-describedby={describedBy} aria-invalid={error !== undefined || undefined}>
      <FieldShell
        as="legend"
        label={label}
        inputId={inputId}
        hintId={hintId}
        errorId={errorId}
        hint={hint}
        error={error}
      >
        <div className="flex flex-col gap-2">
          {options.map((option) => {
            const selected = option.value === value
            return (
              <label
                key={option.value}
                className={[
                  'flex min-h-14 cursor-pointer items-center gap-3 rounded-control border-2 px-4 py-3',
                  selected
                    ? 'border-primary-strong bg-accent text-on-accent'
                    : 'border-border-strong bg-card text-on-surface',
                  option.disabled === true ? 'cursor-not-allowed opacity-60' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={option.value}
                  checked={selected}
                  disabled={option.disabled}
                  onChange={() => onChange(option.value)}
                  className="size-6 shrink-0 accent-[var(--color-primary-strong)]"
                />
                {option.icon !== undefined && <span className="shrink-0">{option.icon}</span>}
                <span className="flex flex-col">
                  <span className="text-base font-semibold">{option.label}</span>
                  {option.description !== undefined && (
                    <span className="text-sm text-muted">{option.description}</span>
                  )}
                </span>
              </label>
            )
          })}
        </div>
      </FieldShell>
    </fieldset>
  )
}
