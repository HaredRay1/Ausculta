/**
 * Where a patient can go, and what it is called.
 *
 * Kept as data, separate from the routes and from the shell, for two reasons:
 * the app router owns the route table (this feature must not edit it) and the
 * host shell needs the nav list without pulling in every screen component.
 *
 * Five entries exactly — the BottomNav ceiling, below which a 48px target stops
 * fitting on a 360px screen. Every entry carries a text label as well as an
 * icon: the validation protocol has people find features unaided, and a row of
 * unlabelled glyphs is a guessing game.
 */

export const PATIENT_ROOT = '/patient'

export type PatientNavId = 'home' | 'results' | 'trends' | 'history' | 'rehab'

export const PATIENT_PATHS = {
  home: PATIENT_ROOT,
  results: `${PATIENT_ROOT}/results`,
  recordings: `${PATIENT_ROOT}/recordings`,
  trends: `${PATIENT_ROOT}/trends`,
  history: `${PATIENT_ROOT}/history`,
  rehab: `${PATIENT_ROOT}/rehab`,
} as const

/** The path of one assessment's full result. */
export function resultDetailPath(assessmentId: string): string {
  return `${PATIENT_PATHS.results}/${encodeURIComponent(assessmentId)}`
}

export interface PatientNavEntry {
  id: PatientNavId
  path: string
  /** i18n key in the `patient` namespace. */
  labelKey: string
}

/**
 * Bottom-navigation order.
 *
 * "My results" sits immediately beside Home and second in the bar because the
 * scored validator task is *"find where you can view your respiratory
 * assessment results"* — it has to be the most obvious destination in the app,
 * from anywhere, in one tap.
 */
export const PATIENT_NAV: readonly PatientNavEntry[] = [
  { id: 'home', path: PATIENT_PATHS.home, labelKey: 'patient:nav.home' },
  { id: 'results', path: PATIENT_PATHS.results, labelKey: 'patient:nav.results' },
  { id: 'trends', path: PATIENT_PATHS.trends, labelKey: 'patient:nav.trends' },
  { id: 'history', path: PATIENT_PATHS.history, labelKey: 'patient:nav.history' },
  { id: 'rehab', path: PATIENT_PATHS.rehab, labelKey: 'patient:nav.rehab' },
]
