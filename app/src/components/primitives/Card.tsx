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
 * A card.
 *
 * No border and no shadow, which is the single change that most separates a
 * 2025 interface from a 2018 one. Both used to be here for a good reason — a
 * white card on a near-white page is 1.063:1, and in daylight the edge simply
 * goes, so a border was holding it together.
 *
 * The tonal ladder solves it properly instead. The card sits three tiers off
 * its page (1.166:1 light, 1.295:1 dark), which is separation the surface
 * itself provides, so the border and the shadow have nothing left to do. An
 * ordinary card does not float and should not pretend to; `elevation-1` is
 * kept for the things that genuinely do — sheets, the FAB, a scrolled app bar.
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
        'rounded-card bg-card text-on-surface',
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
