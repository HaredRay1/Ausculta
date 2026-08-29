import type { ReactNode } from 'react'
import { InboxIcon } from '../icons'
import { IconTile } from '../primitives/IconTile'

export interface EmptyStateProps {
  title: string
  /** Say why it is empty and what to do about it, in plain language. */
  body?: string
  icon?: ReactNode
  /** The suggested next step. An empty screen with no way forward is a dead end. */
  action?: ReactNode
}

/**
 * What a screen shows when it has nothing to show.
 *
 * Always offers a next step where one exists. The validation protocol scores a
 * dead end as a navigation failure rather than as an unbuilt feature, so "there
 * is nothing here" without "here is what you can do" is a defect, not an
 * honest empty list.
 *
 * It is a card, like everything else on the canvas, and deliberately NOT the
 * dashed outline it used to be. A dashed rectangle is the house style for
 * unbuilt UI, and it said the wrong thing here: a patient who has just
 * registered and has no readings yet is looking at a normal, expected state of
 * a finished app, not at a placeholder somebody forgot to fill in. On a screen
 * where this panel is the only content — a newly registered patient's home is
 * exactly that — the dashes were the loudest claim on the page and the claim
 * was false.
 *
 * NotConnectedPanel keeps its dashes, and that distinction is the point: it
 * means "this feature genuinely is not wired up", where looking like a
 * wireframe is the honest thing to look like.
 */
export function EmptyState({ title, body, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-card-border bg-surface-raised px-6 py-12 text-center elevation-1">
      <IconTile size="xl" tone="tone-5">
        {icon ?? <InboxIcon className="size-8" />}
      </IconTile>
      {/*
        h2, not h3. An EmptyState is usually the whole content of a screen,
        sitting directly under the AppBar's h1 — measured on /research/performance
        and /assessment/new, both of which read h1 then h3 with nothing between.
        A screen reader user navigating by heading hears a level vanish and cannot
        tell whether they missed something. h2 is correct directly under the h1 and
        is a harmless sibling when nested inside a Section, so it is right in both
        places whereas h3 was only ever right in one.
      */}
      <h2 className="font-heading text-xl font-bold text-on-surface">{title}</h2>
      {body !== undefined && (
        <p className="max-w-sm text-base leading-relaxed text-muted">{body}</p>
      )}
      {action !== undefined && <div className="mt-1 w-full max-w-xs">{action}</div>}
    </div>
  )
}
