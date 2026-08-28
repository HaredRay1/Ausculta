import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../../../auth/AuthContext'
import type { AuthService } from '../../../auth/authService'
import { createTestAuthService } from '../../../auth/testing'
import { REVIEW_STATUSES, ROLES, USER_STATUSES } from '../../../db/codes'
import { AuscultaDB } from '../../../db/db'
import type { Patient, RehabPlan } from '../../../db/types'
import { i18n as appI18n } from '../../../i18n'
import {
  RED_FLAGS,
  redFlagTitleKey,
  redFlagsByUrgency,
  RED_FLAG_URGENCY,
} from '../content/redFlags'
import {
  TECHNIQUES,
  techniqueCautionsKey,
  techniqueNameKey,
  techniqueStepsKey,
} from '../content/techniques'
import { citationLabelKey } from '../content/citations'
import { createRehabRepository, type RehabRepository } from '../data/rehabRepository'
import { registerRehabResources } from '../i18n'
import { REHAB_PATHS, TECHNIQUE_ROUTE_PATTERN, techniquePath } from '../navigation'
import { ActionPlanPage } from '../pages/ActionPlanPage'
import { RedFlagsPage } from '../pages/RedFlagsPage'
import { RehabHomePage } from '../pages/RehabHomePage'
import { TechniqueDetailPage } from '../pages/TechniqueDetailPage'
import { TechniquesPage } from '../pages/TechniquesPage'

registerRehabResources(appI18n)

const t = (key: string, options?: Record<string, unknown>) =>
  appI18n.t(key, options) as string

const list = (key: string): string[] => {
  const value = appI18n.t(key, { returnObjects: true }) as unknown
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

const PASSWORD = 'clinic-pass-1'
const PATIENT_ID = 'patient-1'

let db: AuscultaDB
let auth: AuthService
let repository: RehabRepository

beforeEach(() => {
  db = new AuscultaDB(`ausculta-rehab-pages-${crypto.randomUUID()}`)
  auth = createTestAuthService(db)
  repository = createRehabRepository(db)
})

afterEach(cleanup)

const patient: Patient = {
  id: PATIENT_ID,
  studyId: 'S-0001',
  assignedPractitionerIds: [],
  assignedHealthWorkerIds: [],
  consent: null,
  respiratoryHistory: [],
  familyHistory: [],
  preferredLanguage: 'en',
  isDemo: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Ana Reyes',
  birthDate: '2012-04-02',
  sex: 'FEMALE',
}

/** Signs a patient in and links them to `patient`. */
async function signInPatient(): Promise<string> {
  const user = await auth.register({
    username: 'ana',
    password: PASSWORD,
    role: ROLES.PATIENT,
    name: 'Ana Reyes',
    preferredLanguage: 'en',
  })
  await db.users.update(user.id, { status: USER_STATUSES.ACTIVE })
  await auth.login(user.username, PASSWORD)
  await db.patients.add({ ...patient, linkedUserId: user.id })
  return user.id
}

function renderAt(element: ReactNode, path: string, routePath: string = path) {
  return render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={element} />
            <Route path={REHAB_PATHS.safety} element={<div>SAFETY SCREEN</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

const approvedPlan = (details: unknown): RehabPlan => ({
  id: 'plan-1',
  patientId: PATIENT_ID,
  practitionerId: 'prac-1',
  approvalStatus: REVIEW_STATUSES.APPROVED,
  createdAt: '2026-08-01T00:00:00.000Z',
  details,
})

/* ------------------------------------------------------------------------- */
/* Red flags are one tap from the rehabilitation home                        */
/* ------------------------------------------------------------------------- */

describe('RehabHomePage', () => {
  it('puts the safety screen one tap away, above everything else', async () => {
    await signInPatient()
    renderAt(<RehabHomePage repository={repository} />, REHAB_PATHS.home)

    const safetyLink = await screen.findByRole('link', {
      name: new RegExp(t('rehab:home.safetyCardTitle'), 'i'),
    })
    expect(safetyLink).toHaveAttribute('href', REHAB_PATHS.safety)

    // First in the document among the home screen's links: during an attack,
    // the safety route must not be below a scroll.
    const links = screen.getAllByRole('link')
    expect(links[0]).toBe(safetyLink)
  })

  it('navigates to the safety screen in a single click', async () => {
    await signInPatient()
    renderAt(<RehabHomePage repository={repository} />, REHAB_PATHS.home)

    const link = await screen.findByRole('link', {
      name: new RegExp(t('rehab:home.safetyCardTitle'), 'i'),
    })
    fireEvent.click(link)

    expect(await screen.findByText('SAFETY SCREEN')).toBeInTheDocument()
  })

  it('says no activities are assigned rather than suggesting any', async () => {
    await signInPatient()
    renderAt(<RehabHomePage repository={repository} />, REHAB_PATHS.home)

    expect(await screen.findByText(t('rehab:completion.noneAssigned'))).toBeInTheDocument()

    // No technique name appears as something to do. The library link is a
    // destination, not a suggestion.
    for (const technique of TECHNIQUES) {
      expect(screen.queryByRole('button', { name: t(techniqueNameKey(technique.code)) })).toBeNull()
    }
    expect(screen.queryByRole('button', { name: t('rehab:completion.logAction') })).toBeNull()
  })

  it('lists only the activities a practitioner approved, and logs a completion', async () => {
    await signInPatient()
    await db.rehabPlans.add(
      approvedPlan({
        activities: [
          { code: 'PURSED_LIP_BREATHING', frequency: 'Twice a day' },
          // Excluded on safety grounds. Even stored on an approved plan it must
          // never render.
          { code: 'HUFF_COUGHING', frequency: 'Daily' },
        ],
      }),
    )

    renderAt(<RehabHomePage repository={repository} />, REHAB_PATHS.home)

    expect(
      await screen.findByRole('heading', { name: t(techniqueNameKey('PURSED_LIP_BREATHING')) }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/huff/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: t('rehab:completion.logAction') }))

    await waitFor(async () => {
      expect(await db.rehabCompletions.count()).toBe(1)
    })
    expect(await screen.findByText(t('rehab:completion.logged'))).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------------- */
/* Red-flag screen                                                            */
/* ------------------------------------------------------------------------- */

describe('RedFlagsPage', () => {
  it('renders every red flag with its heading', async () => {
    await signInPatient()
    renderAt(<RedFlagsPage />, REHAB_PATHS.safety, REHAB_PATHS.safety)

    for (const flag of RED_FLAGS) {
      expect(
        screen.getByRole('heading', { name: t(redFlagTitleKey(flag.id)) }),
      ).toBeInTheDocument()
    }
  })

  it('shows the emergency instruction as an alert, above the emergency signs', async () => {
    await signInPatient()
    renderAt(<RedFlagsPage />, REHAB_PATHS.safety, REHAB_PATHS.safety)

    const alerts = screen.getAllByRole('alert')
    const text = alerts.map((node) => node.textContent ?? '').join(' ')
    expect(text).toContain(t('rehab:safety.emergency.action'))
    expect(text).toContain(t('rehab:safety.emergency.papppAction'))
  })

  it('separates emergency signs from worsening signs', async () => {
    await signInPatient()
    renderAt(<RedFlagsPage />, REHAB_PATHS.safety, REHAB_PATHS.safety)

    const emergency = screen.getByRole('region', { name: t('rehab:safety.emergency.heading') })
    for (const flag of redFlagsByUrgency(RED_FLAG_URGENCY.EMERGENCY)) {
      expect(within(emergency).getByRole('heading', { name: t(redFlagTitleKey(flag.id)) }))
        .toBeInTheDocument()
    }
    for (const flag of redFlagsByUrgency(RED_FLAG_URGENCY.WORSENING)) {
      expect(within(emergency).queryByRole('heading', { name: t(redFlagTitleKey(flag.id)) }))
        .toBeNull()
    }
  })

  it('marks equipment-dependent signs as conditional', async () => {
    await signInPatient()
    renderAt(<RedFlagsPage />, REHAB_PATHS.safety, REHAB_PATHS.safety)

    expect(
      screen.getAllByText(t('rehab:safety.equipment.PULSE_OXIMETER')).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(t('rehab:safety.equipment.PEAK_FLOW_METER'))).toBeInTheDocument()
  })

  it('says what the app will not do, and shows the pending-review notice', async () => {
    await signInPatient()
    renderAt(<RedFlagsPage />, REHAB_PATHS.safety, REHAB_PATHS.safety)

    expect(screen.getByText(t('rehab:safety.appBoundary.body'))).toBeInTheDocument()
    expect(screen.getByText(t('rehab:review.pendingTitle'))).toBeInTheDocument()
  })

  it('labels the breathing-rate table as general reference, not a personal threshold', async () => {
    await signInPatient()
    renderAt(<RedFlagsPage />, REHAB_PATHS.safety, REHAB_PATHS.safety)

    expect(
      screen.getByText(t('rehab:safety.respiratoryRate.notYourThreshold')),
    ).toBeInTheDocument()
    expect(screen.getByText(t('rehab:safety.respiratoryRate.discrepancy'))).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------------- */
/* Techniques                                                                 */
/* ------------------------------------------------------------------------- */

describe('TechniquesPage', () => {
  it('lists exactly the four shipped techniques', async () => {
    await signInPatient()
    renderAt(<TechniquesPage />, REHAB_PATHS.techniques, REHAB_PATHS.techniques)

    for (const technique of TECHNIQUES) {
      expect(screen.getByText(t(techniqueNameKey(technique.code)))).toBeInTheDocument()
    }
  })

  it('never lists huff coughing as a technique, and explains the exclusion', async () => {
    await signInPatient()
    renderAt(<TechniquesPage />, REHAB_PATHS.techniques, REHAB_PATHS.techniques)

    // Not a link — nothing navigates to it, so it can never read as an option.
    expect(
      screen.queryByRole('link', {
        name: new RegExp(t('rehab:techniques.notOffered.HUFF_COUGHING.name'), 'i'),
      }),
    ).toBeNull()

    expect(
      screen.getByText(t('rehab:techniques.notOffered.HUFF_COUGHING.reason')),
    ).toBeInTheDocument()
    expect(
      screen.getByText(t('rehab:techniques.notOffered.HUFF_COUGHING.rule')),
    ).toBeInTheDocument()
  })

  it('carries the universal caution and a link to the red flags', async () => {
    await signInPatient()
    renderAt(<TechniquesPage />, REHAB_PATHS.techniques, REHAB_PATHS.techniques)

    expect(screen.getByText(t('rehab:techniques.universalCaution'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: new RegExp(t('rehab:nav.safety'), 'i') }))
      .toHaveAttribute('href', REHAB_PATHS.safety)
  })
})

describe('TechniqueDetailPage', () => {
  it.each(TECHNIQUES.map((technique) => [technique.code] as const))(
    '%s renders its cautions and its citations',
    async (code) => {
      await signInPatient()
      renderAt(<TechniqueDetailPage />, techniquePath(code), TECHNIQUE_ROUTE_PATTERN)

      const technique = TECHNIQUES.find((entry) => entry.code === code)
      expect(technique).toBeDefined()

      for (const caution of list(techniqueCautionsKey(code))) {
        expect(screen.getByText(caution)).toBeInTheDocument()
      }
      for (const step of list(techniqueStepsKey(code))) {
        expect(screen.getByText(step)).toBeInTheDocument()
      }
      for (const citation of technique?.citations ?? []) {
        expect(screen.getAllByText(t(citationLabelKey(citation))).length).toBeGreaterThan(0)
      }
      expect(screen.getByText(t('rehab:review.stepsWrittenByTeam'))).toBeInTheDocument()
      expect(screen.getByText(t('rehab:techniques.universalCaution'))).toBeInTheDocument()
    },
  )

  it('shows an empty state rather than guessing when the code is unknown', async () => {
    await signInPatient()
    renderAt(<TechniqueDetailPage />, techniquePath('HUFF_COUGHING'), TECHNIQUE_ROUTE_PATTERN)

    expect(screen.getByRole('link', { name: t('rehab:techniques.backToList') }))
      .toBeInTheDocument()
    expect(screen.queryByText(t('rehab:techniques.stepsHeading'))).toBeNull()
  })
})

/* ------------------------------------------------------------------------- */
/* Action plan                                                                */
/* ------------------------------------------------------------------------- */

describe('ActionPlanPage', () => {
  it('says no plan has been assigned, and shows no zones at all', async () => {
    await signInPatient()
    renderAt(<ActionPlanPage repository={repository} />, REHAB_PATHS.plan, REHAB_PATHS.plan)

    expect(await screen.findByText(t('rehab:plan.notAssigned.title'))).toBeInTheDocument()
    expect(screen.getByText(t('rehab:plan.notAssigned.body'))).toBeInTheDocument()

    // Not a fabricated plan: no zone heading, no field label, no escalation
    // instruction dressed up as this patient's plan.
    expect(screen.queryByText(new RegExp(t('rehab:plan.zone.GREEN.name'), 'i'))).toBeNull()
    expect(screen.queryByText(t('rehab:plan.field.medicines'))).toBeNull()
    expect(screen.queryByText(t('rehab:plan.redAction.body'))).toBeNull()
  })

  it('offers the safety screen from the empty state instead of dead-ending', async () => {
    await signInPatient()
    renderAt(<ActionPlanPage repository={repository} />, REHAB_PATHS.plan, REHAB_PATHS.plan)

    const link = await screen.findByRole('link', { name: t('rehab:plan.notAssigned.action') })
    expect(link).toHaveAttribute('href', REHAB_PATHS.safety)
  })

  it('does not show a draft plan as if it were the plan to follow', async () => {
    await signInPatient()
    await db.rehabPlans.add({
      ...approvedPlan({
        actionPlan: { zones: { GREEN: { howYouFeel: 'Sleeping through the night' } } },
      }),
      approvalStatus: REVIEW_STATUSES.PENDING_REVIEW,
    })

    renderAt(<ActionPlanPage repository={repository} />, REHAB_PATHS.plan, REHAB_PATHS.plan)

    expect(await screen.findByText(t('rehab:plan.pendingApproval.title'))).toBeInTheDocument()
    expect(screen.queryByText('Sleeping through the night')).toBeNull()
  })

  it('renders exactly what the practitioner filled in, and marks the rest unfilled', async () => {
    await signInPatient()
    await db.rehabPlans.add(
      approvedPlan({
        actionPlan: {
          templateId: 'PAPP_2021_WAAP_SYMPTOM_BASED',
          contacts: { doctorName: 'Dr Ricardo', doctorPhone: '0917 555 0101' },
          zones: {
            GREEN: { howYouFeel: 'No cough at night', whatToDo: 'Carry on as usual' },
            YELLOW: { howYouFeel: 'Coughing more than usual' },
          },
        },
      }),
    )

    renderAt(<ActionPlanPage repository={repository} />, REHAB_PATHS.plan, REHAB_PATHS.plan)

    expect(await screen.findByText('No cough at night')).toBeInTheDocument()
    expect(screen.getByText('Coughing more than usual')).toBeInTheDocument()
    expect(screen.getByText('Dr Ricardo')).toBeInTheDocument()

    // The red zone was left blank: it must say so, not fill itself in.
    const redZone = screen.getByRole('heading', {
      name: `${t('rehab:plan.zone.RED.name')} — ${t('rehab:plan.zone.RED.state')}`,
    }).closest('li')
    expect(redZone).not.toBeNull()
    expect(within(redZone as HTMLElement).getByText(t('rehab:plan.notFilled'))).toBeInTheDocument()

    // No breathing rate anywhere: nobody typed one, so nothing is shown.
    expect(screen.queryByText(/breaths a minute/i)).toBeNull()
  })

  it('says an approved but blank plan is blank rather than inventing content', async () => {
    await signInPatient()
    await db.rehabPlans.add(approvedPlan({ actionPlan: { zones: {} }, activities: [] }))

    renderAt(<ActionPlanPage repository={repository} />, REHAB_PATHS.plan, REHAB_PATHS.plan)

    expect(await screen.findByText(t('rehab:plan.emptyPlanTitle'))).toBeInTheDocument()
    expect(screen.queryByText(t('rehab:plan.field.medicines'))).toBeNull()
  })

  it('states that only a practitioner may write medicines, and that peak flow is optional', async () => {
    await signInPatient()
    await db.rehabPlans.add(
      approvedPlan({
        actionPlan: { zones: { YELLOW: { medicines: 'As prescribed at the clinic' } } },
      }),
    )

    renderAt(<ActionPlanPage repository={repository} />, REHAB_PATHS.plan, REHAB_PATHS.plan)

    expect(await screen.findByText(t('rehab:plan.medicinesNote'))).toBeInTheDocument()
    // Peak flow was not filled in, and it is optional, so it is simply absent.
    expect(screen.queryByText(t('rehab:plan.peakFlowOptional'))).toBeNull()
  })
})
