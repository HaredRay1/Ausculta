/**
 * Busy indicator.
 *
 * Decorative by default: it is almost always inside a control that already
 * carries `aria-busy`, and a second announcement would just be noise. Pass a
 * `label` when the spinner is the only thing on screen saying "wait".
 *
 * The spin is the one animation in the system, and `prefers-reduced-motion`
 * flattens it to a static ring (tokens.css) — the ring is still visible, so no
 * information is lost by stopping it.
 */
export interface SpinnerProps {
  className?: string
  /** Accessible name; also makes the spinner a live status region. */
  label?: string
}

export function Spinner({ className = 'size-6', label }: SpinnerProps) {
  return (
    <span role={label === undefined ? undefined : 'status'} className="inline-flex">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={`${className} animate-spin`}
        aria-hidden={label === undefined ? true : undefined}
        role={label === undefined ? undefined : 'img'}
        focusable="false"
      >
        {label !== undefined && <title>{label}</title>}
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
