import { MEASUREMENT_CODES, MEASUREMENT_SOURCES } from '../../db/codes'
import type { MeasurementCode } from '../../db/codes'
import type { Measurement } from '../../db/types'

/**
 * The vital-signs form, as data.
 *
 * Three rules drive everything below.
 *
 * 1. Every field is optional. These clinics often have no pulse oximeter, no
 *    thermometer and no cuff, and an assessment recorded without them is a
 *    complete assessment — not a half-finished one. Nothing here can block a
 *    submission.
 *
 * 2. The ranges reject the impossible and accept the abnormal. A patient in
 *    distress has vitals a "normal range" validator would refuse, and a form
 *    that argues with the reading in front of the health worker gets the
 *    reading changed to fit the form. So the bounds are the bounds of human
 *    physiology and of the instruments, not the bounds of health.
 *
 * 3. `RESP_RATE_MANUAL` and `RESP_RATE_AUSC_DERIVED` are two different
 *    measurements of the same thing and must never stand in for each other.
 *    This screen writes the manual one and only the manual one; the derived
 *    code is absent from `VITAL_FIELDS` on purpose, because no validated
 *    algorithm produces it yet. Deriving a respiratory rate from the audio and
 *    storing it under the manual code — or overwriting a counted rate with an
 *    estimated one — would put a number a clinician trusts as counted into a
 *    field nobody counted.
 */

export interface VitalFieldSpec {
  code: MeasurementCode
  unit: string
  /** Inclusive. Below this the value is not a reading, it is a typo. */
  min: number
  max: number
  /** 0 = whole numbers only. Temperature is the one field with a decimal. */
  decimals: 0 | 1
  inputMode: 'numeric' | 'decimal'
}

/**
 * Bounds, and why each one is where it is:
 *
 * - SpO2 40–100 %: consumer oximeters stop reporting below roughly 35–40, and
 *   100 is the ceiling of the scale.
 * - Respiratory rate 4–80 /min: a newborn breathes up to about 60, and severe
 *   distress goes higher; 4 is agonal but real.
 * - Heart rate 20–250 bpm: covers profound bradycardia through infant SVT.
 * - Temperature 25–45 °C: the survivable span of recorded body temperature.
 * - BP 40–300 / 20–200 mmHg: shock at one end, hypertensive crisis at the other.
 */
export const VITAL_FIELDS: readonly VitalFieldSpec[] = [
  { code: MEASUREMENT_CODES.SPO2, unit: '%', min: 40, max: 100, decimals: 0, inputMode: 'numeric' },
  {
    code: MEASUREMENT_CODES.RESP_RATE_MANUAL,
    unit: 'breaths/min',
    min: 4,
    max: 80,
    decimals: 0,
    inputMode: 'numeric',
  },
  {
    code: MEASUREMENT_CODES.HEART_RATE,
    unit: 'bpm',
    min: 20,
    max: 250,
    decimals: 0,
    inputMode: 'numeric',
  },
  { code: MEASUREMENT_CODES.TEMP, unit: '°C', min: 25, max: 45, decimals: 1, inputMode: 'decimal' },
  {
    code: MEASUREMENT_CODES.BP_SYS,
    unit: 'mmHg',
    min: 40,
    max: 300,
    decimals: 0,
    inputMode: 'numeric',
  },
  {
    code: MEASUREMENT_CODES.BP_DIA,
    unit: 'mmHg',
    min: 20,
    max: 200,
    decimals: 0,
    inputMode: 'numeric',
  },
]

export type VitalKey = (typeof VITAL_FIELDS)[number]['code']

/** Raw text, one entry per field. Empty string means "not measured". */
export type VitalsDraft = Record<string, string>

/** An error with the words it needs, resolved against the assessment bundle. */
export interface VitalError {
  key: string
  params?: Record<string, string | number>
}

export function emptyVitalsDraft(): VitalsDraft {
  return Object.fromEntries(VITAL_FIELDS.map((field) => [field.code, '']))
}

/**
 * Rebuilds the form from what is stored, so stepping back shows the readings
 * already entered. A derived respiratory rate that somehow exists on the
 * assessment is ignored rather than loaded into the manual box — loading it
 * would let a save turn an estimate into a counted measurement.
 */
export function fromMeasurements(vitals: readonly Measurement[]): VitalsDraft {
  const draft = emptyVitalsDraft()
  for (const vital of vitals) {
    if (!(vital.code in draft)) continue
    if (vital.source !== MEASUREMENT_SOURCES.MANUAL_ENTRY) continue
    draft[vital.code] = String(vital.value)
  }
  return draft
}

function fieldError(field: VitalFieldSpec, raw: string): VitalError | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const pattern = field.decimals === 0 ? /^\d+$/ : /^\d+(\.\d+)?$/
  if (!pattern.test(trimmed)) {
    return field.decimals === 0 ? { key: 'vitals.error.wholeNumber' } : { key: 'vitals.error.number' }
  }

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < field.min || value > field.max) {
    return {
      key: 'vitals.error.range',
      params: { min: field.min, max: field.max, unit: field.unit },
    }
  }
  return null
}

/**
 * Everything wrong with the form, keyed by field.
 *
 * Blood pressure is checked as a pair because half a blood pressure is not a
 * blood pressure: a lone diastolic tells a reviewer nothing, and a diastolic
 * at or above the systolic is a transcription slip every time.
 */
export function validateVitals(draft: VitalsDraft): Record<string, VitalError> {
  const errors: Record<string, VitalError> = {}

  for (const field of VITAL_FIELDS) {
    const error = fieldError(field, draft[field.code] ?? '')
    if (error !== null) errors[field.code] = error
  }

  const sys = (draft[MEASUREMENT_CODES.BP_SYS] ?? '').trim()
  const dia = (draft[MEASUREMENT_CODES.BP_DIA] ?? '').trim()
  const sysBad = errors[MEASUREMENT_CODES.BP_SYS] !== undefined
  const diaBad = errors[MEASUREMENT_CODES.BP_DIA] !== undefined

  if (sys !== '' && dia === '' && !sysBad) {
    errors[MEASUREMENT_CODES.BP_DIA] = { key: 'vitals.error.bpNeedsDiastolic' }
  } else if (dia !== '' && sys === '' && !diaBad) {
    errors[MEASUREMENT_CODES.BP_SYS] = { key: 'vitals.error.bpNeedsSystolic' }
  } else if (sys !== '' && dia !== '' && !sysBad && !diaBad && Number(dia) >= Number(sys)) {
    errors[MEASUREMENT_CODES.BP_DIA] = { key: 'vitals.error.bpOrder' }
  }

  return errors
}

export interface MeasurementContext {
  /** The signed-in user. Provenance is part of the value, not metadata. */
  enteredBy: string
  enteredAt: string
}

/**
 * The draft as it is stored: one `Measurement` per field that has a reading,
 * and nothing at all for a field left blank.
 *
 * Every value is `MANUAL_ENTRY`, because a person typed it. Nothing on this
 * screen may ever be written as `AUSCULTATION_DERIVED`.
 */
export function toMeasurements(draft: VitalsDraft, context: MeasurementContext): Measurement[] {
  const measurements: Measurement[] = []
  for (const field of VITAL_FIELDS) {
    const raw = (draft[field.code] ?? '').trim()
    if (raw === '') continue
    if (fieldError(field, raw) !== null) continue
    measurements.push({
      code: field.code,
      value: Number(raw),
      unit: field.unit,
      source: MEASUREMENT_SOURCES.MANUAL_ENTRY,
      enteredBy: context.enteredBy,
      enteredAt: context.enteredAt,
    })
  }
  return measurements
}
