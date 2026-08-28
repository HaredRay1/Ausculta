/**
 * Rehabilitation support — public surface.
 *
 * Import from here:
 *
 *     import { rehabRoutes, RehabHomePage } from '../rehab'
 *
 * ## The one thing to know before touching this feature
 *
 * The master specification (§41) lists **huff coughing** as a rehabilitation
 * activity. It is not implemented, and it must not be added back. Huff coughing
 * is the forced-expiration phase of the Active Cycle of Breathing Technique — a
 * mucus-clearance intervention for cystic fibrosis, bronchiectasis and COPD,
 * with no asthma evidence — and physiotherapy sources list bronchospasm and
 * hyper-reactive airways as an explicit contraindication to it. Asthma is a
 * hyper-reactive-airway disease by definition, and asthma patients are this
 * app's stated primary user. See `content/techniques.ts`, which records the
 * exclusion in code, and the safety note the techniques screen renders.
 *
 * The second rule: this feature never authors clinical content for an
 * individual. It renders red-flag education that is identical for everybody,
 * and it renders what a practitioner filled in and approved. It does not
 * generate an action plan, fill a blank, derive a threshold, or suggest an
 * activity.
 */

/* ---- Routes and navigation ---------------------------------------------- */
export { rehabRoutes, default as default } from './routes'
export {
  REHAB_PATHS,
  REHAB_ROOT,
  TECHNIQUE_ROUTE_PATTERN,
  techniquePath,
} from './navigation'

/* ---- Screens ------------------------------------------------------------- */
export { RehabHomePage, type RehabHomePageProps } from './pages/RehabHomePage'
export { RedFlagsPage } from './pages/RedFlagsPage'
export { ActionPlanPage, type ActionPlanPageProps } from './pages/ActionPlanPage'
export { TechniquesPage } from './pages/TechniquesPage'
export { TechniqueDetailPage } from './pages/TechniqueDetailPage'

/* ---- i18n ---------------------------------------------------------------- */
export {
  REHAB_CLINICIAN_REVIEWED,
  REHAB_CONTENT_VERSION,
  REHAB_NS,
  registerRehabResources,
  useRehabTranslation,
} from './i18n'

/* ---- Content ------------------------------------------------------------- */
export {
  CITATIONS,
  CITATION_CONFIDENCE,
  CITATION_IDS,
  type Citation,
  type CitationConfidence,
  type CitationId,
} from './content/citations'
export {
  RED_FLAGS,
  RED_FLAG_EQUIPMENT,
  RED_FLAG_URGENCY,
  RESPIRATORY_RATE_BANDS,
  redFlagsByUrgency,
  type RedFlag,
  type RedFlagUrgency,
} from './content/redFlags'
export {
  AUDIENCE,
  EVIDENCE_STRENGTH,
  EXCLUDED_TECHNIQUES,
  EXCLUSION_REASON,
  REHAB_ACTIVITY_CODES,
  TECHNIQUES,
  findTechnique,
  isRehabActivityCode,
  type EvidenceStrength,
  type ExcludedTechnique,
  type RehabActivityCode,
  type Technique,
} from './content/techniques'
export {
  ACTION_PLAN_TEMPLATE_ID,
  CONTACT_FIELDS,
  PLAN_FIELDS,
  PLAN_FIELD_SPECS,
  PLAN_ZONES,
  type PlanField,
  type PlanZone,
} from './content/actionPlanTemplate'

/* ---- Data ---------------------------------------------------------------- */
export {
  EMPTY_PLAN_DETAILS,
  REHAB_PLAN_SCHEMA_VERSION,
  countRecentCompletions,
  isActionPlanEmpty,
  isApproved,
  isAwaitingApproval,
  parseCompletionDetails,
  parsePlanDetails,
  type ActionPlanDetails,
  type AssignedActivity,
  type RehabPlanDetails,
  type ZoneFields,
} from './data/planModel'
export {
  createRehabRepository,
  rehabRepository,
  type LogCompletionInput,
  type PlanState,
  type RehabOverview,
  type RehabRepository,
} from './data/rehabRepository'
export { useRehabOverview } from './data/useRehabOverview'
