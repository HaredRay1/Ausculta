import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCATION_CODES } from '../../../db/codes'
import { LungMap } from '../components/LungMap'
import { MIN_INTERACTIVE_MAP_WIDTH_PX } from '../guides'
import '../i18n'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * jsdom performs no layout, so every element measures 0 wide. Stubbing the
 * measurement is the only way to exercise the width gate — and it is the gate,
 * not the arithmetic, that this file is about: the coordinate separation is
 * asserted numerically in guides.test.ts, because no rendering test in a
 * layout-free environment could catch a target overlap.
 */
function stubWidth(width: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: (width * 340) / 320,
    top: 0,
    left: 0,
    right: width,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
}

/** Map markers carry the position number; list rows carry the full label. */
function mapMarkers() {
  return screen
    .getAllByRole('button')
    .filter((button) => /^[1-6]$/.test(button.textContent?.trim() ?? ''))
}

describe('LungMap at a comfortable width', () => {
  it('offers the six positions on the map and in the list', () => {
    stubWidth(320)
    render(<LungMap recorded={[]} onChoose={() => {}} />)

    expect(mapMarkers()).toHaveLength(6)
    // Two controls per position: the marker and its list row.
    expect(
      screen.getAllByRole('button', { name: /Position 1 — Right upper lung — Not recorded yet/i }),
    ).toHaveLength(2)
  })

  it('reports the position a marker actually stands for', () => {
    stubWidth(320)
    const onChoose = vi.fn()
    render(<LungMap recorded={[]} onChoose={onChoose} />)

    mapMarkers()[0].click()
    expect(onChoose).toHaveBeenCalledWith(LOCATION_CODES.R_UPPER)
    expect(onChoose).not.toHaveBeenCalledWith(LOCATION_CODES.L_UPPER)
  })
})

describe('LungMap below the interactive width', () => {
  it('draws the markers but makes none of them tappable', () => {
    stubWidth(MIN_INTERACTIVE_MAP_WIDTH_PX - 1)
    render(<LungMap recorded={[]} onChoose={() => {}} />)

    // The numbers are still on the diagram — it is a picture, not a control.
    expect(mapMarkers()).toHaveLength(0)
    expect(screen.getByAltText(/six listening positions/i)).toBeInTheDocument()
  })

  it('leaves the list as a complete control for all six positions', () => {
    stubWidth(260)
    const onChoose = vi.fn()
    render(<LungMap recorded={[]} onChoose={onChoose} />)

    const rows = screen.getAllByRole('button')
    expect(rows).toHaveLength(6)

    rows[0].click()
    expect(onChoose).toHaveBeenCalledWith(LOCATION_CODES.R_UPPER)
  })

  it('fails safe: nothing is tappable on the map until the width is known', () => {
    // No stub at all — jsdom reports 0, which is what a measurement that has
    // not happened yet looks like. A tap must never land on a target whose
    // separation has not been verified.
    render(<LungMap recorded={[]} onChoose={() => {}} />)

    expect(mapMarkers()).toHaveLength(0)
    expect(screen.getAllByRole('button')).toHaveLength(6)
  })
})

describe('recorded positions', () => {
  it('says "Recorded" as well as showing a tick, in the map and the list', () => {
    stubWidth(320)
    render(<LungMap recorded={[LOCATION_CODES.R_UPPER]} onChoose={() => {}} />)

    expect(
      screen.getAllByRole('button', { name: /Position 1 — Right upper lung — Recorded/i }),
    ).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: /Position 2 — Left upper lung — Not recorded yet/i }),
    ).toHaveLength(2)
  })
})
