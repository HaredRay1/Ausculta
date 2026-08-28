/**
 * Dates and names, in words a patient can read.
 *
 * Plain formatting helpers rather than a library: the app is offline-first on
 * low-end Android hardware and `Intl` is already in the runtime.
 */

/**
 * A date a patient reads, e.g. "12 August 2026".
 *
 * Deliberately spelled-out rather than numeric: "08/12/2026" is August 12th in
 * Manila and December 8th in half the world, and this app is used by people
 * reading in Filipino and English on the same device.
 */
export function formatLongDate(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** A shorter form for a dense list row, e.g. "12 Aug 2026". */
export function formatShortDate(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/**
 * Whole years between a birth date and now, or null when it cannot be worked
 * out. Null rather than 0: a zero would render as "0 years old".
 */
export function ageInYears(birthDate: string, now: Date = new Date()): number | null {
  const born = new Date(birthDate)
  if (Number.isNaN(born.getTime())) return null
  let age = now.getFullYear() - born.getFullYear()
  const monthDelta = now.getMonth() - born.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) age -= 1
  return age < 0 ? null : age
}

/** Seconds as "0:12". Used for a recording's length, which is a real measurement. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const whole = Math.round(seconds)
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}
