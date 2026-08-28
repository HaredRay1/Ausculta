import type { ReactNode } from 'react'

export interface BottomNavItem {
  id: string
  /** Always rendered. An icon-only bar is not discoverable to a first-time user. */
  label: string
  icon: ReactNode
  /** Optional count, e.g. accounts awaiting approval. */
  badge?: number
}

export interface BottomNavProps {
  items: readonly BottomNavItem[]
  activeId: string
  onSelect: (id: string) => void
  /** Names the navigation landmark, e.g. "Main". */
  label: string
}

/** Five is the practical ceiling before targets drop under 48px on a 360px screen. */
export const BOTTOM_NAV_MAX_ITEMS = 5

/**
 * The primary navigation bar.
 *
 * Icon *and* text on every item, always. The validation protocol has people
 * find features unaided, and a row of unlabelled glyphs is a guessing game;
 * the label is what makes the destination findable.
 *
 * The active item is marked three ways — `aria-current`, a filled pill behind
 * it, and a bolder label — so it survives both colour blindness and a greyscale
 * screenshot. Colour is the least of the three signals, never the only one.
 */
export function BottomNav({ items, activeId, onSelect, label }: BottomNavProps) {
  const visible = items.slice(0, BOTTOM_NAV_MAX_ITEMS)

  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-(--z-nav) border-t border-border bg-surface-raised"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch justify-around gap-1 px-1 py-1">
        {visible.map((item) => {
          const active = item.id === activeId
          return (
            <li key={item.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1.5',
                  active ? 'bg-accent text-on-accent' : 'text-muted active:bg-surface-sunken',
                ].join(' ')}
              >
                <span className="relative">
                  {item.icon}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -right-2.5 -top-1 min-w-5 rounded-pill bg-destructive px-1 text-center text-xs font-bold leading-5 text-on-destructive">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span
                  className={[
                    'w-full truncate text-center text-xs',
                    active ? 'font-bold' : 'font-medium',
                  ].join(' ')}
                >
                  {item.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
