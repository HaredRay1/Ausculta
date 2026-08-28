import type { ReactNode } from 'react'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

export interface CardProps {
  children: ReactNode
  padding?: CardPadding
  /** Renders as <section>; give it a heading id via aria-labelledby. */
  as?: 'div' | 'section' | 'article' | 'li'
  'aria-labelledby'?: string
  'aria-label'?: string
  className?: string
}

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
}

/**
 * A raised container.
 *
 * Carries a real border rather than leaning on the shadow: in bright daylight
 * on a phone, a soft shadow is effectively invisible and the card edge
 * disappears with it.
 */
export function Card({
  children,
  padding = 'md',
  as: Tag = 'div',
  className = '',
  ...rest
}: CardProps) {
  return (
    <Tag
      className={[
        'rounded-card border border-border bg-surface-raised text-on-surface elevation-1',
        PADDING[padding],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  )
}
