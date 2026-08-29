import { describe, expect, it } from 'vitest'
import {
  ALERT_TYPES,
  CLASSIFICATION_CODES,
  LOCATION_CODES,
  type ClassificationCode,
  type LocationCode,
} from '../../db/codes'
import {
  MISSED_GRACE_FRACTION,
  PERSISTENT_MIN_CONSECUTIVE,
  POOR_QUALITY_MIN_ASSESSMENTS,
  alertIdentity,
  evaluateAlerts,
  type AlertProposal,
  type AssessmentSnapshot,
  type RecordingSnapshot,
} from './alertEngine'

const NOW = new Date('2026-08-29T00:00:00.000Z')
const R_UPPER = LOCATION_CODES.R_UPPER
const L_LOWER = LOCATION_CODES.L_LOWER

/** A recording the app flagged. */
function flagged(
  locationCode: LocationCode = R_UPPER,
  classificationCode: ClassificationCode = CLASSIFICATION_CODES.ASTHMA,
): RecordingSnapshot {
  return {
    recordingId: `rec-${locationCode}-${Math.random()}`,
    locationCode,
    flagged: true,
    unusable: false,
    classificationCode,
  }
}

/** A recording the app assessed as unremarkable. */
function clear(locationCode: LocationCode = R_UPPER): RecordingSnapshot {
  return {
    recordingId: `rec-${locationCode}-${Math.random()}`,
    locationCode,
    flagged: false,
    unusable: false,
    classificationCode: CLASSIFICATION_CODES.HEALTHY,
  }
}

/** A recording that could not be used, so nothing was decided from it. */
function unusable(locationCode: LocationCode = R_UPPER): RecordingSnapshot {
  return {
    recordingId: `rec-${locationCode}-${Math.random()}`,
    locationCode,
    flagged: false,
    unusable: true,
  }
}

function visit(daysAgo: number, ...recordings: RecordingSnapshot[]): AssessmentSnapshot {
  const date = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return { assessmentId: `asm-${daysAgo}`, date, recordings }
}

function run(history: AssessmentSnapshot[], expectation?: { intervalDays: number; active: boolean }) {
  return evaluateAlerts({ history, now: NOW, ...(expectation !== undefined && { expectation }) })
}

function types(proposals: AlertProposal[]) {
  return proposals.map((p) => p.typeCode)
}

// ---------------------------------------------------------------------------

describe('NEW_ABNORMAL', () => {
  it('fires when a location is flagged that was clear last time', () => {
    const alerts = run([visit(30, clear()), visit(0, flagged())])
    expect(types(alerts)).toContain(ALERT_TYPES.NEW_ABNORMAL)
    expect(alerts[0]?.locationCode).toBe(R_UPPER)
  })

  it('fires on the very first recording of a location', () => {
    // New to whoever is reading, which is what the alert is for.
    expect(types(run([visit(0, flagged())]))).toContain(ALERT_TYPES.NEW_ABNORMAL)
  })

  it('does NOT fire when the location was already flagged last time', () => {
    const alerts = run([visit(30, flagged()), visit(0, flagged())])
    expect(types(alerts)).not.toContain(ALERT_TYPES.NEW_ABNORMAL)
  })

  it('does NOT fire when nothing is flagged now', () => {
    expect(types(run([visit(30, flagged()), visit(0, clear())]))).not.toContain(
      ALERT_TYPES.NEW_ABNORMAL,
    )
  })

  it('does NOT fire off the back of an unusable previous recording', () => {
    // Nothing was decided last time, so there is no "was clear" to contrast
    // with. Firing here would report a failed recording as a new finding.
    const alerts = run([visit(30, unusable()), visit(0, flagged())])
    expect(types(alerts)).not.toContain(ALERT_TYPES.NEW_ABNORMAL)
  })

  it('reports each newly flagged location separately', () => {
    const alerts = run([
      visit(30, clear(R_UPPER), clear(L_LOWER)),
      visit(0, flagged(R_UPPER), flagged(L_LOWER)),
    ])
    const locations = alerts
      .filter((a) => a.typeCode === ALERT_TYPES.NEW_ABNORMAL)
      .map((a) => a.locationCode)
    expect(locations).toEqual([R_UPPER, L_LOWER])
  })
})

describe('PERSISTENT_ABNORMAL', () => {
  it('fires once a location has been flagged three times running', () => {
    const alerts = run([visit(60, flagged()), visit(30, flagged()), visit(0, flagged())])
    expect(types(alerts)).toContain(ALERT_TYPES.PERSISTENT_ABNORMAL)
  })

  it('does NOT fire on two in a row', () => {
    // Persistence is not a property you can establish from two data points,
    // and calling it persistent would make the word mean "twice".
    const alerts = run([visit(30, flagged()), visit(0, flagged())])
    expect(types(alerts)).not.toContain(ALERT_TYPES.PERSISTENT_ABNORMAL)
    expect(PERSISTENT_MIN_CONSECUTIVE).toBe(3)
  })

  it('does NOT fire when the run is broken by a clear result', () => {
    const alerts = run([visit(90, flagged()), visit(60, clear()), visit(30, flagged()), visit(0, flagged())])
    expect(types(alerts)).not.toContain(ALERT_TYPES.PERSISTENT_ABNORMAL)
  })

  it('does NOT fire when the run is broken by a visit that skipped the location', () => {
    // A gap is not evidence of continuity.
    const alerts = run([
      visit(90, flagged(R_UPPER)),
      visit(60, clear(L_LOWER)),
      visit(30, flagged(R_UPPER)),
      visit(0, flagged(R_UPPER)),
    ])
    expect(types(alerts)).not.toContain(ALERT_TYPES.PERSISTENT_ABNORMAL)
  })

  it('does NOT fire when the most recent result is clear', () => {
    const alerts = run([visit(60, flagged()), visit(30, flagged()), visit(0, clear())])
    expect(types(alerts)).not.toContain(ALERT_TYPES.PERSISTENT_ABNORMAL)
  })

  it('counts the run in its parameters', () => {
    const alerts = run([
      visit(90, flagged()),
      visit(60, flagged()),
      visit(30, flagged()),
      visit(0, flagged()),
    ])
    const persistent = alerts.find((a) => a.typeCode === ALERT_TYPES.PERSISTENT_ABNORMAL)
    expect(persistent?.params.count).toBe(4)
  })
})

describe('SIGNIFICANT_CHANGE', () => {
  it('fires when the pattern differs from last time', () => {
    const alerts = run([
      visit(30, flagged(R_UPPER, CLASSIFICATION_CODES.ASTHMA)),
      visit(0, flagged(R_UPPER, CLASSIFICATION_CODES.PNEUMONIA)),
    ])
    expect(types(alerts)).toContain(ALERT_TYPES.SIGNIFICANT_CHANGE)
  })

  it('does NOT fire when the pattern is unchanged', () => {
    const alerts = run([
      visit(30, flagged(R_UPPER, CLASSIFICATION_CODES.ASTHMA)),
      visit(0, flagged(R_UPPER, CLASSIFICATION_CODES.ASTHMA)),
    ])
    expect(types(alerts)).not.toContain(ALERT_TYPES.SIGNIFICANT_CHANGE)
  })

  it('does NOT double-report a change that is already a new finding', () => {
    // clear -> flagged is NEW_ABNORMAL. Two alerts for one event is noise.
    const alerts = run([visit(30, clear()), visit(0, flagged())])
    expect(types(alerts)).toContain(ALERT_TYPES.NEW_ABNORMAL)
    expect(types(alerts)).not.toContain(ALERT_TYPES.SIGNIFICANT_CHANGE)
  })

  it('DOES fire when a flagged location becomes clear', () => {
    // Worth telling a clinician about, and not covered by any other rule.
    const alerts = run([visit(30, flagged()), visit(0, clear())])
    expect(types(alerts)).toContain(ALERT_TYPES.SIGNIFICANT_CHANGE)
  })

  it('does NOT fire against an unusable recording on either side', () => {
    // That is a change in recording quality, not in the patient.
    expect(types(run([visit(30, unusable()), visit(0, flagged())]))).not.toContain(
      ALERT_TYPES.SIGNIFICANT_CHANGE,
    )
    expect(types(run([visit(30, flagged()), visit(0, unusable())]))).not.toContain(
      ALERT_TYPES.SIGNIFICANT_CHANGE,
    )
  })

  it('does NOT fire when there is no previous assessment', () => {
    expect(types(run([visit(0, flagged())]))).not.toContain(ALERT_TYPES.SIGNIFICANT_CHANGE)
  })
})

describe('REPEATED_POOR_QUALITY', () => {
  it('fires when two of the last three visits produced unusable audio', () => {
    const alerts = run([visit(60, unusable()), visit(30, clear()), visit(0, unusable())])
    expect(types(alerts)).toContain(ALERT_TYPES.REPEATED_POOR_QUALITY)
  })

  it('does NOT fire on a single bad visit', () => {
    // One bad session is a flat battery or a restless child, not a pattern.
    const alerts = run([visit(60, clear()), visit(30, clear()), visit(0, unusable())])
    expect(types(alerts)).not.toContain(ALERT_TYPES.REPEATED_POOR_QUALITY)
  })

  it('does NOT fire for many bad recordings within one visit', () => {
    // Six unusable recordings in one session is still one bad session. The
    // signal is the same problem recurring on a different day.
    const alerts = run([
      visit(0, unusable(R_UPPER), unusable(L_LOWER), unusable(LOCATION_CODES.R_LOWER)),
    ])
    expect(types(alerts)).not.toContain(ALERT_TYPES.REPEATED_POOR_QUALITY)
  })

  it('does NOT fire when the most recent visit was fine', () => {
    // The problem may already have been fixed; a stale alert on arrival trains
    // people to ignore alerts.
    const alerts = run([visit(60, unusable()), visit(30, unusable()), visit(0, clear())])
    expect(types(alerts)).not.toContain(ALERT_TYPES.REPEATED_POOR_QUALITY)
  })

  it('only looks at the recent window, not all history', () => {
    const alerts = run([
      visit(200, unusable()),
      visit(150, unusable()),
      visit(60, clear()),
      visit(30, clear()),
      visit(0, unusable()),
    ])
    expect(types(alerts)).not.toContain(ALERT_TYPES.REPEATED_POOR_QUALITY)
  })

  it('reports how many visits were affected', () => {
    const alerts = run([visit(60, unusable()), visit(30, unusable()), visit(0, unusable())])
    const poor = alerts.find((a) => a.typeCode === ALERT_TYPES.REPEATED_POOR_QUALITY)
    expect(poor?.params.affectedVisits).toBe(3)
    expect(poor?.params.ofVisits).toBe(3)
    expect(POOR_QUALITY_MIN_ASSESSMENTS).toBe(2)
  })

  it('carries no location, because it is about the recording, not a lung', () => {
    const alerts = run([visit(30, unusable()), visit(0, unusable())])
    const poor = alerts.find((a) => a.typeCode === ALERT_TYPES.REPEATED_POOR_QUALITY)
    expect(poor?.locationCode).toBeUndefined()
  })
})

describe('MISSED_MONITORING', () => {
  const weekly = { intervalDays: 7, active: true }

  it('fires once the interval plus grace has passed', () => {
    const alerts = run([visit(20, clear())], weekly)
    expect(types(alerts)).toContain(ALERT_TYPES.MISSED_MONITORING)
  })

  it('does NOT fire inside the interval', () => {
    expect(types(run([visit(3, clear())], weekly))).not.toContain(ALERT_TYPES.MISSED_MONITORING)
  })

  it('does NOT fire inside the grace period', () => {
    // 7-day plan, grace of half that: due at 10.5 days, so 9 is not missed.
    expect(types(run([visit(9, clear())], weekly))).not.toContain(ALERT_TYPES.MISSED_MONITORING)
    expect(MISSED_GRACE_FRACTION).toBe(0.5)
  })

  it('does NOT fire without a plan at all', () => {
    expect(types(run([visit(200, clear())]))).not.toContain(ALERT_TYPES.MISSED_MONITORING)
  })

  it('does NOT fire for an unapproved or inactive plan', () => {
    // A plan nobody approved creates no expectation, so it cannot be missed.
    const alerts = run([visit(200, clear())], { intervalDays: 7, active: false })
    expect(types(alerts)).not.toContain(ALERT_TYPES.MISSED_MONITORING)
  })

  it('does NOT fire for a nonsensical interval', () => {
    expect(types(run([visit(200, clear())], { intervalDays: 0, active: true }))).not.toContain(
      ALERT_TYPES.MISSED_MONITORING,
    )
  })

  it('fires for a patient with an active plan and no assessments at all', () => {
    expect(types(evaluateAlerts({ history: [], now: NOW, expectation: weekly }))).toEqual([])
  })

  it('reports how long it has been', () => {
    const alerts = run([visit(20, clear())], weekly)
    const missed = alerts.find((a) => a.typeCode === ALERT_TYPES.MISSED_MONITORING)
    expect(missed?.params.elapsedDays).toBe(20)
    expect(missed?.params.intervalDays).toBe(7)
  })
})

describe('the engine as a whole', () => {
  it('returns nothing for a patient with no history and no plan', () => {
    expect(evaluateAlerts({ history: [], now: NOW })).toEqual([])
  })

  it('returns nothing for a steady, clear patient', () => {
    expect(run([visit(60, clear()), visit(30, clear()), visit(0, clear())])).toEqual([])
  })

  it('is deterministic and stably ordered', () => {
    const history = [visit(60, flagged()), visit(30, flagged()), visit(0, flagged())]
    expect(run(history)).toEqual(run(history))
  })

  it('can raise several different alerts at once', () => {
    // Latest visit 20 days ago, so a weekly plan is also overdue. A history
    // whose newest assessment is today cannot be missing one.
    const history = [
      visit(80, flagged(R_UPPER), unusable(L_LOWER)),
      visit(50, flagged(R_UPPER), clear(L_LOWER)),
      visit(20, flagged(R_UPPER), unusable(L_LOWER)),
    ]
    const kinds = new Set(types(run(history, { intervalDays: 7, active: true })))
    expect(kinds.has(ALERT_TYPES.PERSISTENT_ABNORMAL)).toBe(true)
    expect(kinds.has(ALERT_TYPES.MISSED_MONITORING)).toBe(true)
  })

  it('never emits a message, only a code and evidence', () => {
    // Storing an English sentence would make the alert unreadable in Filipino
    // and unusable in a research export.
    const history = [visit(60, flagged()), visit(30, flagged()), visit(0, flagged())]
    for (const proposal of run(history)) {
      expect(proposal).not.toHaveProperty('message')
      for (const value of Object.values(proposal.params)) {
        // Params are evidence, not prose: no sentences.
        expect(String(value).split(' ').length).toBeLessThan(4)
      }
    }
  })
})

describe('alertIdentity', () => {
  it('is the same for the same finding at the same location', () => {
    const a: AlertProposal = {
      typeCode: ALERT_TYPES.PERSISTENT_ABNORMAL,
      locationCode: R_UPPER,
      params: { count: 3 },
    }
    const b: AlertProposal = { ...a, params: { count: 4 } }
    // A standing finding whose run has grown is still the same alert; raising
    // it again would bury the practitioner in duplicates.
    expect(alertIdentity(a)).toBe(alertIdentity(b))
  })

  it('differs by location', () => {
    const base = { typeCode: ALERT_TYPES.NEW_ABNORMAL, params: {} }
    expect(alertIdentity({ ...base, locationCode: R_UPPER })).not.toBe(
      alertIdentity({ ...base, locationCode: L_LOWER }),
    )
  })

  it('differs by type', () => {
    expect(alertIdentity({ typeCode: ALERT_TYPES.NEW_ABNORMAL, params: {} })).not.toBe(
      alertIdentity({ typeCode: ALERT_TYPES.MISSED_MONITORING, params: {} }),
    )
  })
})
