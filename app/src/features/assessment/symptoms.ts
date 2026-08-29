import { SYMPTOM_CODES, SYMPTOM_FREQUENCIES, SYMPTOM_SEVERITIES } from '../../db/codes'
import type { SymptomCode, SymptomFrequency, SymptomSeverity } from '../../db/codes'
import type { SymptomEntry } from '../../db/types'

/**
 * The symptom questionnaire, as data.
 *
 * Kept out of the screen so the one rule that matters here can be read, and
 * tested, in isolation:
 *
 *   A symptom nobody answered is ABSENT from `Assessment.symptoms`.
 *
 * `present: false` is a clinical statement — asked, and answered no — and a
 * practitioner reading the review screen weighs it as one. Pre-filling the
 * array with twelve falses would turn "we ran out of time" into "the patient
 * denied every symptom", which is a fabricated history. So the draft carries a
 * third state, `null`, and `toSymptomEntries` drops it.
 */

/** Nothing here is a diagnosis: this is the order the questions are asked in. */
export const SYMPTOM_ORDER: readonly SymptomCode[] = [
  SYMPTOM_CODES.COUGH,
  SYMPTOM_CODES.PHLEGM,
  SYMPTOM_CODES.SHORTNESS_OF_BREATH,
  SYMPTOM_CODES.DIFFICULTY_BREATHING,
  SYMPTOM_CODES.WHEEZING_REPORTED,
  SYMPTOM_CODES.CHEST_DISCOMFORT,
  SYMPTOM_CODES.FEVER,
  SYMPTOM_CODES.FATIGUE,
  SYMPTOM_CODES.NIGHT_SWEATS,
  SYMPTOM_CODES.HEMOPTYSIS,
  SYMPTOM_CODES.WEIGHT_LOSS,
  SYMPTOM_CODES.OTHER,
]

export const SEVERITY_ORDER: readonly SymptomSeverity[] = [
  SYMPTOM_SEVERITIES.MILD,
  SYMPTOM_SEVERITIES.MODERATE,
  SYMPTOM_SEVERITIES.SEVERE,
]

export const FREQUENCY_ORDER: readonly SymptomFrequency[] = [
  SYMPTOM_FREQUENCIES.OCCASIONAL,
  SYMPTOM_FREQUENCIES.INTERMITTENT,
  SYMPTOM_FREQUENCIES.PERSISTENT,
]

/** Ten years. Longer than this is a typo, not a history. */
export const MAX_DURATION_DAYS = 3650

/**
 * One row of the form. `present: null` is the initial state and means the
 * question has not been put to the patient yet — it is not a "no".
 */
export interface SymptomAnswer {
  present: boolean | null
  /** '' means "not recorded", which is allowed: the detail fields are optional. */
  severityCode: SymptomSeverity | ''
  durationDays: string
  frequencyCode: SymptomFrequency | ''
  notes: string
}

export type SymptomDraft = Record<SymptomCode, SymptomAnswer>

export const UNANSWERED: SymptomAnswer = {
  present: null,
  severityCode: '',
  durationDays: '',
  frequencyCode: '',
  notes: '',
}

export function emptySymptomDraft(): SymptomDraft {
  return Object.fromEntries(
    SYMPTOM_ORDER.map((code) => [code, { ...UNANSWERED }]),
  ) as SymptomDraft
}

/**
 * Rebuilds the form from what is already stored, so stepping back into the
 * screen shows the answers rather than a blank sheet. A code missing from
 * `entries` stays unanswered — the round trip preserves "not asked".
 */
export function fromSymptomEntries(entries: readonly SymptomEntry[]): SymptomDraft {
  const draft = emptySymptomDraft()
  for (const entry of entries) {
    if (draft[entry.code] === undefined) continue
    draft[entry.code] = {
      present: entry.present,
      severityCode: entry.severityCode ?? '',
      durationDays: entry.durationDays === undefined ? '' : String(entry.durationDays),
      frequencyCode: entry.frequencyCode ?? '',
      notes: entry.notes ?? '',
    }
  }
  return draft
}

/** i18n key of the problem with a duration, or null when it is usable. */
export function durationError(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return 'symptoms.error.durationNumber'
  const days = Number(trimmed)
  if (days > MAX_DURATION_DAYS) return 'symptoms.error.durationRange'
  return null
}

export function draftErrors(draft: SymptomDraft): Partial<Record<SymptomCode, string>> {
  const errors: Partial<Record<SymptomCode, string>> = {}
  for (const code of SYMPTOM_ORDER) {
    const answer = draft[code]
    // Detail only exists on a "yes", so only a "yes" can carry a bad duration.
    if (answer.present !== true) continue
    const error = durationError(answer.durationDays)
    if (error !== null) errors[code] = error
  }
  return errors
}

/**
 * The draft as it is stored.
 *
 * Unanswered rows are dropped entirely. On a "no", the detail fields are
 * dropped too — a severity attached to a symptom the patient denies is
 * meaningless and would read as a contradiction on the review screen. A free
 * note survives either way, because "no cough since Tuesday" is a real answer.
 */
export function toSymptomEntries(draft: SymptomDraft): SymptomEntry[] {
  const entries: SymptomEntry[] = []
  for (const code of SYMPTOM_ORDER) {
    const answer = draft[code]
    if (answer.present === null) continue

    const notes = answer.notes.trim()
    if (answer.present === false) {
      entries.push({ code, present: false, ...(notes !== '' && { notes }) })
      continue
    }

    const duration = answer.durationDays.trim()
    const hasDuration = duration !== '' && durationError(duration) === null
    entries.push({
      code,
      present: true,
      ...(answer.severityCode !== '' && { severityCode: answer.severityCode }),
      ...(hasDuration && { durationDays: Number(duration) }),
      ...(answer.frequencyCode !== '' && { frequencyCode: answer.frequencyCode }),
      ...(notes !== '' && { notes }),
    })
  }
  return entries
}

/** How many questions have been put to the patient, for the progress line. */
export function answeredCount(draft: SymptomDraft): number {
  return SYMPTOM_ORDER.filter((code) => draft[code].present !== null).length
}
