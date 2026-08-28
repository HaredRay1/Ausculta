import { formatShortDate } from '../format'
import { usePatientTranslation } from '../i18n'
import { axisMax, plotPoints, type TrendPoint } from '../data/trends'

/**
 * A trend, drawn by hand in SVG.
 *
 * No chart library: this is one polyline and a few circles, and a dependency
 * that ships a rendering engine to draw it would be several hundred kilobytes
 * of an offline PWA budget spent on a shape that is nine lines of markup.
 *
 * Two accessibility decisions worth stating. The SVG is `aria-hidden` and the
 * same data is repeated underneath as a real list, because a polyline is
 * unreadable to a screen reader and a `<title>` saying "a line chart" tells
 * nobody what the values were. And every point is a filled circle on the line,
 * not a colour-coded dot, so the chart carries no meaning in hue at all.
 *
 * Colour comes from `currentColor` so the whole thing follows the theme token
 * of whatever it is placed in — there is no palette class or hex anywhere here.
 */

const WIDTH = 320
const HEIGHT = 140
const PADDING = 16

export interface TrendChartProps {
  points: readonly TrendPoint[]
  /** The value to plot from each point. */
  valueOf: (point: TrendPoint) => number | null
  /** Renders one point as text in the list beneath the chart. */
  formatValue: (value: number | null) => string
  title: string
  description: string
  language: string
  /** Fixes the axis top, e.g. 100 for a percentage. */
  max?: number
}

export function TrendChart({
  points,
  valueOf,
  formatValue,
  title,
  description,
  language,
  max,
}: TrendChartProps) {
  const { t } = usePatientTranslation()

  const raw = points.map(valueOf)
  const drawable = raw.map((value) => value ?? 0)
  const top = max ?? axisMax(drawable)
  const coords = plotPoints(drawable, top, WIDTH, HEIGHT, PADDING)
  const path = coords.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption>
        <h3 className="font-heading text-base font-bold text-on-surface">{title}</h3>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </figcaption>

      <div className="rounded-card border border-border bg-surface-sunken p-3 text-primary">
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full"
          role="presentation"
        >
          {/* Baseline, so a flat-at-zero series is still visibly a series. */}
          <line
            x1={PADDING}
            y1={HEIGHT - PADDING}
            x2={WIDTH - PADDING}
            y2={HEIGHT - PADDING}
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="1"
          />
          <polyline
            points={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coords.map((point, index) => (
            <circle
              key={points[index]?.assessmentId ?? index}
              cx={point.x}
              cy={point.y}
              r="5"
              fill="currentColor"
            />
          ))}
        </svg>
      </div>

      {/* The data itself, for anyone the picture does not reach. */}
      <ul className="flex flex-col gap-1 text-sm text-on-surface">
        {points.map((point, index) => (
          <li key={point.assessmentId}>
            {t('patient:trends.pointLabel', {
              date: formatShortDate(point.date, language),
              value: formatValue(raw[index]),
            })}
          </li>
        ))}
      </ul>
    </figure>
  )
}
