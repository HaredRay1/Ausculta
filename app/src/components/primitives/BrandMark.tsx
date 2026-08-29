import { LungsIcon } from '../icons'

export type BrandMarkSize = 'md' | 'lg'

const SIZES: Record<BrandMarkSize, { box: string; radius: string; glyph: string }> = {
  md: { box: 'size-14', radius: 'rounded-card', glyph: 'size-8' },
  lg: { box: 'size-20', radius: 'rounded-hero', glyph: 'size-12' },
}

export interface BrandMarkProps {
  size?: BrandMarkSize
  className?: string
}

/**
 * The lungs glyph in a mint tile — Ausculta's face, at hero size.
 *
 * Deliberately not IconTile with a size passed in className: that would be one
 * size utility overriding another and working only because of which one
 * Tailwind happens to emit last, the same trap the elevation utilities exist to
 * avoid. This owns its own box.
 *
 * Its corners come off the shape scale rather than being arbitrary rem values.
 * 20 at 56px and 28 at 80px both satisfy `inner = outer − padding` against the
 * glyph they hold, which is why they look concentric rather than nearly so.
 *
 * It exists because the sign-in screens had no identity on them at all. Coming
 * off a landing page that leads with a large mark and a wordmark, "Sign in"
 * alone on a bare canvas reads as a different application — and on a shared
 * clinic phone the sign-in screen is the one a validator meets most often. One
 * component so the mark cannot drift between the two places it appears.
 *
 * AppBar's bare glyph is a separate thing and stays separate: that one is
 * chrome at 28px, not a hero.
 */
export function BrandMark({ size = 'lg', className = '' }: BrandMarkProps) {
  const { box, radius, glyph } = SIZES[size]

  return (
    <span
      // Decorative. The wordmark or screen title always sits with it, so
      // announcing "Ausculta logo" would be the name twice.
      aria-hidden="true"
      className={[
        'inline-flex items-center justify-center bg-accent text-on-accent',
        box,
        radius,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <LungsIcon className={glyph} />
    </span>
  )
}
