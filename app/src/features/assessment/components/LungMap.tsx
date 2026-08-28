import { CheckIcon } from '../../../components'
import { useTranslation } from 'react-i18next'
import type { LocationCode } from '../../../db/codes'
import {
  LOCATION_ORDER,
  LUNG_MAP_MARKERS,
  LUNG_MAP_SRC,
  LUNG_MAP_VIEWBOX,
  lungPositionNumber,
} from '../guides'
import { useAssessmentTranslation } from '../i18n'

/**
 * The six auscultation positions as tap targets over the picker artwork.
 *
 * The buttons are placed at the coordinates the circles are actually drawn at
 * (see LUNG_MAP_MARKERS), as percentages of the SVG's own viewBox, so they
 * stay on the drawing at any width. Each is at least 48px across because the
 * people using this wear gloves.
 *
 * Never colour alone: a recorded position carries a tick AND the word
 * "Recorded" in its accessible name, and the list beneath the figure repeats
 * every position as an ordinary row — which is also what a screen-reader user
 * and anyone who finds small targets hard to hit will use instead.
 */
export interface LungMapProps {
  recorded: readonly LocationCode[]
  onChoose: (code: LocationCode) => void
}

export function LungMap({ recorded, onChoose }: LungMapProps) {
  const { t } = useAssessmentTranslation()
  const { t: tCodes } = useTranslation('codes')

  const label = (code: LocationCode) =>
    t('location.position', {
      number: lungPositionNumber(code),
      name: tCodes(`location.${code}`),
    })

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative mx-auto w-full max-w-xs"
        style={{ aspectRatio: `${LUNG_MAP_VIEWBOX.width} / ${LUNG_MAP_VIEWBOX.height}` }}
      >
        <img
          src={LUNG_MAP_SRC}
          alt={t('location.mapAlt')}
          className="absolute inset-0 size-full"
        />
        {LOCATION_ORDER.map((code) => {
          const marker = LUNG_MAP_MARKERS[code]
          const isRecorded = recorded.includes(code)
          return (
            <button
              key={code}
              type="button"
              onClick={() => onChoose(code)}
              aria-label={`${label(code)} — ${t(isRecorded ? 'location.recorded' : 'location.notRecorded')}`}
              className={[
                'absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center',
                'rounded-pill border-2 font-heading text-lg font-bold',
                isRecorded
                  ? 'border-success bg-success text-on-success'
                  : 'border-primary bg-surface-raised text-primary',
              ].join(' ')}
              style={{
                left: `${(marker.x / LUNG_MAP_VIEWBOX.width) * 100}%`,
                top: `${(marker.y / LUNG_MAP_VIEWBOX.height) * 100}%`,
              }}
            >
              {isRecorded ? (
                <CheckIcon className="size-6" />
              ) : (
                lungPositionNumber(code)
              )}
            </button>
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
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-control border-2 border-border bg-surface-raised px-4 py-2 text-left text-on-surface"
              >
                <span className="text-base font-medium">{label(code)}</span>
                <span
                  className={`flex shrink-0 items-center gap-1.5 text-sm font-semibold ${
                    isRecorded ? 'text-success' : 'text-muted'
                  }`}
                >
                  {isRecorded && <CheckIcon className="size-4" />}
                  {t(isRecorded ? 'location.recorded' : 'location.notRecorded')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
