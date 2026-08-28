import { Link } from 'react-router-dom'
import {
  Banner,
  Card,
  DisclaimerBanner,
  EmptyState,
  FictionalDataBanner,
  QuestionIcon,
  Section,
  Skeleton,
} from '../../../components'
import { CitationList, PendingReviewNotice } from '../components/Provenance'
import { RehabScreen } from '../components/RehabScreen'
import {
  ACTION_PLAN_SUPPORTING_CITATIONS,
  CONTACT_FIELDS,
  PLAN_FIELD_SPECS,
  PLAN_ZONES,
  planFieldKey,
  zoneMeaningKey,
  zoneNameKey,
  zoneStateKey,
  type PlanZone,
} from '../content/actionPlanTemplate'
import {
  isActionPlanEmpty,
  isZoneEmpty,
  type ActionPlanDetails,
  type PlanContacts,
  type ZoneFields,
} from '../data/planModel'
import type { RehabRepository } from '../data/rehabRepository'
import { useRehabOverview } from '../data/useRehabOverview'
import { useRehabTranslation } from '../i18n'
import { REHAB_PATHS } from '../navigation'

/**
 * The asthma action plan viewer.
 *
 * ## The three things this screen will never do
 *
 * 1. **Generate a plan.** There is no code path in this feature that writes
 *    plan content. If no practitioner has approved one, the screen says so and
 *    offers the safety information instead — it does not offer a "starter plan",
 *    a "suggested plan" or a template pre-filled with typical values.
 * 2. **Invent a threshold.** Breathing rates, peak-flow numbers, medicine names,
 *    doses and puff counts are rendered only if a clinician typed them. A blank
 *    field renders as "your practitioner has not filled this in yet", which is
 *    a true statement, unlike any number the app could put there.
 * 3. **Treat an unapproved plan as a plan.** A draft or under-review row gets
 *    its own message, worded so nobody mistakes it for instructions to follow.
 *
 * Peak flow is marked optional throughout, because the Philippine national
 * pediatric template itself treats it as optional ("if you have this: peak
 * flow…") and the clinics this app is built for do not have meters.
 */

export interface ActionPlanPageProps {
  /** Injectable for tests; production uses the real database. */
  repository?: RehabRepository
}

export function ActionPlanPage({ repository }: ActionPlanPageProps) {
  const { t } = useRehabTranslation()
  const { overview, isLoading } = useRehabOverview(repository)

  return (
    <RehabScreen title={t('rehab:plan.title')}>
      <PendingReviewNotice />
      <p className="text-lg text-on-surface">{t('rehab:plan.lead')}</p>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <PlanBody
          state={overview.state}
          actionPlan={overview.details?.actionPlan ?? null}
          isFictional={overview.isFictional}
        />
      )}

      <DisclaimerBanner />
    </RehabScreen>
  )
}

function PlanBody({
  state,
  actionPlan,
  isFictional,
}: {
  state: 'approved' | 'awaiting-approval' | 'none'
  actionPlan: ActionPlanDetails | null
  isFictional: boolean
}) {
  const { t } = useRehabTranslation()

  if (state === 'none') {
    return (
      <EmptyState
        title={t('rehab:plan.notAssigned.title')}
        body={t('rehab:plan.notAssigned.body')}
        icon={<QuestionIcon className="size-10" />}
        action={
          <Link
            to={REHAB_PATHS.safety}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-control bg-primary-strong px-5 text-lg font-semibold text-on-primary"
          >
            {t('rehab:plan.notAssigned.action')}
          </Link>
        }
      />
    )
  }

  if (state === 'awaiting-approval') {
    return (
      <Banner tone="warning" title={t('rehab:plan.pendingApproval.title')}>
        {t('rehab:plan.pendingApproval.body')}
      </Banner>
    )
  }

  return (
    <>
      {isFictional && <FictionalDataBanner />}

      {isActionPlanEmpty(actionPlan) ? (
        <EmptyState
          title={t('rehab:plan.emptyPlanTitle')}
          body={t('rehab:plan.emptyPlanBody')}
          icon={<QuestionIcon className="size-10" />}
        />
      ) : (
        <>
          <ContactBlock contacts={actionPlan?.contacts ?? {}} />
          <Section title={t('rehab:plan.zoneHeading')}>
            <ul className="flex flex-col gap-3">
              {PLAN_ZONES.map((zone) => (
                <ZoneCard key={zone} zone={zone} fields={actionPlan?.zones[zone]} />
              ))}
            </ul>
          </Section>
          <RedZoneAction />
        </>
      )}

      <Card>
        <p className="text-base text-muted">{t('rehab:plan.templateSource')}</p>
        <p className="mt-2 text-base text-on-surface">{t('rehab:plan.reviewReminder')}</p>
        <CitationList citations={ACTION_PLAN_SUPPORTING_CITATIONS} />
      </Card>
    </>
  )
}

/**
 * Who to contact, at the top, exactly as the national template puts it.
 *
 * Above the zones on purpose: in the red zone the phone number is the whole
 * instruction, and it should not be at the bottom of a scroll.
 */
function ContactBlock({ contacts }: { contacts: PlanContacts }) {
  const { t } = useRehabTranslation()

  return (
    <Section title={t('rehab:plan.contacts.heading')}>
      <Card>
        <dl className="flex flex-col gap-2">
          {CONTACT_FIELDS.map((field) => {
            const value = contacts[field]
            const isPhone = field === 'doctorPhone' || field === 'emergencyPhone'
            return (
              <div key={field}>
                <dt className="text-base font-semibold text-on-surface">
                  {t(`rehab:plan.contacts.${field}`)}
                </dt>
                <dd className="text-base text-on-surface">
                  {value === undefined ? (
                    <span className="text-muted">{t('rehab:plan.contacts.empty')}</span>
                  ) : isPhone ? (
                    <a
                      href={`tel:${value.replace(/\s/g, '')}`}
                      className="inline-flex min-h-12 items-center text-primary underline"
                    >
                      {value}
                    </a>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      </Card>
    </Section>
  )
}

/**
 * One zone.
 *
 * The zone is named by its colour word *and* its state word ("Green zone —
 * doing well"), never by a colour swatch alone. A person who cannot
 * distinguish the three colours must still be able to read the plan, and a
 * traffic-light plan is exactly the kind of artifact that usually fails that.
 */
function ZoneCard({ zone, fields }: { zone: PlanZone; fields: ZoneFields | undefined }) {
  const { t } = useRehabTranslation()
  const headingId = `rehab-zone-${zone}`

  return (
    <Card as="li" aria-labelledby={headingId}>
      <h3 id={headingId} className="font-heading text-lg font-bold text-on-surface">
        {t(zoneNameKey(zone))} — {t(zoneStateKey(zone))}
      </h3>
      <p className="mt-1 text-base text-muted">{t(zoneMeaningKey(zone))}</p>

      {isZoneEmpty(fields) ? (
        <p className="mt-3 text-base font-semibold text-on-surface">
          {t('rehab:plan.notFilled')}
        </p>
      ) : (
        <dl className="mt-3 flex flex-col gap-3">
          {PLAN_FIELD_SPECS.map((spec) => {
            const value = fields?.[spec.field]
            // An optional field nobody filled in is simply absent, not a gap:
            // most of these clinics have no peak flow meter and printing
            // "not filled in" against it every time reads as a missing step.
            if (value === undefined && spec.optional) return null

            return (
              <div key={spec.field}>
                <dt className="text-base font-semibold text-on-surface">
                  {t(planFieldKey(spec.field))}
                </dt>
                <dd className="text-base text-on-surface">
                  {value ?? (
                    <span className="text-muted">{t('rehab:plan.notFilled')}</span>
                  )}
                </dd>
                {spec.field === 'peakFlow' && (
                  <p className="mt-1 text-sm text-muted">{t('rehab:plan.peakFlowOptional')}</p>
                )}
                {spec.field === 'medicines' && (
                  <p className="mt-1 text-sm text-muted">{t('rehab:plan.medicinesNote')}</p>
                )}
              </div>
            )
          })}
        </dl>
      )}
    </Card>
  )
}

/**
 * The escalation sentence.
 *
 * This is the one piece of plan content the app supplies rather than the
 * clinician, and it is safe to: it is the fixed printed text of the national
 * template's red zone, it names no dose and no threshold, and it says only
 * "get medical care now" — the universal fallback the specification already
 * commits Ausculta to.
 */
function RedZoneAction() {
  const { t } = useRehabTranslation()

  return (
    <Banner tone="danger" title={t('rehab:plan.redAction.heading')}>
      <p className="text-lg font-semibold">{t('rehab:plan.redAction.body')}</p>
      <CitationList citations={['PAPP_2021']} heading={false} />
    </Banner>
  )
}
