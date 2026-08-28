import type { QualityFlagCode } from '../../audio'
import { LOCATION_CODES, type LocationCode } from '../../db/codes'

/**
 * The instructional diagrams in `public/guides/`, addressed by name.
 *
 * The drawings are text-free on purpose (the app is bilingual), so every one
 * of them is a pair: a URL from here and a caption key resolved through
 * `useTranslation('assessment')`. Nothing in this file returns prose.
 *
 * `guides.test.ts` checks these references against the files actually on disk
 * and against `public/guides/README.md`, so a renamed or deleted drawing fails
 * the suite instead of rendering a broken image to a health worker.
 */

const GUIDES_BASE = '/guides'

// ---------------------------------------------------------------------------
// Auscultation positions
// ---------------------------------------------------------------------------

/**
 * The six positions in listening order — right/left pairs, top to bottom.
 *
 * This order IS the numbering baked into `lung-map-overview.svg` and into the
 * README's captions ("Position 1 …"). The numbers are drawn into the artwork
 * as vector paths, so they cannot be reordered here alone: a health worker
 * reads the number off the picture. `guides.test.ts` parses the README and
 * asserts the two agree.
 */
export const LOCATION_ORDER: readonly LocationCode[] = [
  LOCATION_CODES.R_UPPER,
  LOCATION_CODES.L_UPPER,
  LOCATION_CODES.R_MIDDLE,
  LOCATION_CODES.L_MIDDLE,
  LOCATION_CODES.R_LOWER,
  LOCATION_CODES.L_LOWER,
]

/** The 1-based position number a health worker sees on the diagrams. */
export function lungPositionNumber(code: LocationCode): number {
  return LOCATION_ORDER.indexOf(code) + 1
}

/** The picker artwork: all six positions at once, as numbered targets. */
export const LUNG_MAP_SRC = `${GUIDES_BASE}/lung-map-overview.svg`

/** The picker artwork's own coordinate system. */
export const LUNG_MAP_VIEWBOX = { width: 320, height: 340 } as const

/**
 * Where each position's target sits inside `lung-map-overview.svg`, in that
 * file's own viewBox units, so the app's tap targets land on the drawn circles.
 *
 * ORIENTATION — read the guides README before changing a number here. The
 * figure is drawn ANTERIOR: the viewer faces the patient, so the patient's
 * RIGHT lung appears on the viewer's LEFT, at a SMALLER x. Getting this
 * backwards would file a recording under the wrong lung and produce
 * mis-attributed clinical data, so `guides.test.ts` asserts every `R_` marker
 * sits left of the midline and every `L_` marker right of it.
 */
export const LUNG_MAP_MARKERS: Record<LocationCode, { x: number; y: number }> = {
  [LOCATION_CODES.R_UPPER]: { x: 134, y: 136 },
  [LOCATION_CODES.L_UPPER]: { x: 186, y: 136 },
  [LOCATION_CODES.R_MIDDLE]: { x: 130, y: 192 },
  [LOCATION_CODES.L_MIDDLE]: { x: 190, y: 192 },
  [LOCATION_CODES.R_LOWER]: { x: 127, y: 246 },
  [LOCATION_CODES.L_LOWER]: { x: 193, y: 246 },
}

/** The single-position drawing for one auscultation site. */
export function placementGuideSrc(code: LocationCode): string {
  return `${GUIDES_BASE}/placement-${code}.svg`
}

/** Caption for one placement drawing. Lives in `assessment.json`. */
export function placementCaptionKey(code: LocationCode): string {
  return `guide.placement.${code}`
}

// ---------------------------------------------------------------------------
// Device usage sequence
// ---------------------------------------------------------------------------

export interface DeviceStep {
  /** File name in `public/guides/`, which carries the step's own number. */
  file: string
  /** Suffix of the caption key, `guide.device.<slug>`. */
  slug: string
  src: string
}

/**
 * Steps 1 to 9 of using the recorder, in the order they are performed.
 *
 * `device-10-charge-battery.svg` is deliberately absent. The guides README
 * records it as UNVERIFIED — the wiring diagram draws no charging module, so
 * the drawing assumes charging happens through the ESP32's own micro-USB port
 * and nobody has confirmed that against the physical device. Showing a health
 * worker an unverified instruction about mains power is not a risk worth
 * taking for a step they can be told in person. Add it here once the hardware
 * is checked.
 */
export const DEVICE_STEPS: readonly DeviceStep[] = (
  [
    { file: 'device-01-power-on.svg', slug: 'powerOn' },
    { file: 'device-02-insert-sd.svg', slug: 'insertCard' },
    { file: 'device-03-place-chest.svg', slug: 'placeChest' },
    { file: 'device-04-press-record.svg', slug: 'pressRecord' },
    { file: 'device-05-recording.svg', slug: 'recording' },
    { file: 'device-06-stop-save.svg', slug: 'stopSave' },
    { file: 'device-07-remove-sd.svg', slug: 'removeCard' },
    { file: 'device-08-import-to-app.svg', slug: 'importToApp' },
    { file: 'device-09-clean.svg', slug: 'clean' },
  ] as const
).map((step) => ({ file: step.file, slug: step.slug, src: `${GUIDES_BASE}/${step.file}` }))

export function deviceStepCaptionKey(step: DeviceStep): string {
  return `guide.device.${step.slug}`
}

// ---------------------------------------------------------------------------
// Recording mistakes
// ---------------------------------------------------------------------------

const MISTAKE = {
  overClothing: `${GUIDES_BASE}/mistake-01-over-clothing.svg`,
  looseContact: `${GUIDES_BASE}/mistake-02-loose-contact.svg`,
  talkingMoving: `${GUIDES_BASE}/mistake-03-talking-moving.svg`,
  noisyRoom: `${GUIDES_BASE}/mistake-04-noisy-room.svg`,
} as const

/**
 * The wrong/right drawing that best explains each quality flag.
 *
 * The quality gate is the only thing that tells a health worker why a
 * recording was refused, and "insufficient quality" on its own teaches nobody
 * anything. Each mapping below is the most likely cause of that measurement in
 * a clinic room:
 *
 * - `silence` — almost nothing reached the bell, which is a gap under the rim.
 * - `clipping` — the loudest transients in a recording are handling knocks and
 *   the patient shifting about.
 * - `noise-like` — a flat, broadband spectrum is room noise, not a lung.
 * - `tonal` — the tonal source in a clinic is a human voice.
 * - `hf-dominant` — hiss concentrated above 4 kHz is fabric friction.
 *
 * `too-short` and `dc-offset` map to nothing: no drawing depicts either, and
 * a short recording is fixed by recording for longer while a DC-biased capture
 * chain is a hardware fault, not a technique the diagrams could correct.
 */
export const MISTAKE_GUIDE_FOR_FLAG: Partial<Record<QualityFlagCode, string>> = {
  silence: MISTAKE.looseContact,
  clipping: MISTAKE.talkingMoving,
  'clipping-warn': MISTAKE.talkingMoving,
  'noise-like': MISTAKE.noisyRoom,
  tonal: MISTAKE.talkingMoving,
  'hf-dominant': MISTAKE.overClothing,
}

/** Caption for a mistake drawing, keyed by the flag that summoned it. */
export function mistakeCaptionKey(code: QualityFlagCode): string {
  return `quality.advice.${code}`
}
