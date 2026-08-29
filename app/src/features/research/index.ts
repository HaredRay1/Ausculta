/**
 * Researcher module — public surface.
 *
 *     import { researchRoutes } from '../research'
 *
 * Everything a researcher sees is de-identified or aggregate. The two pieces
 * worth knowing about from outside are `researchRoutes`, which carries its own
 * role guard, and `buildExportRows`, which is the only sanctioned way to get
 * clinical data off the device.
 */

/* ---- Routes -------------------------------------------------------------- */
export { researchRoutes } from './routes'

/* ---- Ground-truth vocabulary --------------------------------------------- */
export {
  GROUND_TRUTH_STATUSES,
  GROUND_TRUTH_STATUS_LIST,
  STATUSES_FORBIDDING_LABEL,
  STATUSES_REQUIRING_LABEL,
  isGroundTruthStatus,
  labelViolation,
  statusForReference,
  suppliesTrueClass,
  type GroundTruthStatus,
} from './groundTruth'

/* ---- Metrics ------------------------------------------------------------- */
export {
  CLASS_ORDER,
  MINIMUM_CLASS_SUPPORT,
  MINIMUM_SCORED_FOR_METRICS,
  buildConfusionCounts,
  buildPerformanceReport,
  formatPercent,
  metricsForClass,
  type ClassMetrics,
  type ConfusionCounts,
  type PerformanceReport,
  type ScoredPair,
} from './metrics'

/* ---- Reads and writes ---------------------------------------------------- */
export {
  buildScorableSet,
  hasPrediction,
  readLabelFor,
  readLabellingQueue,
  readPerformance,
  readResearchCounts,
  saveResearchLabel,
  type LabellingRow,
  type PerformanceView,
  type ResearchCounts,
  type SaveLabelInput,
  type ScorableSet,
} from './data'

/* ---- De-identified export ------------------------------------------------ */
export {
  EXPORT_COLUMNS,
  FORBIDDEN_PATIENT_FIELDS,
  ageYearsAt,
  buildExportRows,
  csvField,
  exportFileName,
  projectExportRows,
  toCsv,
  toJson,
  type ExportInput,
  type ExportRow,
} from './deidentify'

/* ---- Screens and i18n ---------------------------------------------------- */
export { ExportPage } from './pages/ExportPage'
export { LabellingPage } from './pages/LabellingPage'
export { PerformancePage } from './pages/PerformancePage'
export { ResearchDashboardPage } from './pages/ResearchDashboardPage'
export { RESEARCH_NS, registerResearchResources, useResearchTranslation } from './i18n'
