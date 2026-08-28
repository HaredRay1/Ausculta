import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCATION_CODES } from '../../db/codes'
import {
  DEVICE_STEPS,
  LOCATION_ORDER,
  LUNG_MAP_DESIGN_WIDTH_PX,
  LUNG_MAP_MARKERS,
  LUNG_MAP_SRC,
  LUNG_MAP_VIEWBOX,
  MAP_MIN_GAP_PX,
  MAP_TARGET_PX,
  MIN_INTERACTIVE_MAP_WIDTH_PX,
  MISTAKE_GUIDE_FOR_FLAG,
  deviceStepCaptionKey,
  lungPositionNumber,
  placementCaptionKey,
  placementGuideSrc,
} from './guides'

// Resolved from the vitest root (`app/`), because `import.meta.url` is an
// http:// URL under Vite's transform and cannot be turned into a path.
const GUIDES_DIR = resolve(process.cwd(), 'public/guides')
const guideFiles = readdirSync(GUIDES_DIR)
const readme = readFileSync(resolve(GUIDES_DIR, 'README.md'), 'utf8')

describe('placement art and location codes', () => {
  it('every LOCATION_CODE has a placement diagram on disk', () => {
    for (const code of Object.values(LOCATION_CODES)) {
      const src = placementGuideSrc(code)
      expect(src).toBe(`/guides/placement-${code}.svg`)
      expect(guideFiles).toContain(`placement-${code}.svg`)
    }
  })

  it('every placement diagram on disk has a LOCATION_CODE (no orphan art)', () => {
    const codes: string[] = Object.values(LOCATION_CODES)
    const drawn = guideFiles
      .filter((name) => name.startsWith('placement-') && name.endsWith('.svg'))
      .map((name) => name.slice('placement-'.length, -'.svg'.length))

    expect(drawn.sort()).toEqual([...codes].sort())
  })

  it('the picker art it numbers is the one that exists', () => {
    expect(LUNG_MAP_SRC).toBe('/guides/lung-map-overview.svg')
    expect(guideFiles).toContain('lung-map-overview.svg')
  })
})

describe('the tap targets on the picker art', () => {
  const map = readFileSync(resolve(GUIDES_DIR, 'lung-map-overview.svg'), 'utf8')

  it('uses the viewBox of the artwork itself', () => {
    expect(map).toContain(`viewBox="0 0 ${LUNG_MAP_VIEWBOX.width} ${LUNG_MAP_VIEWBOX.height}"`)
  })

  it('has one marker per position, each inside the circle it belongs to', () => {
    expect(Object.keys(LUNG_MAP_MARKERS).sort()).toEqual(Object.values(LOCATION_CODES).sort())

    // The six drawn target circles, straight out of the artwork.
    const drawn = [...map.matchAll(/<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="23"/g)].map(
      (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
    )
    expect(drawn).toHaveLength(6)

    // A marker is nudged off its circle's centre to keep the targets apart (see
    // the separation test below), but it must still sit well inside the circle
    // it belongs to, or the button would float off the drawing.
    const claimed = new Set<number>()
    for (const marker of Object.values(LUNG_MAP_MARKERS)) {
      const distances = drawn.map((circle) => Math.hypot(circle.x - marker.x, circle.y - marker.y))
      const nearest = Math.min(...distances)
      expect(nearest).toBeLessThan(23)
      claimed.add(distances.indexOf(nearest))
    }
    // One marker per circle: no two targets may claim the same drawn position.
    expect(claimed.size).toBe(6)
  })

  /**
   * The geometry check that a rendering test cannot make.
   *
   * The targets are fixed-size squares over an image that scales with its
   * container, so two of them collide when their centres come within
   * MAP_TARGET_PX on EITHER axis — Chebyshev distance, not Euclidean. An
   * overlap is not a cosmetic problem: the later-rendered button wins the tap,
   * so a finger aimed at the patient's right upper lung records the left, and
   * the recording is filed against the wrong lung with nothing to show for it.
   *
   * This asserts on the coordinates and the target size directly so a future
   * tweak to either cannot quietly reintroduce the overlap.
   */
  it('keeps every pair of targets 8px clear at the design width', () => {
    const codes = Object.keys(LUNG_MAP_MARKERS) as (keyof typeof LUNG_MAP_MARKERS)[]
    const scale = LUNG_MAP_DESIGN_WIDTH_PX / LUNG_MAP_VIEWBOX.width

    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        const a = LUNG_MAP_MARKERS[codes[i]]
        const b = LUNG_MAP_MARKERS[codes[j]]
        const separation = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * scale
        const gap = separation - MAP_TARGET_PX

        expect(gap, `${codes[i]} <-> ${codes[j]} gap ${gap.toFixed(1)}px`).toBeGreaterThanOrEqual(
          MAP_MIN_GAP_PX,
        )
      }
    }
  })

  it('stops being interactive before the targets can collide', () => {
    // Below the cut-off the closest pair would eventually overlap, which is
    // exactly why the component drops to a non-interactive diagram there.
    const codes = Object.keys(LUNG_MAP_MARKERS) as (keyof typeof LUNG_MAP_MARKERS)[]
    const worstGapAt = (containerPx: number) => {
      let worst = Infinity
      for (let i = 0; i < codes.length; i++) {
        for (let j = i + 1; j < codes.length; j++) {
          const a = LUNG_MAP_MARKERS[codes[i]]
          const b = LUNG_MAP_MARKERS[codes[j]]
          const sep =
            Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) *
            (containerPx / LUNG_MAP_VIEWBOX.width)
          worst = Math.min(worst, sep - MAP_TARGET_PX)
        }
      }
      return worst
    }

    // At the narrowest width markers are still shown, nothing has collided yet.
    expect(worstGapAt(MIN_INTERACTIVE_MAP_WIDTH_PX)).toBeGreaterThan(0)
    // And the cut-off is doing real work: targets genuinely overlap below it.
    expect(worstGapAt(260)).toBeLessThan(0)
  })

  it('keeps the anterior view: a patient right lung sits left of the midline', () => {
    // The single most costly mistake this file could make. See the orientation
    // note in public/guides/README.md.
    const midline = LUNG_MAP_VIEWBOX.width / 2
    for (const [code, marker] of Object.entries(LUNG_MAP_MARKERS)) {
      if (code.startsWith('R_')) expect(marker.x).toBeLessThan(midline)
      else expect(marker.x).toBeGreaterThan(midline)
    }
  })
})

describe('LOCATION_ORDER', () => {
  it('lists every location code exactly once', () => {
    expect([...LOCATION_ORDER].sort()).toEqual(Object.values(LOCATION_CODES).sort())
  })

  it('numbers the positions the way the diagrams themselves are numbered', () => {
    // The README is the record of what each drawing depicts. Parsing it means
    // the app's numbering cannot silently disagree with the artwork a health
    // worker is looking at — which would send them to the wrong lung.
    const documented = new Map<string, number>()
    for (const line of readme.split('\n')) {
      const match = /\|\s*`placement-([A-Z_]+)\.svg`\s*\|.*\|\s*Position (\d)/.exec(line)
      if (match) documented.set(match[1], Number(match[2]))
    }

    expect(documented.size).toBe(Object.keys(LOCATION_CODES).length)
    for (const [code, position] of documented) {
      expect(lungPositionNumber(code as keyof typeof LOCATION_CODES)).toBe(position)
    }
  })

  it('gives each position a caption key of its own', () => {
    const keys = LOCATION_ORDER.map(placementCaptionKey)
    expect(new Set(keys).size).toBe(LOCATION_ORDER.length)
    expect(keys[0]).toBe('guide.placement.R_UPPER')
  })
})

describe('device usage sequence', () => {
  it('is the nine verified steps, in order, each drawn', () => {
    expect(DEVICE_STEPS).toHaveLength(9)
    DEVICE_STEPS.forEach((step, index) => {
      expect(step.src).toBe(`/guides/${step.file}`)
      expect(step.file).toMatch(/^device-0\d-[a-z-]+\.svg$/)
      expect(guideFiles).toContain(step.file)
      expect(step.file.startsWith(`device-0${index + 1}-`)).toBe(true)
    })
  })

  it('leaves out device-10, which the guides README records as unverified', () => {
    expect(guideFiles).toContain('device-10-charge-battery.svg')
    expect(DEVICE_STEPS.some((step) => step.file.startsWith('device-10'))).toBe(false)
  })

  it('gives each step a caption key of its own', () => {
    const keys = DEVICE_STEPS.map((step) => deviceStepCaptionKey(step))
    expect(new Set(keys).size).toBe(DEVICE_STEPS.length)
    expect(keys[0]).toBe('guide.device.powerOn')
  })
})

describe('mistake diagrams', () => {
  it('points every referenced flag at a diagram that exists', () => {
    for (const src of Object.values(MISTAKE_GUIDE_FOR_FLAG)) {
      if (src === undefined) continue
      expect(guideFiles).toContain(src.replace('/guides/', ''))
    }
  })

  it('offers no diagram for flags no drawing covers', () => {
    // Nothing in public/guides/ depicts a too-short recording or a DC-biased
    // capture chain, and pointing at an unrelated picture would mislead.
    expect(MISTAKE_GUIDE_FOR_FLAG['too-short']).toBeUndefined()
    expect(MISTAKE_GUIDE_FOR_FLAG['dc-offset']).toBeUndefined()
  })
})
