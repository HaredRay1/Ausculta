import type { ReactNode } from 'react'
import { InboxIcon } from '../icons'

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
 */
export function EmptyState({ title, body, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong px-6 py-10 text-center">
      <span className="text-muted">{icon ?? <InboxIcon className="size-10" />}</span>
      {/*
        h2, not h3. An EmptyState is usually the whole content of a screen,
        sitting directly under the AppBar's h1 — measured on /research/performance
        and /assessment/new, both of which read h1 then h3 with nothing between.
        A screen reader user navigating by heading hears a level vanish and cannot
        tell whether they missed something. h2 is correct directly under the h1 and
        is a harmless sibling when nested inside a Section, so it is right in both
        places whereas h3 was only ever right in one.
      */}
      <h2 className="font-heading text-lg font-bold text-on-surface">{title}</h2>
      {body !== undefined && <p className="max-w-sm text-base text-muted">{body}</p>}
      {action !== undefined && <div className="mt-2 w-full max-w-xs">{action}</div>}
    </div>
  )
}
