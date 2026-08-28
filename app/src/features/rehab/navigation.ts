/**
 * Where the rehabilitation module lives, as data.
 *
 * Kept separate from the routes and from the screens so the app router (owned
 * elsewhere) and any shell that wants to link here can both read the paths
 * without importing a screen component.
 *
 * `/rehab` is a top-level path rather than a child of `/patient`, so a
 * practitioner or a validator can reach the safety content without being
 * signed in as a patient. The patient shell links to the same screens.
 */

export const REHAB_ROOT = '/rehab'

export const REHAB_PATHS = {
  home: REHAB_ROOT,
  /**
   * Red flags. One tap from the rehab home, and deliberately the shortest,
   * most guessable URL in the feature — this is the screen that matters if a
   * person only ever finds one.
   */
  safety: `${REHAB_ROOT}/safety`,
  plan: `${REHAB_ROOT}/plan`,
  techniques: `${REHAB_ROOT}/techniques`,
} as const

/** The path of one technique's detail screen. */
export function techniquePath(techniqueCode: string): string {
  return `${REHAB_PATHS.techniques}/${encodeURIComponent(techniqueCode)}`
}

/** Route pattern for the technique detail screen. */
export const TECHNIQUE_ROUTE_PATTERN = `${REHAB_PATHS.techniques}/:techniqueCode`
