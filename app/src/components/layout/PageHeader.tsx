import type { ReactNode } from 'react'
import { IconTile } from '../primitives/IconTile'

/**
 * The face of a top-level screen.
 *
 * Screens had an app bar and then immediately content, which is why they read
 * as documents: nothing announced what you had arrived at. This is a tinted
 * band carrying the screen's own icon and a sentence of orientation, so a
 * screen has a face before it has a list.
 *
 * Top-level destinations only. A sub-screen you reached by tapping something
 * already has its context from the thing you tapped, and a second banner there
 * is just a taller scroll.
 */
export interface PageHeaderProps {
  title: string
  description?: string
  /** The screen's own glyph, shown large in a teal disc. */
  icon?: ReactNode
  /** A single control — a count, a filter, an action. */
  action?: ReactNode
}

export function PageHeader({ title, description, icon, action }: PageHeaderProps) {
  return (
    <header className="mb-1 flex items-start gap-3">
      {icon !== undefined && <IconTile size="lg">{icon}</IconTile>}
      <div className="min-w-0 flex-1">
        {/* Large title, quiet subtitle: the screen gets a face, and the app bar
            above it stays chrome rather than competing. */}
        <h2 className="font-heading text-[1.65rem] font-bold leading-tight text-on-surface">
          {title}
        </h2>
        {description !== undefined && (
          <p className="mt-1 text-sm leading-snug text-muted">{description}</p>
        )}
      </div>
      {action !== undefined && <div className="shrink-0">{action}</div>}
    </header>
  )
}
