import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon } from '../../../components'
import type { LocationCode } from '../../../db/codes'
import {
  LOCATION_ORDER,
  LUNG_MAP_MARKERS,
  LUNG_MAP_SRC,
  LUNG_MAP_VIEWBOX,
  MIN_INTERACTIVE_MAP_WIDTH_PX,
  lungPositionNumber,
} from '../guides'
import { useAssessmentTranslation } from '../i18n'

/**
 * The six auscultation positions, as tap targets over the picker artwork and as
 * a list beneath it.
 *
 * The list is not a fallback — it is the control that always works, and at
 * narrow widths it is the only one. The markers are a fixed 48px (the floor for
 * a gloved finger) laid over an image that scales with its container, so their
 * separation shrinks as the phone narrows; below
 * `MIN_INTERACTIVE_MAP_WIDTH_PX` they would begin to overlap, and an overlap
 * means the later-rendered button silently wins the tap. On this screen that
 * records the wrong lung. So under that width the markers keep their numbers
 * but stop being buttons, and the map is purely a diagram.
 *
 * Never colour alone: a recorded position carries a tick AND the word
 * "Recorded" in its accessible name, in both the map and the list.
 */
export interface LungMapProps {
  recorded: readonly LocationCode[]
  onChoose: (code: LocationCode) => void
}

/**
 * The container's rendered width, or null before it can be measured.
 *
 * Measured rather than assumed from the viewport: this component sits inside a
 * padded, max-width page and may later sit inside a sheet or a split view, and
 * only the element itself knows how much room it actually got.
 */
function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    setWidth(element.getBoundingClientRect().width)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (element === null || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

export function LungMap({ recorded, onChoose }: LungMapProps) {
  const { t } = useAssessmentTranslation()
  const { t: tCodes } = useTranslation('codes')
  const { ref, width } = useMeasuredWidth()

  // Fails safe: until the width is known the markers are not interactive, so a
  // tap can never land on a target whose separation has not been verified.
  const isInteractive = width !== null && width >= MIN_INTERACTIVE_MAP_WIDTH_PX

  const label = (code: LocationCode) =>
    t('location.position', {
      number: lungPositionNumber(code),
      name: tCodes(`location.${code}`),
    })
  const statusLabel = (isRecorded: boolean) =>
    t(isRecorded ? 'location.recorded' : 'location.notRecorded')

  const markerClass = (isRecorded: boolean) =>
    [
      'absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center',
      'rounded-pill border-2 font-heading text-lg font-bold',
      isRecorded
        ? 'border-success bg-success text-on-success'
        : 'border-primary bg-card text-primary',
    ].join(' ')

  const markerStyle = (code: LocationCode) => ({
    left: `${(LUNG_MAP_MARKERS[code].x / LUNG_MAP_VIEWBOX.width) * 100}%`,
    top: `${(LUNG_MAP_MARKERS[code].y / LUNG_MAP_VIEWBOX.height) * 100}%`,
  })

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={ref}
        className="relative mx-auto w-full max-w-xs"
        style={{ aspectRatio: `${LUNG_MAP_VIEWBOX.width} / ${LUNG_MAP_VIEWBOX.height}` }}
      >
        <img src={LUNG_MAP_SRC} alt={t('location.mapAlt')} className="absolute inset-0 size-full" />

        {LOCATION_ORDER.map((code) => {
          const isRecorded = recorded.includes(code)
          const content = isRecorded ? (
            <CheckIcon className="size-6" />
          ) : (
            lungPositionNumber(code)
          )

          // Not a disabled button: a disabled control still reads as something
          // that ought to work. At this width the number is simply a label on a
          // diagram, and the list below is the control.
          return isInteractive ? (
            <button
              key={code}
              type="button"
              onClick={() => onChoose(code)}
              aria-label={`${label(code)} — ${statusLabel(isRecorded)}`}
              className={markerClass(isRecorded)}
              style={markerStyle(code)}
            >
              {content}
            </button>
          ) : (
            <span
              key={code}
              aria-hidden="true"
              className={markerClass(isRecorded)}
              style={markerStyle(code)}
            >
              {content}
            </span>
          )
        })}
      </div>

      <ul className="flex flex-col gap-2">
        {LOCATION_ORDER.map((code) => {
          const isRecorded = recorded.includes(code)
          return (
            <li key={code}>
              <button
                type="button"
                onClick={() => onChoose(code)}
                aria-label={`${label(code)} — ${statusLabel(isRecorded)}`}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-control border-2 border-border bg-card px-4 py-2 text-left text-on-surface"
              >
                <span className="text-base font-medium">{label(code)}</span>
                <span
                  className={`flex shrink-0 items-center gap-1.5 text-sm font-semibold ${
                    isRecorded ? 'text-success' : 'text-muted'
                  }`}
                >
                  {isRecorded && <CheckIcon className="size-4" />}
                  {statusLabel(isRecorded)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
