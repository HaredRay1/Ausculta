import type { ReactNode } from 'react'

/**
 * An icon in a tonal rounded square.
 *
 * The single device that turns a bare text list into something that reads as an
 * app: every row and section header gets a 40-44px tile, tinted, with the glyph
 * in the ink that belongs to that tint. Without it a list is sentences; with it
 * the eye has a rail to run down.
 *
 * Decorative by default — the label beside it carries the meaning, and a screen
 * reader gains nothing from being told there is a tile.
 */

export type TileTone = 'accent' | 'tone-1' | 'tone-2' | 'tone-3' | 'tone-4' | 'tone-5' | 'success' | 'warning' | 'danger'

export type TileSize = 'sm' | 'md' | 'lg'

const SIZES: Record<TileSize, string> = {
  sm: 'size-9',
  md: 'size-11',
  lg: 'size-14',
}

const TONES: Record<TileTone, string> = {
  accent: 'bg-accent text-on-accent',
  'tone-1': 'bg-tone-1 text-on-tone-1',
  'tone-2': 'bg-tone-2 text-on-tone-2',
  'tone-3': 'bg-tone-3 text-on-tone-3',
  'tone-4': 'bg-tone-4 text-on-tone-4',
  'tone-5': 'bg-tone-5 text-on-tone-5',
  success: 'bg-success-surface text-on-success-surface',
  warning: 'bg-warning-surface text-on-warning-surface',
  danger: 'bg-destructive-surface text-on-destructive-surface',
}

export interface IconTileProps {
  children: ReactNode
  tone?: TileTone
  size?: TileSize
  className?: string
}

export function IconTile({ children, tone = 'accent', size = 'md', className = '' }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-tile',
        SIZES[size],
        TONES[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}
