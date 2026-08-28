export interface SkeletonProps {
  /** Tailwind sizing, e.g. "h-6 w-40". */
  className?: string
  /** Repeat count for a list of lines. */
  lines?: number
}

/**
 * A loading placeholder.
 *
 * Hidden from assistive technology entirely: a screen reader user gains nothing
 * from being told the shape of content that has not arrived. Announce loading
 * once, on the container, with `aria-busy` — see SkeletonGroup.
 *
 * The pulse stops under `prefers-reduced-motion` (tokens.css); the block stays
 * visible, so nothing is lost by holding still.
 */
export function Skeleton({ className = 'h-5 w-full', lines = 1 }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`block animate-pulse rounded-control bg-surface-sunken ${className}`}
        />
      ))}
    </>
  )
}

export interface SkeletonGroupProps {
  children: React.ReactNode
  /** Announced once while the region is loading. */
  label: string
}

/** Wraps skeletons so the *region* announces itself busy exactly once. */
export function SkeletonGroup({ children, label }: SkeletonGroupProps) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-2">
      {children}
    </div>
  )
}
