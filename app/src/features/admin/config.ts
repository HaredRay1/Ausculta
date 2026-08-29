import { createAuditLogger } from '../../audit/audit'
import { ROLES, SEVERITY_CATEGORIES, type SeverityCategory } from '../../db/codes'
import { db as defaultDb, type AuscultaDB } from '../../db/db'

/**
 * Administrator-editable clinical configuration.
 *
 * Two rules make this safe to expose at all:
 *
 * 1. **Every change bumps `version`, and the version is stamped onto records
 *    created afterwards.** A stored result whose thresholds cannot be recovered
 *    is uninterpretable later — you cannot tell whether a finding changed
 *    because the patient changed or because somebody moved a number. The
 *    version is the join back to the configuration that produced it.
 *
 * 2. **Nothing here changes a clinical meaning silently.** Each change is
 *    audited with the previous and new value and the administrator who made it,
 *    and validation refuses a configuration that is internally incoherent
 *    rather than storing it and letting a screen render nonsense.
 *
 * ## What is deliberately NOT editable here
 *
 * The analysis thresholds (`TUNABLES` in `src/audio/constants.ts`) decide
 * whether a recording is called suggestive. They are compile-time constants
 * read inside the classifier worker, so a value typed into this app would not
 * reach them. Presenting them as editable would be a control that appears to
 * work and does not — on clinical thresholds, the worst possible kind. They are
 * shown read-only, with their own version, and moving them remains a code
 * change and a redeploy.
 */

/** `appMeta` key holding the configuration record. */
export const CLINICAL_CONFIG_META_KEY = 'clinicalConfig'

export const CONFIG_AUDIT_ACTIONS = {
  CONFIG_UPDATED: 'CONFIG_UPDATED',
} as const

export const CONFIG_ERRORS = {
  NOT_AUTHORISED: 'CONFIG_NOT_AUTHORISED',
  IDLE_TIMEOUT_OUT_OF_RANGE: 'CONFIG_IDLE_TIMEOUT_OUT_OF_RANGE',
  BANDS_NOT_ASCENDING: 'CONFIG_BANDS_NOT_ASCENDING',
  BAND_OUT_OF_RANGE: 'CONFIG_BAND_OUT_OF_RANGE',
  BANDS_INCOMPLETE: 'CONFIG_BANDS_INCOMPLETE',
} as const

export type ConfigErrorCode = (typeof CONFIG_ERRORS)[keyof typeof CONFIG_ERRORS]

export class ConfigError extends Error {
  constructor(readonly code: ConfigErrorCode) {
    super(code)
    this.name = 'ConfigError'
  }
}

/** Lower bound of one severity band, as a whole-percent score. */
export interface SeverityBand {
  code: SeverityCategory
  minScore: number
}

export interface ClinicalConfig {
  /** Bumped on every accepted change. Stamped onto records created after it. */
  version: number
  /** Minutes of inactivity before a session is dropped. */
  idleTimeoutMinutes: number
  /**
   * Severity bands, lowest first.
   *
   * Editable and versioned, but nothing consumes them yet: no severity model
   * exists, so every assessment still stores `status: MODEL_NOT_CONNECTED` and
   * a null score. They are configured ahead of the model rather than after it
   * so the first scored record already has a version to point at.
   */
  severityBands: SeverityBand[]
  updatedAt: string
  /** User id of the administrator who last changed it, or 'DEFAULT'. */
  updatedBy: string
}

/** The 30-minute idle default the auth layer already used. */
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 30
export const MIN_IDLE_TIMEOUT_MINUTES = 1
/**
 * Eight hours. A clinic device left signed in overnight is how a health
 * worker's account ends up recording someone else's assessment, so there is a
 * ceiling even though an administrator may want a long one.
 */
export const MAX_IDLE_TIMEOUT_MINUTES = 480

export const DEFAULT_SEVERITY_BANDS: readonly SeverityBand[] = [
  { code: SEVERITY_CATEGORIES.MINIMAL, minScore: 0 },
  { code: SEVERITY_CATEGORIES.MILD, minScore: 20 },
  { code: SEVERITY_CATEGORIES.MODERATE, minScore: 40 },
  { code: SEVERITY_CATEGORIES.HIGH, minScore: 60 },
  { code: SEVERITY_CATEGORIES.VERY_HIGH, minScore: 80 },
]

export const DEFAULT_CLINICAL_CONFIG: ClinicalConfig = {
  version: 1,
  idleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT_MINUTES,
  severityBands: DEFAULT_SEVERITY_BANDS.map((band) => ({ ...band })),
  updatedAt: '1970-01-01T00:00:00.000Z',
  updatedBy: 'DEFAULT',
}

/** The fields an administrator may change. */
export interface ConfigChanges {
  idleTimeoutMinutes?: number
  severityBands?: readonly SeverityBand[]
}

function isConfig(value: unknown): value is ClinicalConfig {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ClinicalConfig>
  return (
    typeof candidate.version === 'number' &&
    typeof candidate.idleTimeoutMinutes === 'number' &&
    Array.isArray(candidate.severityBands)
  )
}

/**
 * Rejects a configuration that cannot be applied coherently.
 *
 * Bands that are not strictly ascending would make a score fall into two bands
 * at once, and which one won would depend on array order — a clinical meaning
 * decided by an implementation detail.
 */
export function validateChanges(changes: ConfigChanges): void {
  if (changes.idleTimeoutMinutes !== undefined) {
    const minutes = changes.idleTimeoutMinutes
    if (
      !Number.isFinite(minutes) ||
      !Number.isInteger(minutes) ||
      minutes < MIN_IDLE_TIMEOUT_MINUTES ||
      minutes > MAX_IDLE_TIMEOUT_MINUTES
    ) {
      throw new ConfigError(CONFIG_ERRORS.IDLE_TIMEOUT_OUT_OF_RANGE)
    }
  }

  if (changes.severityBands !== undefined) {
    const bands = changes.severityBands
    const expected = DEFAULT_SEVERITY_BANDS.map((band) => band.code)
    if (bands.length !== expected.length || bands.some((band, i) => band.code !== expected[i])) {
      throw new ConfigError(CONFIG_ERRORS.BANDS_INCOMPLETE)
    }
    for (const band of bands) {
      if (!Number.isInteger(band.minScore) || band.minScore < 0 || band.minScore > 100) {
        throw new ConfigError(CONFIG_ERRORS.BAND_OUT_OF_RANGE)
      }
    }
    for (let i = 1; i < bands.length; i += 1) {
      if (bands[i].minScore <= bands[i - 1].minScore) {
        throw new ConfigError(CONFIG_ERRORS.BANDS_NOT_ASCENDING)
      }
    }
  }
}

export function createConfigStore(database: AuscultaDB = defaultDb) {
  const audit = createAuditLogger(database)

  async function read(): Promise<ClinicalConfig> {
    const row = await database.appMeta.get(CLINICAL_CONFIG_META_KEY)
    if (row === undefined || !isConfig(row.value)) return { ...DEFAULT_CLINICAL_CONFIG }
    return row.value
  }

  /** The version to stamp onto a record being created now. */
  async function currentVersion(): Promise<number> {
    return (await read()).version
  }

  async function requireAdmin(actorId: string): Promise<void> {
    const actor = await database.users.get(actorId)
    if (actor === undefined || actor.role !== ROLES.ADMIN) {
      throw new ConfigError(CONFIG_ERRORS.NOT_AUTHORISED)
    }
  }

  /**
   * Applies a change, bumps the version and audits it.
   *
   * The audit entry carries the previous and the new value, not just "config
   * changed" — an accountability record that tells you a number moved but not
   * from what to what cannot answer the question anyone will actually ask.
   */
  async function update(
    actorId: string,
    changes: ConfigChanges,
    now: Date = new Date(),
  ): Promise<ClinicalConfig> {
    await requireAdmin(actorId)
    validateChanges(changes)

    const previous = await read()
    const next: ClinicalConfig = {
      version: previous.version + 1,
      idleTimeoutMinutes: changes.idleTimeoutMinutes ?? previous.idleTimeoutMinutes,
      severityBands: (changes.severityBands ?? previous.severityBands).map((band) => ({
        ...band,
      })),
      updatedAt: now.toISOString(),
      updatedBy: actorId,
    }

    await database.appMeta.put({ key: CLINICAL_CONFIG_META_KEY, value: next })
    await audit({
      userId: actorId,
      actionCode: CONFIG_AUDIT_ACTIONS.CONFIG_UPDATED,
      entityType: 'clinicalConfig',
      entityId: CLINICAL_CONFIG_META_KEY,
      detail: {
        fromVersion: previous.version,
        toVersion: next.version,
        before: {
          idleTimeoutMinutes: previous.idleTimeoutMinutes,
          severityBands: previous.severityBands,
        },
        after: {
          idleTimeoutMinutes: next.idleTimeoutMinutes,
          severityBands: next.severityBands,
        },
      },
    })

    return next
  }

  return { read, update, currentVersion }
}

export type ConfigStore = ReturnType<typeof createConfigStore>

/** App-wide store, bound to the real database. */
export const configStore = createConfigStore()
