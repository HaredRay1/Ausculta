/**
 * Demo mode — public surface.
 *
 * Import from here:
 *
 *     import { visibleRows, useDemoMode } from '../demo'
 *
 * The one thing every other feature must use is `visibleRows`. Seeded
 * fictional records share the same tables as real clinical records, separated
 * only by `isDemo`, so a list, count, search or export that queries a table
 * directly will hand a validator's invented patient to a health worker who has
 * demo mode switched off.
 *
 *     const { enabled } = useDemoMode()
 *     const patients = await visibleRows(db.patients, enabled).toArray()
 *     const mine = await visibleRows(db.recordings, enabled)
 *       .and((r) => r.patientId === id)
 *       .toArray()
 *
 * Add further criteria with `.and(...)` rather than starting a fresh query off
 * the table — that is how demo rows leak back in.
 */

/* ---- Visibility: the part other features need ---------------------------- */
export {
  DEMO,
  REAL,
  demoRowsOnly,
  isDemoRow,
  isVisible,
  keepVisible,
  visibleRows,
  type DemoScoped,
} from './visibility'

/* ---- The switch ---------------------------------------------------------- */
export {
  DEMO_MODE_META_KEY,
  clearDemoMode,
  readDemoMode,
  setDemoMode,
  toggleDemoMode,
  type DemoModeCapableDb,
} from './demoMode'
export { useDemoMode, useDemoSeedStatus, type DemoModeState, type DemoSeedState } from './useDemoMode'

/* ---- Seeding ------------------------------------------------------------- */
export {
  DEMO_SEED_META_KEY,
  aiDisclosureViolation,
  buildDemoRows,
  demoAssessmentId,
  demoPatientId,
  demoRecordingId,
  readDemoSeedMarker,
  resetDemoData,
  seedDemoData,
  type DemoCounts,
  type DemoSeedMarker,
  type ResetResult,
  type SeedOptions,
  type SeedResult,
} from './seed'
export { DEMO_FIRST_RUN_META_KEY, ensureFirstRunDemo, type FirstRunResult } from './firstRun'
export { syncDemoAssignments, type AssignmentSyncResult } from './assignments'

/* ---- The fictional clinic ------------------------------------------------ */
export { DEMO_PATIENTS, DEMO_LOCATION_ORDER, walkthroughPatientSpec } from './dataset'

/**
 * Resolving an author name. `Assessment.assessorId` and
 * `practitionerReviewerId` on a seeded row point at fictional staff who are
 * deliberately not rows in `users`, so a screen rendering an author must fall
 * back through here or it will show a bare id.
 */
export {
  DEMO_STAFF,
  DEMO_STAFF_ID_PREFIX,
  isDemoStaffId,
  resolveDemoStaff,
  type DemoStaff,
} from './staff'

/* ---- UI ------------------------------------------------------------------ */
export { DemoSettingsPage } from './pages/DemoSettingsPage'
export { demoRoutes } from './routes'
export { DEMO_NS, registerDemoResources, useDemoTranslation } from './i18n'
