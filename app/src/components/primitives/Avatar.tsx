/**
 * A person, as a disc of initials.
 *
 * Lists of people were reading as paragraphs of text. An avatar gives each row
 * an anchor the eye can land on and count, which is what makes a list scannable
 * rather than something you have to read.
 *
 * Initials rather than a photo: there are no photos in this app, and there
 * never should be — a clinic phone holding patient faces is a different privacy
 * problem entirely.
 */

export type AvatarSize = 'sm' | 'md' | 'lg'

const SIZES: Record<AvatarSize, string> = {
  sm: 'size-9 text-sm',
  md: 'size-10 text-base',
  lg: 'size-14 text-lg',
}

/**
 * Five muted hues, picked by a hash of the name.
 *
 * The same person keeps the same colour on every screen, which is what makes a
 * disc worth having — a row you recognise before you read it. Never the only
 * signal: the name is always beside it, and every pair clears AA in both
 * themes (see tokens.test.ts).
 */
const TONES = [
  'bg-tone-1 text-on-tone-1',
  'bg-tone-2 text-on-tone-2',
  'bg-tone-3 text-on-tone-3',
  'bg-tone-4 text-on-tone-4',
  'bg-tone-5 text-on-tone-5',
] as const

export function toneForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return TONES[hash % TONES.length]
}

export interface AvatarProps {
  /** Full name. Initials are derived from it. */
  name: string
  size?: AvatarSize
  className?: string
}

/** First letter of the first and last word — "Maria Dela Cruz" gives MC. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function Avatar({ name, size = 'md', className = '' }: AvatarProps) {
  return (
    <span
      // Decorative: the name it stands for is always right beside it, so
      // announcing the initials as well would just be the name twice.
      aria-hidden="true"
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-pill font-heading font-bold',
        toneForName(name),
        SIZES[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {initialsOf(name)}
    </span>
  )
}
