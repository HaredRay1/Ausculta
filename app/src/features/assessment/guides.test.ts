import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCATION_CODES } from '../../db/codes'
import {
  DEVICE_STEPS,
  LOCATION_ORDER,
  LUNG_MAP_SRC,
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
