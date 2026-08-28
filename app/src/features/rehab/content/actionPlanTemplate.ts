import type { CitationId } from './citations'

/**
 * The shape of an asthma action plan — a template of blanks, nothing more.
 *
 * This module describes *which fields exist*. It contains no clinical values
 * whatsoever, because every value in a real plan belongs to a clinician:
 * symptom descriptions, breathing-rate thresholds, peak-flow numbers, medicine
 * names, doses and puff counts, and the emergency-care threshold. Ausculta
 * renders the blanks and shows what a practitioner wrote in them. It never
 * fills one in, never guesses one, never derives one from a recording, and
 * never generates a plan.
 *
 * ## Where the structure comes from
 *
 * The symptom-based Written Asthma Action Plan in the Philippine national
 * pediatric asthma guideline (PAPP 2021, Appendix 1A) — the national template
 * for this app's actual population. Its structure:
 *
 * - a contact block at the top: doctor, doctor's phone, emergency contact and
 *   their phone;
 * - three zones — green (asthma controlled), yellow (mild to moderate attack),
 *   red (severe attack);
 * - a resting respiratory rate in every zone, because counting breaths needs no
 *   equipment at all and this is a template designed for clinics that have
 *   none. The green zone prints an age reference; yellow and red are blanks for
 *   the clinician;
 * - **peak flow marked optional** — the national template's own wording is
 *   "if you have this: peak flow…". These clinics do not have peak flow meters,
 *   so `PEAK_FLOW` is `optional: true` and the UI says why;
 * - every medication instruction a blank.
 *
 * The guideline calls its own version "only a sample WAAP" that readers should
 * culturally adapt — even the national body treats this as a clinician-adapted
 * template rather than a finished artifact, which is the strongest possible
 * argument against software generating one.
 */

export const ACTION_PLAN_TEMPLATE_ID = 'PAPP_2021_WAAP_SYMPTOM_BASED'

export const ACTION_PLAN_CITATION: CitationId = 'PAPP_2021'

/**
 * A second citation for the plan concept itself: GINA requires a written plan
 * for every patient, agreed with a clinician, and allows it to be digital.
 */
export const ACTION_PLAN_SUPPORTING_CITATIONS: readonly CitationId[] = [
  'PAPP_2021',
  'GINA_2023_POCKET',
]

export const PLAN_ZONES = ['GREEN', 'YELLOW', 'RED'] as const
export type PlanZone = (typeof PLAN_ZONES)[number]

export const PLAN_FIELDS = [
  'howYouFeel',
  'respiratoryRate',
  'peakFlow',
  'medicines',
  'whatToDo',
] as const
export type PlanField = (typeof PLAN_FIELDS)[number]

export interface PlanFieldSpec {
  field: PlanField
  /**
   * Optional fields render with an explanation of why they may be blank rather
   * than as an unfilled gap. Peak flow is optional in the national template
   * itself, and these clinics have no meters.
   */
  optional: boolean
  /**
   * True when nothing but a licensed clinician may ever supply this value.
   * The UI states it beside the field, so a patient never expects the app to
   * fill it and a validator can see the boundary is deliberate.
   */
  clinicianOnly: boolean
}

export const PLAN_FIELD_SPECS: readonly PlanFieldSpec[] = [
  { field: 'howYouFeel', optional: false, clinicianOnly: true },
  { field: 'respiratoryRate', optional: false, clinicianOnly: true },
  { field: 'peakFlow', optional: true, clinicianOnly: true },
  { field: 'medicines', optional: false, clinicianOnly: true },
  { field: 'whatToDo', optional: false, clinicianOnly: true },
]

export const CONTACT_FIELDS = [
  'doctorName',
  'doctorPhone',
  'emergencyName',
  'emergencyPhone',
] as const
export type ContactField = (typeof CONTACT_FIELDS)[number]

/** i18n key for a zone's name. */
export function zoneNameKey(zone: PlanZone): string {
  return `rehab:plan.zone.${zone}.name`
}

/** i18n key for the one-word state a zone describes. */
export function zoneStateKey(zone: PlanZone): string {
  return `rehab:plan.zone.${zone}.state`
}

/** i18n key for what a zone means, in plain language. */
export function zoneMeaningKey(zone: PlanZone): string {
  return `rehab:plan.zone.${zone}.meaning`
}

/** i18n key for a field's label. */
export function planFieldKey(field: PlanField): string {
  return `rehab:plan.field.${field}`
}
