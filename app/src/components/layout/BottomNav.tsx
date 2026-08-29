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
      className="fixed inset-x-0 bottom-0 z-(--z-nav) border-t border-border bg-chrome text-on-chrome elevation-2"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        // Never taller than what Page reserves for it.
        maxHeight: 'calc(var(--size-bottom-nav) + env(safe-area-inset-bottom))',
      }}
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch justify-around gap-2 px-1 py-1">
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
                  // Teal ink plus a bolder label, never colour alone —
                  // aria-current carries it for anyone who cannot see either.
                  active ? 'text-primary' : 'text-muted active:opacity-70',
                ].join(' ')}
              >
                <span className="relative">
                  {item.icon}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -right-2.5 -top-1 min-w-6 rounded-pill bg-destructive px-1 text-center text-sm font-bold leading-6 text-on-destructive">
                      {item.badge}
                    </span>
                  )}
                </span>
                {/*
                  Wraps to two lines rather than truncating.
                  At 320px — a small Android phone, and the likeliest device a
                  validator actually owns — five items leave about 58px each,
                  which is roughly eight characters at this size. "My results"
                  and "Breathing plan" both clipped; in Filipino "Tungkol sa
                  akin" and "Plano sa paghinga" clipped to nonsense. A label
                  truncated to "Plano s…" is worse than a taller bar, because
                  the label is the only thing making the destination findable
                  to someone navigating unaided.

                  The two-line clamp that replaced the truncation was still losing
                  text once the system font size was turned up: measured in a real
                  browser at 200% root font, "My results", "About me" and "Breathing
                  plan" were all clipped mid-label. Enlarged text is exactly the
                  setting the older users this app is for tend to run, so the clamp
                  is gone and the label wraps as far as it needs to. The bar grows;
                  same trade as before, for the same reason.
                */}
                <span
                  className={[
                    'w-full break-words text-center text-sm leading-tight',
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
