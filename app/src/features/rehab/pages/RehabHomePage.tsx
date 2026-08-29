import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Banner,
  Button,
  Card,
  CheckIcon,
  ChevronRightIcon,
  DangerIcon,
  DisclaimerBanner,
  EmptyState,
  FictionalDataBanner,
  HandIcon,
  InboxIcon,
  LungsIcon,
  Section,
  Skeleton,
  type IconComponent,
} from '../../../components'
import { PendingReviewNotice } from '../components/Provenance'
import { RehabScreen } from '../components/RehabScreen'
import { techniqueNameKey, type RehabActivityCode } from '../content/techniques'
import { countRecentCompletions, type AssignedActivity } from '../data/planModel'
import { rehabRepository as defaultRepository, type RehabRepository } from '../data/rehabRepository'
import { useRehabOverview } from '../data/useRehabOverview'
import { useRehabTranslation } from '../i18n'
import { REHAB_PATHS } from '../navigation'

/**
 * The rehabilitation home.
 *
 * Priority order on this screen is the priority order of the whole module:
 *
 * 1. **Safety.** First card, largest, and one tap to the red flags. It is the
 *    only content here that is useful to every user regardless of whether a
 *    practitioner has done anything, and it is the content that protects them.
 * 2. **The action plan**, which is theirs and specific.
 * 3. **The technique library**, which is general education.
 * 4. **Their assigned activities**, if a practitioner approved any — with the
 *    one write this feature offers, logging that they did one.
 *
 * Nothing on this screen suggests an activity. Suggestions come from a
 * practitioner through an approved plan, or not at all.
 */

export interface RehabHomePageProps {
  /** Injectable for tests; production uses the real database. */
  repository?: RehabRepository
}

export function RehabHomePage({ repository = defaultRepository }: RehabHomePageProps) {
  const { t } = useRehabTranslation()
  const { overview, isLoading, reload } = useRehabOverview(repository)

  return (
    <RehabScreen title={t('rehab:home.title')} backTo={null}>
      <PendingReviewNotice />
      <p className="text-lg text-on-surface">{t('rehab:home.lead')}</p>

      <Section title={t('rehab:home.safetyFirstHeading')}>
        <Link
          to={REHAB_PATHS.safety}
          className="flex min-h-16 items-start gap-3 rounded-card border-2 border-destructive bg-destructive-surface p-4 text-on-destructive-surface"
        >
          <DangerIcon className="mt-0.5 size-7 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-lg font-bold">
              {t('rehab:home.safetyCardTitle')}
            </span>
            <span className="mt-0.5 block text-base">{t('rehab:home.safetyCardBody')}</span>
            <span className="mt-1 block text-base font-semibold underline">
              {t('rehab:home.safetyCardAction')}
            </span>
          </span>
          <ChevronRightIcon className="mt-1 size-6 shrink-0" />
        </Link>
      </Section>

      <Section title={t('rehab:home.goToHeading')}>
        <ul className="flex flex-col gap-3">
          <DestinationCard
            to={REHAB_PATHS.plan}
            icon={InboxIcon}
            title={t('rehab:home.planCardTitle')}
            body={t('rehab:home.planCardBody')}
          />
          <DestinationCard
            to={REHAB_PATHS.techniques}
            icon={LungsIcon}
            title={t('rehab:home.techniquesCardTitle')}
            body={t('rehab:home.techniquesCardBody')}
          />
        </ul>
      </Section>

      <Section title={t('rehab:completion.heading')}>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {overview.isFictional && <FictionalDataBanner />}
            <AssignedActivities
              planId={overview.plan?.id ?? null}
              patientId={overview.patient?.id ?? null}
              activities={overview.state === 'approved' ? (overview.details?.activities ?? []) : []}
              completionCount={(code) =>
                countRecentCompletions(overview.completions, code)
              }
              repository={repository}
              onLogged={reload}
            />
          </>
        )}
      </Section>

      <DisclaimerBanner />
    </RehabScreen>
  )
}

function DestinationCard({
  to,
  icon: Icon,
  title,
  body,
}: {
  to: string
  icon: IconComponent
  title: string
  body: string
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-16 items-start gap-3 rounded-card bg-card p-4 text-on-surface"
      >
        <Icon className="mt-0.5 size-7 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-lg font-bold">{title}</span>
          <span className="mt-0.5 block text-base text-muted">{body}</span>
        </span>
        <ChevronRightIcon className="mt-1 size-6 shrink-0 text-muted" />
      </Link>
    </li>
  )
}

/**
 * What the practitioner approved, and the button to say you did it.
 *
 * With nothing approved this is an empty state saying exactly that — never a
 * list of "activities you could try". The whole module exists to keep that
 * distinction, and an empty list with a suggestion under it would erase it.
 */
function AssignedActivities({
  planId,
  patientId,
  activities,
  completionCount,
  repository,
  onLogged,
}: {
  planId: string | null
  patientId: string | null
  activities: readonly AssignedActivity[]
  completionCount: (code: RehabActivityCode) => number
  repository: RehabRepository
  onLogged: () => void
}) {
  const { t } = useRehabTranslation()

  if (activities.length === 0 || planId === null || patientId === null) {
    return (
      <EmptyState
        title={t('rehab:completion.noneAssigned')}
        body={t('rehab:techniques.practitionerSets')}
        icon={<HandIcon className="size-10" />}
        action={
          <Link
            to={REHAB_PATHS.techniques}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-control border-2 border-border-strong bg-card px-5 text-lg font-semibold text-on-surface"
          >
            {t('rehab:home.techniquesCardTitle')}
          </Link>
        }
      />
    )
  }

  return (
    <>
      <p className="text-base text-muted">{t('rehab:completion.assignedBy')}</p>
      <ul className="flex flex-col gap-3">
        {activities.map((activity) => (
          <ActivityCard
            key={activity.code}
            activity={activity}
            planId={planId}
            patientId={patientId}
            recentCount={completionCount(activity.code)}
            repository={repository}
            onLogged={onLogged}
          />
        ))}
      </ul>
    </>
  )
}

function ActivityCard({
  activity,
  planId,
  patientId,
  recentCount,
  repository,
  onLogged,
}: {
  activity: AssignedActivity
  planId: string
  patientId: string
  recentCount: number
  repository: RehabRepository
  onLogged: () => void
}) {
  const { t } = useRehabTranslation()
  const [isSaving, setIsSaving] = useState(false)
  const [justLogged, setJustLogged] = useState(false)
  const headingId = `rehab-activity-${activity.code}`

  async function log() {
    setIsSaving(true)
    try {
      await repository.logCompletion({
        planId,
        patientId,
        activityCode: activity.code,
      })
      setJustLogged(true)
      onLogged()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card as="li" aria-labelledby={headingId}>
      <h3 id={headingId} className="font-heading text-lg font-bold text-on-surface">
        {t(techniqueNameKey(activity.code))}
      </h3>

      {activity.frequency !== undefined && (
        <p className="mt-1 text-base text-on-surface">
          {t('rehab:completion.frequency', { value: activity.frequency })}
        </p>
      )}
      {activity.duration !== undefined && (
        <p className="text-base text-on-surface">
          {t('rehab:completion.duration', { value: activity.duration })}
        </p>
      )}
      {activity.instructions !== undefined && (
        <div className="mt-2">
          <p className="text-base font-semibold text-on-surface">
            {t('rehab:completion.instructions')}
          </p>
          <p className="text-base text-on-surface">{activity.instructions}</p>
        </div>
      )}

      <p className="mt-2 text-base text-muted">
        {recentCount === 0
          ? t('rehab:completion.neverLogged')
          : t('rehab:completion.countThisWeek', { count: recentCount })}
      </p>

      {justLogged && (
        <div className="mt-3">
          <Banner tone="success">{t('rehab:completion.logged')}</Banner>
        </div>
      )}

      <div className="mt-3">
        <Button
          fullWidth
          loading={isSaving}
          iconStart={<CheckIcon className="size-5" />}
          onClick={() => {
            void log()
          }}
        >
          {t('rehab:completion.logAction')}
        </Button>
      </div>
    </Card>
  )
}
