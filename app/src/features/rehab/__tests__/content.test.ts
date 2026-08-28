import { describe, expect, it } from 'vitest'
import { REVIEW_STATUSES } from '../../../db/codes'
import { AuscultaDB } from '../../../db/db'
import type { RehabPlan } from '../../../db/types'
import { i18n as appI18n } from '../../../i18n'
import {
  CONTACT_FIELDS,
  PLAN_FIELDS,
  PLAN_FIELD_SPECS,
  PLAN_ZONES,
  planFieldKey,
  zoneMeaningKey,
  zoneNameKey,
  zoneStateKey,
} from '../content/actionPlanTemplate'
import {
  CITATIONS,
  CITATION_IDS,
  citationLabelKey,
  citationSourceKey,
} from '../content/citations'
import {
  RED_FLAGS,
  RED_FLAG_URGENCY,
  RESPIRATORY_RATE_BANDS,
  redFlagDetailKey,
  redFlagTitleKey,
  redFlagsByUrgency,
} from '../content/redFlags'
import {
  TAGALOG_WAAP_DRAFT,
  assertApprovedForDisplay,
} from '../content/tagalogDraft'
import {
  EXCLUDED_TECHNIQUES,
  EXCLUSION_REASON,
  REHAB_ACTIVITY_CODES,
  TECHNIQUES,
  excludedTechniquesShownToUser,
  findTechnique,
  techniqueCautionsKey,
  techniqueNameKey,
  techniqueStepsKey,
  techniqueSuitsKey,
  techniqueSummaryKey,
} from '../content/techniques'
import {
  countRecentCompletions,
  isActionPlanEmpty,
  isApproved,
  isAwaitingApproval,
  parseCompletionDetails,
  parsePlanDetails,
} from '../data/planModel'
import { createRehabRepository } from '../data/rehabRepository'
import { REHAB_CLINICIAN_REVIEWED, registerRehabResources } from '../i18n'

registerRehabResources(appI18n)

const t = (key: string, options?: Record<string, unknown>) =>
  appI18n.t(key, options) as unknown

/** Resolved and not just an echo of the key. */
function resolves(key: string): boolean {
  const value = t(key)
  return typeof value === 'string' && value !== '' && value !== key
}

function resolvesList(key: string): string[] {
  const value = t(key, { returnObjects: true })
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []
}

/* ------------------------------------------------------------------------- */
/* The safety finding: huff coughing must never be a suggestion.             */
/* ------------------------------------------------------------------------- */

describe('contraindicated activities', () => {
  it('does not ship huff coughing as a technique', () => {
    const codes = TECHNIQUES.map((technique) => technique.code)
    expect(codes).not.toContain('HUFF_COUGHING')
    expect(findTechnique('HUFF_COUGHING')).toBeUndefined()
  })

  it('does not ship ACBT, Buteyko or inspiratory muscle training either', () => {
    const codes = TECHNIQUES.map((technique) => technique.code)
    for (const excluded of ['ACBT', 'BUTEYKO', 'INSPIRATORY_MUSCLE_TRAINING']) {
      expect(codes).not.toContain(excluded)
    }
  })

  it('records huff coughing as contraindicated and clinician-prescribed-only', () => {
    const huff = EXCLUDED_TECHNIQUES.find((entry) => entry.code === 'HUFF_COUGHING')
    expect(huff).toBeDefined()
    expect(huff?.reasons).toContain(EXCLUSION_REASON.CONTRAINDICATED_IN_ASTHMA)
    expect(huff?.reasons).toContain(EXCLUSION_REASON.CLINICIAN_PRESCRIBED_ONLY)
    expect(huff?.citations.length).toBeGreaterThan(0)
  })

  it('explains the huff-coughing exclusion to the user, with its rule and citation', () => {
    const shown = excludedTechniquesShownToUser()
    expect(shown.map((entry) => entry.code)).toEqual(['HUFF_COUGHING'])
    expect(resolves('rehab:techniques.notOffered.HUFF_COUGHING.name')).toBe(true)
    expect(resolves('rehab:techniques.notOffered.HUFF_COUGHING.reason')).toBe(true)
    expect(resolves('rehab:techniques.notOffered.HUFF_COUGHING.rule')).toBe(true)
  })

  it('every code the plan model accepts is a technique that is actually shipped', () => {
    // The parser drops unknown activity codes, so this is the guard that stops
    // an excluded activity ever being renderable from a stored plan.
    for (const code of Object.values(REHAB_ACTIVITY_CODES)) {
      expect(findTechnique(code)).toBeDefined()
    }
  })
})

/* ------------------------------------------------------------------------- */
/* Every technique renders its contraindications and its citation.           */
/* ------------------------------------------------------------------------- */

describe('technique content', () => {
  it('ships four techniques, not ten', () => {
    expect(TECHNIQUES).toHaveLength(4)
  })

  it.each(TECHNIQUES.map((technique) => [technique.code, technique] as const))(
    '%s has a name, summary, steps, audience and cautions',
    (_code, technique) => {
      expect(resolves(techniqueNameKey(technique.code))).toBe(true)
      expect(resolves(techniqueSummaryKey(technique.code))).toBe(true)
      expect(resolves(techniqueSuitsKey(technique.code))).toBe(true)

      const steps = resolvesList(techniqueStepsKey(technique.code))
      expect(steps).toHaveLength(technique.stepCount)

      const cautions = resolvesList(techniqueCautionsKey(technique.code))
      expect(cautions).toHaveLength(technique.cautionCount)
      expect(cautions.length).toBeGreaterThan(0)
    },
  )

  it.each(TECHNIQUES.map((technique) => [technique.code, technique] as const))(
    '%s carries at least one citation, and every citation is real',
    (_code, technique) => {
      expect(technique.citations.length).toBeGreaterThan(0)
      for (const id of technique.citations) {
        expect(CITATION_IDS).toContain(id)
        expect(resolves(citationLabelKey(id))).toBe(true)
        expect(resolves(citationSourceKey(id))).toBe(true)
      }
    },
  )

  it.each(TECHNIQUES.map((technique) => [technique.code, technique] as const))(
    "%s says it is not a substitute for reliever medicine",
    (_code, technique) => {
      const cautions = resolvesList(techniqueCautionsKey(technique.code)).join(' ').toLowerCase()
      expect(cautions).toContain('reliever')
    },
  )

  it('marks every technique\'s steps as written by the build team, pending review', () => {
    for (const technique of TECHNIQUES) {
      expect(technique.stepsProvenance).toBe('DESCRIPTIVE_PENDING_REVIEW')
    }
    expect(resolves('rehab:review.stepsWrittenByTeam')).toBe(true)
  })

  it('carries no invented counts, ratios or durations in any step', () => {
    // The clinical research grades these techniques but contains no
    // step-by-step protocol, so any number in a step would be invented
    // clinical content. Digits are the cheap, reliable proxy for that.
    for (const technique of TECHNIQUES) {
      for (const step of resolvesList(techniqueStepsKey(technique.code))) {
        expect(step).not.toMatch(/\d/)
      }
    }
  })

  it('describes evidence strength in words, for every level in use', () => {
    for (const technique of TECHNIQUES) {
      expect(resolves(`rehab:techniques.evidence.${technique.evidence}`)).toBe(true)
    }
  })
})

/* ------------------------------------------------------------------------- */
/* Red flags                                                                  */
/* ------------------------------------------------------------------------- */

describe('red-flag content', () => {
  it('separates emergency, worsening and non-acute signs', () => {
    expect(redFlagsByUrgency(RED_FLAG_URGENCY.EMERGENCY).length).toBeGreaterThan(0)
    expect(redFlagsByUrgency(RED_FLAG_URGENCY.WORSENING).length).toBeGreaterThan(0)
    expect(redFlagsByUrgency(RED_FLAG_URGENCY.NON_ACUTE).length).toBeGreaterThan(0)
  })

  it.each(RED_FLAGS.map((flag) => [flag.id, flag] as const))(
    '%s has a title, a detail and at least one real citation',
    (_id, flag) => {
      expect(resolves(redFlagTitleKey(flag.id))).toBe(true)
      expect(resolves(redFlagDetailKey(flag.id))).toBe(true)
      expect(flag.citations.length).toBeGreaterThan(0)
      for (const id of flag.citations) expect(CITATION_IDS).toContain(id)
    },
  )

  it('states the equipment condition on every sign that needs a device', () => {
    const conditioned = RED_FLAGS.filter((flag) => flag.requiresEquipment !== undefined)
    expect(conditioned.length).toBeGreaterThan(0)
    for (const flag of conditioned) {
      expect(resolves(`rehab:safety.equipment.${flag.requiresEquipment}`)).toBe(true)
    }
  })

  it('keeps the two-week cough as a separate, non-acute TB screening prompt', () => {
    const tb = RED_FLAGS.find((flag) => flag.id === 'COUGH_TWO_WEEKS_TB')
    expect(tb?.urgency).toBe(RED_FLAG_URGENCY.NON_ACUTE)
    expect(tb?.citations).toContain('DOH_NTP_WHO_TB')
  })

  it('names no medicine dose or puff count anywhere in the red-flag copy', () => {
    // Doses are clinician-authored per patient. The guideline's own referral
    // criterion mentions six puffs; ours must not.
    for (const flag of RED_FLAGS) {
      const copy = `${String(t(redFlagTitleKey(flag.id)))} ${String(t(redFlagDetailKey(flag.id)))}`
      expect(copy.toLowerCase()).not.toContain('puff')
      expect(copy.toLowerCase()).not.toMatch(/\bmg\b/)
    }
  })

  it('publishes the equipment-free breathing-rate reference with its citation', () => {
    for (const band of RESPIRATORY_RATE_BANDS) {
      expect(resolves(`rehab:safety.respiratoryRate.band.${band}.age`)).toBe(true)
      expect(resolves(`rehab:safety.respiratoryRate.band.${band}.rate`)).toBe(true)
    }
    // The guideline's two versions of these figures disagree; the difference is
    // shown rather than silently resolved.
    expect(resolves('rehab:safety.respiratoryRate.discrepancy')).toBe(true)
    expect(resolves('rehab:safety.respiratoryRate.notYourThreshold')).toBe(true)
  })

  it('says plainly what the app will not do', () => {
    expect(resolves('rehab:safety.appBoundary.body')).toBe(true)
    expect(String(t('rehab:safety.appBoundary.fallback'))).toContain('healthcare professional')
  })
})

/* ------------------------------------------------------------------------- */
/* Citations                                                                  */
/* ------------------------------------------------------------------------- */

describe('citations', () => {
  it.each(CITATION_IDS)('%s has a label, a full reference and a confidence sentence', (id) => {
    expect(resolves(citationLabelKey(id))).toBe(true)
    expect(resolves(citationSourceKey(id))).toBe(true)
    expect(resolves(`rehab:provenance.confidence.${CITATIONS[id].confidence}`)).toBe(true)
  })

  it('flags every citation the research could not verify against a primary source', () => {
    const unverified = CITATION_IDS.filter((id) => CITATIONS[id].needsVerification === true)
    expect(unverified).toContain('ACBT_CONTRAINDICATION')
    expect(unverified).toContain('COCHRANE_BREATHING')
    expect(resolves('rehab:provenance.verifyNote')).toBe(true)
  })
})

/* ------------------------------------------------------------------------- */
/* Action plan template                                                       */
/* ------------------------------------------------------------------------- */

describe('action plan template', () => {
  it('has three zones, each with a name, a state word and a plain-language meaning', () => {
    expect(PLAN_ZONES).toEqual(['GREEN', 'YELLOW', 'RED'])
    for (const zone of PLAN_ZONES) {
      expect(resolves(zoneNameKey(zone))).toBe(true)
      expect(resolves(zoneStateKey(zone))).toBe(true)
      expect(resolves(zoneMeaningKey(zone))).toBe(true)
    }
  })

  it('labels every field and every contact slot', () => {
    for (const field of PLAN_FIELDS) expect(resolves(planFieldKey(field))).toBe(true)
    for (const field of CONTACT_FIELDS) expect(resolves(`rehab:plan.contacts.${field}`)).toBe(true)
  })

  it('treats peak flow as optional and everything clinical as clinician-only', () => {
    const peakFlow = PLAN_FIELD_SPECS.find((spec) => spec.field === 'peakFlow')
    expect(peakFlow?.optional).toBe(true)
    for (const spec of PLAN_FIELD_SPECS) expect(spec.clinicianOnly).toBe(true)
  })

  it('has an empty-field message that never reads as clinical advice', () => {
    expect(String(t('rehab:plan.notFilled'))).toBe(
      'Your practitioner has not filled this in yet.',
    )
  })
})

/* ------------------------------------------------------------------------- */
/* Plan parsing — a malformed row must degrade, never fabricate               */
/* ------------------------------------------------------------------------- */

describe('parsePlanDetails', () => {
  it('returns an empty plan for anything that is not an object', () => {
    for (const value of [null, undefined, 'plan', 42, []]) {
      const parsed = parsePlanDetails(value)
      expect(parsed.actionPlan).toBeNull()
      expect(parsed.activities).toEqual([])
    }
  })

  it('keeps only the fields a clinician actually filled in', () => {
    const parsed = parsePlanDetails({
      actionPlan: {
        templateId: 'PAPP_2021_WAAP_SYMPTOM_BASED',
        zones: { GREEN: { howYouFeel: 'No cough, sleeping well', medicines: '   ' } },
      },
    })
    expect(parsed.actionPlan?.zones.GREEN).toEqual({ howYouFeel: 'No cough, sleeping well' })
    // Whitespace is not a filled-in field: a blank line under "Medicines"
    // reads as an instruction to take nothing.
    expect(parsed.actionPlan?.zones.GREEN?.medicines).toBeUndefined()
    expect(parsed.actionPlan?.zones.YELLOW).toBeUndefined()
    expect(parsed.actionPlan?.zones.RED).toBeUndefined()
  })

  it('drops activity codes it does not recognise rather than rendering them', () => {
    const parsed = parsePlanDetails({
      activities: [
        { code: 'HUFF_COUGHING', frequency: 'daily' },
        { code: 'BUTEYKO' },
        { code: 'PURSED_LIP_BREATHING', frequency: 'twice a day' },
        'not an object',
      ],
    })
    expect(parsed.activities).toEqual([
      { code: 'PURSED_LIP_BREATHING', frequency: 'twice a day' },
    ])
  })

  it('never invents a value for a missing field', () => {
    const parsed = parsePlanDetails({ actionPlan: {}, activities: [] })
    expect(parsed.actionPlan?.zones).toEqual({})
    expect(parsed.actionPlan?.contacts).toEqual({})
    expect(isActionPlanEmpty(parsed.actionPlan)).toBe(true)
  })
})

describe('approval gates', () => {
  it('treats only APPROVED as a live plan', () => {
    expect(isApproved({ approvalStatus: REVIEW_STATUSES.APPROVED })).toBe(true)
    for (const status of [
      REVIEW_STATUSES.DRAFT,
      REVIEW_STATUSES.PENDING_REVIEW,
      REVIEW_STATUSES.DISAPPROVED,
      REVIEW_STATUSES.FURTHER_REVIEW_REQUESTED,
    ]) {
      expect(isApproved({ approvalStatus: status })).toBe(false)
    }
    expect(isApproved(null)).toBe(false)
  })

  it('distinguishes "still being written" from "no plan at all"', () => {
    expect(isAwaitingApproval({ approvalStatus: REVIEW_STATUSES.DRAFT })).toBe(true)
    expect(isAwaitingApproval({ approvalStatus: REVIEW_STATUSES.PENDING_REVIEW })).toBe(true)
    expect(isAwaitingApproval({ approvalStatus: REVIEW_STATUSES.APPROVED })).toBe(false)
    expect(isAwaitingApproval(null)).toBe(false)
  })
})

describe('completions', () => {
  const base = { id: 'c', rehabPlanId: 'p', patientId: 'pt' }

  it('reads the activity code back out of a completion row', () => {
    expect(parseCompletionDetails({ activityCode: 'PURSED_LIP_BREATHING' }).activityCode).toBe(
      'PURSED_LIP_BREATHING',
    )
    expect(parseCompletionDetails({ activityCode: 'HUFF_COUGHING' }).activityCode).toBeNull()
    expect(parseCompletionDetails(null).activityCode).toBeNull()
  })

  it('counts only the last seven days', () => {
    const now = new Date('2026-08-29T12:00:00.000Z')
    const rows = [
      { ...base, id: 'a', completedAt: '2026-08-28T12:00:00.000Z', details: { activityCode: 'PURSED_LIP_BREATHING' } },
      { ...base, id: 'b', completedAt: '2026-08-01T12:00:00.000Z', details: { activityCode: 'PURSED_LIP_BREATHING' } },
    ]
    expect(countRecentCompletions(rows, 'PURSED_LIP_BREATHING', now)).toBe(1)
  })
})

/* ------------------------------------------------------------------------- */
/* Repository                                                                 */
/* ------------------------------------------------------------------------- */

describe('rehab repository', () => {
  async function makeDb() {
    const db = new AuscultaDB(`ausculta-rehab-${crypto.randomUUID()}`)
    await db.patients.add({
      id: 'patient-1',
      studyId: 'S1',
      linkedUserId: 'user-1',
      assignedPractitionerIds: [],
      assignedHealthWorkerIds: [],
      consent: null,
      respiratoryHistory: [],
      familyHistory: [],
      preferredLanguage: 'en',
      isDemo: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'Ana',
      birthDate: '2012-01-01',
      sex: 'FEMALE',
    })
    return db
  }

  const plan = (overrides: Partial<RehabPlan> = {}): RehabPlan => ({
    id: 'plan-1',
    patientId: 'patient-1',
    practitionerId: 'prac-1',
    approvalStatus: REVIEW_STATUSES.APPROVED,
    createdAt: '2026-08-01T00:00:00.000Z',
    details: { activities: [{ code: 'PURSED_LIP_BREATHING' }] },
    ...overrides,
  })

  it('reports "none" when nothing has been assigned', async () => {
    const db = await makeDb()

    const overview = await createRehabRepository(db).loadForUser('user-1')
    expect(overview.state).toBe('none')
    expect(overview.details).toBeNull()
  })

  it('never returns plan details for an unapproved plan', async () => {
    const db = await makeDb()
    await db.rehabPlans.add(plan({ approvalStatus: REVIEW_STATUSES.PENDING_REVIEW }))

    const overview = await createRehabRepository(db).loadForPatient('patient-1')
    expect(overview.state).toBe('awaiting-approval')
    expect(overview.details).toBeNull()
  })

  it('prefers an approved plan over a newer unapproved revision', async () => {
    const db = await makeDb()
    await db.rehabPlans.bulkAdd([
      plan(),
      plan({
        id: 'plan-2',
        approvalStatus: REVIEW_STATUSES.DRAFT,
        createdAt: '2026-08-20T00:00:00.000Z',
      }),
    ])

    const overview = await createRehabRepository(db).loadForPatient('patient-1')
    expect(overview.state).toBe('approved')
    expect(overview.plan?.id).toBe('plan-1')
  })

  it('refuses to log a completion against an unapproved plan', async () => {
    const db = await makeDb()
    await db.rehabPlans.add(plan({ approvalStatus: REVIEW_STATUSES.DRAFT }))

    await expect(
      createRehabRepository(db).logCompletion({
        planId: 'plan-1',
        patientId: 'patient-1',
        activityCode: 'PURSED_LIP_BREATHING',
      }),
    ).rejects.toThrow(/approved/i)
  })

  it('refuses to log a completion for an activity nobody assigned', async () => {
    const db = await makeDb()
    await db.rehabPlans.add(plan())

    await expect(
      createRehabRepository(db).logCompletion({
        planId: 'plan-1',
        patientId: 'patient-1',
        activityCode: 'EXERCISE_WARM_UP',
      }),
    ).rejects.toThrow(/not assigned/i)
  })

  it('logs a completion against an approved, assigned activity', async () => {
    const db = await makeDb()
    await db.rehabPlans.add(plan())

    const completion = await createRehabRepository(db).logCompletion({
      planId: 'plan-1',
      patientId: 'patient-1',
      activityCode: 'PURSED_LIP_BREATHING',
      completedAt: '2026-08-29T09:00:00.000Z',
    })

    expect(await db.rehabCompletions.get(completion.id)).toBeDefined()
    expect(parseCompletionDetails(completion.details).activityCode).toBe('PURSED_LIP_BREATHING')
  })
})

/* ------------------------------------------------------------------------- */
/* Localisation policy                                                        */
/* ------------------------------------------------------------------------- */

describe('clinical localisation policy', () => {
  it('registers no Filipino bundle for this namespace', () => {
    // Clinical, consent and safety text must not be machine-translated. Until a
    // human translation is reviewed and version-stamped, English is the only
    // bundle that exists.
    expect(appI18n.hasResourceBundle('fil', 'rehab')).toBe(false)
  })

  it('keeps the official Tagalog wording as an unapproved draft that cannot render', () => {
    expect(TAGALOG_WAAP_DRAFT.status).toBe('DRAFT_PENDING_REVIEW')
    expect(TAGALOG_WAAP_DRAFT.blockedBy.length).toBeGreaterThan(0)
    expect(() => assertApprovedForDisplay(TAGALOG_WAAP_DRAFT)).toThrow(/DRAFT_PENDING_REVIEW/)
  })

  it('states in the UI that a clinician has not reviewed this content', () => {
    expect(REHAB_CLINICIAN_REVIEWED).toBe(false)
    expect(resolves('rehab:review.pendingTitle')).toBe(true)
    expect(resolves('rehab:review.pendingBody')).toBe(true)
  })
})
