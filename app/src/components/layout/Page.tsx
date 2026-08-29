import type { ReactNode } from 'react'

export interface PageProps {
  children: ReactNode
  /** Reserves room for a fixed BottomNav so content is never hidden behind it. */
  hasBottomNav?: boolean
  className?: string
}

/**
 * The scrolling body of a screen.
 *
 * Carries the safe-area insets itself, so no screen has to remember that a
 * phone has a notch and a home indicator. When a BottomNav is present the page
 * reserves its height plus the bottom inset — content disappearing behind a
 * fixed bar is a navigation failure, not a cosmetic one.
 */
export function Page({ children, hasBottomNav = false, className = '' }: PageProps) {
  return (
    <main
      className={['min-h-dvh bg-page text-on-surface', className].filter(Boolean).join(' ')}
      style={{
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: hasBottomNav
          ? 'calc(env(safe-area-inset-bottom) + var(--size-bottom-nav))'
          : 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-5">{children}</div>
    </main>
  )
}

export interface SectionProps {
  children: ReactNode
  /** Rendered as an <h2> and used as the section's accessible name. */
  title?: string
  description?: string
  /** e.g. a "See all" link, placed opposite the title. */
  action?: ReactNode
  className?: string
}

export function Section({ children, title, description, action, className = '' }: SectionProps) {
  return (
    <section
      aria-label={title}
      className={['flex flex-col gap-3', className].filter(Boolean).join(' ')}
    >
      {(title !== undefined || action !== undefined) && (
        <div className="flex items-baseline justify-between gap-3">
          {title !== undefined && (
            <h2 className="font-heading text-title-m text-on-surface">{title}</h2>
          )}
          {action}
        </div>
      )}
      {description !== undefined && <p className="text-body text-muted">{description}</p>}
      {children}
    </section>
  )
}
