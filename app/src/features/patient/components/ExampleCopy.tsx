import { createContext, useContext, type ReactNode } from 'react'

/**
 * Whether the record on screen is a demonstration rather than the reader's own.
 *
 * The patient portal speaks in the second person throughout — "your breathing
 * sounds", "places on your chest" — which is right, and warm, when someone is
 * reading their own record. It becomes a false statement the moment they are
 * looking at an example, and the banner underneath does not rescue it: the
 * possessive copy is the primary content and reads as fact, while a banner
 * reads as a footnote. That is the same argument that made the greeting wrong,
 * applied to the sentences around it.
 *
 * Rather than every screen threading a flag into every string, the flag is
 * provided once and each affected call site spreads `useExampleCopy()`. That
 * uses i18next's `context` mechanism: `t('home.subtitle', { context:
 * 'example' })` resolves `home.subtitle_example` and falls back to
 * `home.subtitle` on its own when no variant exists — so a missed variant
 * degrades to the existing wording rather than to a missing key.
 */
const ExampleCopyContext = createContext(false)

export function ExampleCopyProvider({
  example,
  children,
}: {
  example: boolean
  children: ReactNode
}) {
  return <ExampleCopyContext.Provider value={example}>{children}</ExampleCopyContext.Provider>
}

/**
 * Spread into any `t()` whose wording would otherwise claim the data belongs to
 * the reader. Returns an empty object for a real record, so the ordinary
 * second-person copy is untouched.
 *
 * For components rendered INSIDE PatientScreen's provider -- the ones deep in
 * the tree that never see the overview.
 */
export function useExampleCopy(): { context?: string } {
  return useContext(ExampleCopyContext) ? { context: 'example' } : {}
}

/**
 * The same thing, from a flag you already hold.
 *
 * A page component calls `usePatientOverview` indirectly, through
 * PatientScreen's children callback: its own render runs OUTSIDE the provider,
 * because the provider is inside PatientScreen, which is its child. So a page
 * calling `useExampleCopy()` at the top of its body silently reads the default
 * and every string stays second-person. Pages have `overview.isFictional` in
 * the callback already, so they use this instead and the trap cannot bite.
 */
export function exampleCopyFor(isFictional: boolean): { context?: string } {
  return isFictional ? { context: 'example' } : {}
}
