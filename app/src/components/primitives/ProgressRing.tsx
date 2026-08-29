/**
 * A ring showing how many of something have been done.
 *
 * A COUNT METER, FULL STOP.
 *
 * It may only ever be given a real count and a real total — "4 of 6 chest
 * locations recorded" is a fact the database holds, and that is the entire
 * category of thing this component is for. It must never display a health
 * score, a severity, a percentage of wellness, a confidence, or anything else
 * derived or invented. A ring reads as a measurement of the person, and this
 * app does not have one: the severity model does not exist, and dressing a
 * number up as a dial would be the most convincing lie the interface could
 * tell. If you are reaching for this to show something that is not a count of
 * completed items, the answer is NotConnectedPanel instead.
 *
 * The numerals are inside the ring, so the value survives greyscale, a
 * colour-blind reader and a screen reader — the arc is a second signal, never
 * the only one.
 */
export interface ProgressRingProps {
  /** How many are done. A real count. */
  value: number
  /** How many there are in total. A real count. */
  max: number
  /** Describes the count for assistive technology, e.g. "chest locations recorded". */
  label: string
  size?: number
}

export function ProgressRing({ value, max, label, size = 88 }: ProgressRingProps) {
  const safeMax = Math.max(1, Math.round(max))
  const safeValue = Math.min(Math.max(0, Math.round(value)), safeMax)
  const radius = size / 2 - 7
  const circumference = 2 * Math.PI * radius
  const filled = (safeValue / safeMax) * circumference

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      role="img"
      aria-label={`${safeValue} of ${safeMax} ${label}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={7}
          className="stroke-surface-sunken"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="stroke-primary"
        />
      </svg>
      <span className="absolute font-heading text-lg font-bold tabular-nums text-on-surface">
        {safeValue}/{safeMax}
      </span>
    </div>
  )
}
