import type { CitationId } from './citations'

/**
 * Red flags — when to stop, and when to get medical care.
 *
 * This is the highest-value content in the rehabilitation module and the part
 * that protects a user regardless of what else ships. It is also the only part
 * that is entirely generic education: identical for every patient, no numbers
 * chosen for anyone in particular, and therefore safe for software to author.
 *
 * Three tiers, deliberately not one list:
 *
 * - `EMERGENCY` — get medical care now. Any single one is enough.
 * - `WORSENING` — the asthma is deteriorating. Follow the practitioner's plan
 *   and contact them. Not the same instruction, so not the same list.
 * - `NON_ACUTE` — a two-week cough. Not an emergency at all, but a
 *   tuberculosis screening prompt that must not be waved away as "just
 *   asthma" in a TB-endemic setting.
 *
 * ## What is deliberately absent
 *
 * No dose, no puff count, no severity score, no triage decision. The Philippine
 * guideline's referral criteria include "no response after 6 puffs of a
 * reliever" — that number is a medication instruction, so it is rendered here
 * as "you used your reliever the way your practitioner told you and it is not
 * helping" instead. The app's job is to say *this needs medical care now* and
 * show the escalation instructions and contacts a clinician already wrote down.
 *
 * Two numeric oxygen thresholds do appear (94% and 92%). They are read directly
 * from the Philippine national pediatric guideline, they are explicitly
 * conditioned on the family owning the equipment, and they are not app-derived.
 * Every equipment-dependent item carries `requiresEquipment`, which the UI
 * renders as a condition rather than hiding — a family that has a device should
 * be told what to do with it.
 */

export const RED_FLAG_URGENCY = {
  EMERGENCY: 'EMERGENCY',
  WORSENING: 'WORSENING',
  NON_ACUTE: 'NON_ACUTE',
} as const

export type RedFlagUrgency = (typeof RED_FLAG_URGENCY)[keyof typeof RED_FLAG_URGENCY]

export const RED_FLAG_EQUIPMENT = {
  PULSE_OXIMETER: 'PULSE_OXIMETER',
  PEAK_FLOW_METER: 'PEAK_FLOW_METER',
} as const

export type RedFlagEquipment = (typeof RED_FLAG_EQUIPMENT)[keyof typeof RED_FLAG_EQUIPMENT]

export interface RedFlag {
  id: string
  urgency: RedFlagUrgency
  citations: readonly CitationId[]
  /** Present only when the sign cannot be checked without a device. */
  requiresEquipment?: RedFlagEquipment
}

/**
 * Order matters. Within `EMERGENCY` the first four are the signs a person can
 * check on someone else across a room, which is what a caregiver actually does
 * during an attack.
 */
export const RED_FLAGS: readonly RedFlag[] = [
  /* ---- Get help now ----------------------------------------------------- */
  {
    id: 'RELIEVER_NOT_HELPING',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['ASTHMA_LUNG_UK', 'PAPP_2021'],
  },
  {
    id: 'CANNOT_SPEAK_FULL_SENTENCE',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['CDC_WHO_GINA_DANGER_SIGNS', 'PAPP_2021'],
  },
  {
    id: 'CYANOSIS',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['CDC_WHO_GINA_DANGER_SIGNS', 'PAPP_2021'],
  },
  {
    id: 'CONFUSED_OR_DROWSY',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['CDC_WHO_GINA_DANGER_SIGNS'],
  },
  {
    id: 'RETRACTIONS_STRUGGLING',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['CDC_WHO_GINA_DANGER_SIGNS', 'PAPP_2021'],
  },
  {
    id: 'VERY_FAST_BREATHING',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['PAPP_2021', 'CDC_WHO_GINA_DANGER_SIGNS'],
  },
  {
    id: 'SILENT_CHEST',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['CDC_WHO_GINA_DANGER_SIGNS', 'PAPP_2021'],
  },
  {
    id: 'FAINTING_DIZZY_COLD_SWEAT',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['CDC_WHO_GINA_DANGER_SIGNS'],
  },
  {
    id: 'CHEST_PAIN_EXERCISE',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['JOHNS_HOPKINS_CHEST_PAIN'],
  },
  {
    id: 'RELIEF_PERIOD_SHORTENING',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['PAPP_2021'],
  },
  {
    id: 'INFANT_REPEATED_RELIEVER',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['PAPP_2021'],
  },
  {
    id: 'CANNOT_TREAT_AT_HOME',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['PAPP_2021'],
  },
  {
    id: 'OXYGEN_BELOW_92',
    urgency: RED_FLAG_URGENCY.EMERGENCY,
    citations: ['PAPP_2021'],
    requiresEquipment: RED_FLAG_EQUIPMENT.PULSE_OXIMETER,
  },

  /* ---- Getting worse ----------------------------------------------------- */
  {
    id: 'MORE_WHEEZE_AND_BREATHLESS',
    urgency: RED_FLAG_URGENCY.WORSENING,
    citations: ['PAPP_2021'],
  },
  {
    id: 'FAST_BREATHING_RETRACTIONS',
    urgency: RED_FLAG_URGENCY.WORSENING,
    citations: ['PAPP_2021'],
  },
  {
    id: 'MORE_COUGHING_AT_NIGHT',
    urgency: RED_FLAG_URGENCY.WORSENING,
    citations: ['PAPP_2021'],
  },
  {
    id: 'LESS_ACTIVE_TIRED',
    urgency: RED_FLAG_URGENCY.WORSENING,
    citations: ['PAPP_2021'],
  },
  {
    id: 'DAILY_ACTIVITIES_AFFECTED',
    urgency: RED_FLAG_URGENCY.WORSENING,
    citations: ['PAPP_2021'],
  },
  {
    id: 'POOR_RESPONSE_TO_RELIEVER',
    urgency: RED_FLAG_URGENCY.WORSENING,
    citations: ['PAPP_2021'],
  },
  {
    id: 'SPO2_BELOW_94',
    urgency: RED_FLAG_URGENCY.WORSENING,
    citations: ['PAPP_2021'],
    requiresEquipment: RED_FLAG_EQUIPMENT.PULSE_OXIMETER,
  },
  {
    id: 'PEAK_FLOW_BELOW_80',
    urgency: RED_FLAG_URGENCY.WORSENING,
    citations: ['PAPP_2021', 'ASTHMA_LUNG_UK'],
    requiresEquipment: RED_FLAG_EQUIPMENT.PEAK_FLOW_METER,
  },

  /* ---- Not acute, still not ignorable ------------------------------------ */
  {
    id: 'COUGH_TWO_WEEKS_TB',
    urgency: RED_FLAG_URGENCY.NON_ACUTE,
    citations: ['DOH_NTP_WHO_TB'],
  },
]

export function redFlagsByUrgency(urgency: RedFlagUrgency): RedFlag[] {
  return RED_FLAGS.filter((flag) => flag.urgency === urgency)
}

/** i18n key for a red flag's headline. */
export function redFlagTitleKey(id: string): string {
  return `rehab:safety.flag.${id}.title`
}

/** i18n key for a red flag's explanation. */
export function redFlagDetailKey(id: string): string {
  return `rehab:safety.flag.${id}.detail`
}

/**
 * Resting respiratory rate reference, by age.
 *
 * Taken from the age bands printed on the Philippine national pediatric
 * Written Asthma Action Plan, which is the version written for patients and
 * families. The same guideline's hospital-referral section gives slightly
 * different figures because it is answering a different question; the
 * discrepancy is shown to the user rather than silently resolved.
 *
 * This is a general reference, not a threshold set for any individual. The plan
 * viewer never copies these numbers into a patient's plan — only a clinician
 * fills a patient's zone thresholds in.
 */
export const RESPIRATORY_RATE_BANDS = ['M1_12', 'Y1_5', 'Y6_10', 'Y11_18'] as const

export type RespiratoryRateBand = (typeof RESPIRATORY_RATE_BANDS)[number]

export const RESPIRATORY_RATE_CITATION: CitationId = 'PAPP_2021'
