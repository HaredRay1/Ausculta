/**
 * Audit vocabulary for demo mode.
 *
 * Demo mode changes **which patients appear on clinical screens**, and the
 * reset path deletes rows. Both are exactly what an accountability record
 * exists to answer: someone switching fictional patients on during a real
 * consultation, or resetting and later asking where records went. "It only
 * deleted demo rows" should be a claim the log can support rather than
 * something taken on trust.
 *
 * ## Why these codes are here and not in `src/audit/audit.ts`
 *
 * That module documents `AUDIT_ACTIONS` as "action codes emitted by the auth
 * layer", and types `AuditEntryInput.actionCode` as `AuditAction | string` —
 * a deliberate seam for other layers to bring their own vocabulary. The
 * deciding factor is the display strings: auth's live in `auth.json` under
 * `auditAction.*`, which is a locale file this feature does not own. Splitting
 * the codes into `audit.ts` while their translations stayed here would put the
 * two halves in different modules, which is the arrangement most likely to
 * drift.
 *
 * So the shape below mirrors `AUDIT_ACTIONS` exactly and the strings sit in
 * `demo.json` under the same `auditAction.*` key shape. Moving both into the
 * shared module later is mechanical, and worth doing if the audit viewer would
 * rather resolve one namespace than several — see the note in this feature's
 * report.
 */

export const DEMO_AUDIT_ACTIONS = {
  DEMO_MODE_ENABLED: 'DEMO_MODE_ENABLED',
  DEMO_MODE_DISABLED: 'DEMO_MODE_DISABLED',
  DEMO_DATA_SEEDED: 'DEMO_DATA_SEEDED',
  DEMO_DATA_RESET: 'DEMO_DATA_RESET',
} as const

export type DemoAuditAction = (typeof DEMO_AUDIT_ACTIONS)[keyof typeof DEMO_AUDIT_ACTIONS]

export const DEMO_AUDIT_ACTION_LIST: readonly DemoAuditAction[] =
  Object.values(DEMO_AUDIT_ACTIONS)

/**
 * Actor for something the app did on its own initiative.
 *
 * Distinct from `ANONYMOUS_ACTOR` in the audit module, which means "a person
 * acted but we cannot say who" — its documented case is a failed login against
 * an unknown username. First-run seeding has no person behind it at all, and
 * an accountability record that cannot tell "nobody did this" from "somebody
 * unidentified did this" is answering a different question than the one it
 * will be asked.
 */
export const DEMO_SYSTEM_ACTOR = 'SYSTEM'
