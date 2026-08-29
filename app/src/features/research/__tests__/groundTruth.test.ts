import { describe, expect, it } from 'vitest'
import {
  CLASSIFICATION_CODES,
  CODE_REGISTRY,
  GROUND_TRUTH_STATUSES as REGISTRY_STATUSES,
} from '../../../db/codes'
import { i18n as appI18n } from '../../../i18n'
import {
  GROUND_TRUTH_STATUSES,
  GROUND_TRUTH_STATUS_LIST,
  STATUSES_FORBIDDING_LABEL,
  STATUSES_REQUIRING_LABEL,
  isGroundTruthStatus,
  labelViolation,
  statusForReference,
  suppliesTrueClass,
} from '../groundTruth'

const { ASTHMA, HEALTHY } = CLASSIFICATION_CODES

/**
 * The vocabulary lives in `db/codes.ts` and the rules about it live in this
 * feature, which means two files that have to stay in step. These tests exist
 * to make that impossible to get wrong quietly.
 */
describe('the feature stays in step with the code registry', () => {
  it('re-exports the registry rather than declaring a second copy', () => {
    expect(GROUND_TRUTH_STATUSES).toBe(REGISTRY_STATUSES)
  })

  it('is registered, so the i18n exhaustiveness test polices its display strings', () => {
    expect(CODE_REGISTRY.groundTruth).toBeDefined()
    expect([...CODE_REGISTRY.groundTruth].sort()).toEqual([...GROUND_TRUTH_STATUS_LIST].sort())
  })

  it('gives every status a display string in the shared codes namespace', () => {
    for (const code of GROUND_TRUTH_STATUS_LIST) {
      const text = appI18n.t(`codes:groundTruth.${code}`)
      expect(text).toBeTruthy()
      expect(text).not.toBe(`groundTruth.${code}`)
    }
  })

  /**
   * The one that actually catches a future mistake.
   *
   * A sixth status added to the registry would not appear in either list here,
   * and `labelViolation` would then treat it as a status that must NOT carry a
   * class — silently, and in the direction that loses data from the confusion
   * matrix. Partitioning is the invariant, so assert it directly.
   */
  it('sorts every registry status into exactly one of requiring or forbidding a class', () => {
    const requiring = new Set<string>(STATUSES_REQUIRING_LABEL)
    const forbidding = new Set<string>(STATUSES_FORBIDDING_LABEL)

    for (const code of CODE_REGISTRY.groundTruth) {
      const inRequiring = requiring.has(code)
      const inForbidding = forbidding.has(code)
      expect(
        inRequiring !== inForbidding,
        `${code} must be in exactly one of STATUSES_REQUIRING_LABEL or STATUSES_FORBIDDING_LABEL`,
      ).toBe(true)
    }
    expect(requiring.size + forbidding.size).toBe(CODE_REGISTRY.groundTruth.length)
  })
})

describe('suppliesTrueClass', () => {
  it('is true only when the status requires a class and one is present', () => {
    expect(
      suppliesTrueClass({ groundTruthStatus: GROUND_TRUTH_STATUSES.CORRECT, labelCode: ASTHMA }),
    ).toBe(true)
    expect(
      suppliesTrueClass({ groundTruthStatus: GROUND_TRUTH_STATUSES.MODIFIED, labelCode: HEALTHY }),
    ).toBe(true)
  })

  it('is false for a status that cannot carry a class, however the row looks', () => {
    for (const code of STATUSES_FORBIDDING_LABEL) {
      expect(suppliesTrueClass({ groundTruthStatus: code })).toBe(false)
      // Even if a malformed row somehow carried one, it must not be scored.
      expect(suppliesTrueClass({ groundTruthStatus: code, labelCode: ASTHMA })).toBe(false)
    }
  })

  it('is false when a status that requires a class has none', () => {
    expect(suppliesTrueClass({ groundTruthStatus: GROUND_TRUTH_STATUSES.CORRECT })).toBe(false)
  })
})

describe('labelViolation', () => {
  it('rejects a status outside the registry', () => {
    expect(labelViolation({ groundTruthStatus: 'PROBABLY_FINE' })).toMatch(/unknown/)
  })

  it('accepts every well-formed shape the vocabulary allows', () => {
    expect(
      labelViolation({ groundTruthStatus: GROUND_TRUTH_STATUSES.CORRECT, labelCode: ASTHMA }),
    ).toBeNull()
    for (const code of STATUSES_FORBIDDING_LABEL) {
      expect(labelViolation({ groundTruthStatus: code })).toBeNull()
    }
  })
})

describe('isGroundTruthStatus', () => {
  it('accepts the registry values and nothing else', () => {
    for (const code of GROUND_TRUTH_STATUS_LIST) expect(isGroundTruthStatus(code)).toBe(true)
    expect(isGroundTruthStatus('CONFIRMED')).toBe(false)
    expect(isGroundTruthStatus('')).toBe(false)
  })
})

describe('statusForReference', () => {
  it('records agreement when the researcher picks the class the model chose', () => {
    expect(statusForReference(ASTHMA, ASTHMA)).toBe(GROUND_TRUTH_STATUSES.CORRECT)
  })

  it('records a modification when they pick a different one', () => {
    expect(statusForReference(ASTHMA, HEALTHY)).toBe(GROUND_TRUTH_STATUSES.MODIFIED)
  })

  it('treats a naming with no prediction to compare against as a modification', () => {
    expect(statusForReference(undefined, HEALTHY)).toBe(GROUND_TRUTH_STATUSES.MODIFIED)
  })
})
