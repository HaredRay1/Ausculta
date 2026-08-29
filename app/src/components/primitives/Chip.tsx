import type { ReactNode } from 'react'

/**
 * One fact, compactly.
 *
 * Card internals were stacks of full-width sentences — "6 locations recorded",
 * "3 locations flagged by the app", "Waiting 7 days" — each on its own line,
 * which reads as prose and takes four lines to say three small things. As chips
 * they sit on one or two lines and the eye can compare them between cards.
 */

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-surface-sunken text-muted border-border',
  accent: 'bg-accent text-on-accent border-transparent',
  success: 'bg-success-surface text-on-success-surface border-success/40',
  warning: 'bg-warning-surface text-on-warning-surface border-warning/40',
  danger: 'bg-destructive-surface text-on-destructive-surface border-destructive/40',
}

export interface ChipProps {
  children: ReactNode
  tone?: ChipTone
  /** Sits before the text. Decorative — the text carries the meaning. */
  icon?: ReactNode
  className?: string
}

export function Chip({ children, tone = 'neutral', icon, className = '' }: ChipProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-sm font-medium',
        TONES[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon !== undefined && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  )
}
