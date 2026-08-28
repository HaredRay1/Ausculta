import { useFieldIds } from './Field'

export interface SwitchProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  disabled?: boolean
  id?: string
}

/**
 * An on/off setting.
 *
 * A real `role="switch"` button rather than a styled checkbox, so assistive
 * technology announces "on"/"off" instead of "checked". The state is also
 * spelled out in the track position and the knob offset, and the whole row is
 * the target.
 *
 * Use this for a setting that takes effect immediately. For something that
 * only applies when a form is submitted, use Checkbox — a switch that does not
 * do anything until later is a small lie about what just happened.
 */
export function Switch({ label, checked, onChange, hint, disabled, id }: SwitchProps) {
  const { inputId, hintId, describedBy } = useFieldIds(id, hint !== undefined, false)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-12 items-center justify-between gap-4">
        <label htmlFor={inputId} className="text-base text-on-surface">
          {label}
        </label>
        <button
          id={inputId}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-describedby={describedBy}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={[
            'relative inline-flex h-8 w-14 shrink-0 items-center rounded-pill border-2 transition-colors',
            checked
              ? 'border-primary-strong bg-primary-strong'
              : 'border-border-strong bg-surface-sunken',
            disabled === true ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          ].join(' ')}
        >
          <span
            className={[
              'absolute size-6 rounded-pill transition-[left]',
              checked ? 'left-6 bg-on-primary' : 'left-0.5 bg-border-strong',
            ].join(' ')}
          />
        </button>
      </div>
      {hint !== undefined && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
