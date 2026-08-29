import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AppBar,
  Banner,
  Button,
  Card,
  Checkbox,
  EmptyState,
  InboxIcon,
  Page,
  Section,
  Skeleton,
  SkeletonGroup,
  TextField,
  Textarea,
} from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { LOCATION_CODES, ROLES, type LocationCode } from '../../db/codes'
import type { MonitoringPlan } from '../../db/types'
import { useMonitoringTranslation } from './i18n'
import {
  MonitoringError,
  PLAN_STATUSES,
  ROLES_THAT_CAN_PLAN,
  createMonitoringRepository,
  readPlanDetails,
  type Actor,
  type MonitoringRepository,
} from './repository'

const ALL_LOCATIONS = Object.values(LOCATION_CODES)

export interface MonitoringPlanPageProps {
  repository?: MonitoringRepository
}

export function MonitoringPlanPage({ repository }: MonitoringPlanPageProps = {}) {
  const { t } = useMonitoringTranslation()
  const { patientId = '' } = useParams()
  const { user } = useAuth()

  const repo = useMemo(() => repository ?? createMonitoringRepository(), [repository])
  const actor: Actor | null = user === null ? null : { id: user.id, role: user.role }
  const canEdit = actor !== null && ROLES_THAT_CAN_PLAN.includes(actor.role)

  const [plans, setPlans] = useState<MonitoringPlan[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [intervalDays, setIntervalDays] = useState('7')
  const [locations, setLocations] = useState<LocationCode[]>([
    LOCATION_CODES.R_UPPER,
    LOCATION_CODES.L_UPPER,
  ])
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')

  const load = useCallback(async () => {
    if (actor === null) return
    setPlans(await repo.plansFor(patientId, actor))
  }, [patientId, actor?.id, actor?.role, repo])

  useEffect(() => {
    void load()
  }, [load])

  const active = plans?.find((p) => p.status === PLAN_STATUSES.ACTIVE)
  const draft = plans?.find((p) => p.status === PLAN_STATUSES.DRAFT)

  async function saveDraft() {
    if (actor === null) return
    setBusy(true)
    setError(null)
    try {
      await repo.draftPlan(
        {
          patientId,
          intervalDays: Number(intervalDays),
          locationCodes: locations,
          startDate,
          ...(endDate !== '' && { endDate }),
          ...(followUpNote !== '' && { followUpNote }),
        },
        actor,
      )
      await load()
    } catch (caught) {
      setError(
        caught instanceof MonitoringError ? t(`error.${caught.code}`) : t('error.SAVE_FAILED'),
      )
    } finally {
      setBusy(false)
    }
  }

  async function approve(planId: string) {
    if (actor === null) return
    setBusy(true)
    setError(null)
    try {
      await repo.approvePlan(planId, actor)
      await load()
    } catch (caught) {
      setError(
        caught instanceof MonitoringError ? t(`error.${caught.code}`) : t('error.SAVE_FAILED'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (plans === null) {
    return (
      <Page>
        <AppBar title={t('plan.title')} />
        <SkeletonGroup label={t('plan.loading')}>
          <Skeleton className="h-24 w-full" lines={3} />
        </SkeletonGroup>
      </Page>
    )
  }

  return (
    <Page>
      <AppBar title={t('plan.title')} />

      {error !== null && <Banner tone="danger">{error}</Banner>}

      <Section title={actor?.role === ROLES.PATIENT ? t('plan.forPatient') : t('plan.current')}>
        {active === undefined ? (
          <EmptyState title={t('plan.none')} body={t('plan.noneHint')} icon={<InboxIcon />} />
        ) : (
          <PlanCard plan={active} />
        )}
      </Section>

      {draft !== undefined && (
        <Section title={t('plan.statusDRAFT')}>
          {/* The approval gate, said in words: a draft obliges nobody. */}
          <Banner tone="warning" title={t('plan.draftPending')}>
            {t('plan.draftPendingHint')}
          </Banner>
          <div className="mt-3">
            <PlanCard plan={draft} />
          </div>
          {canEdit && (
            <div className="mt-3">
              <Button fullWidth loading={busy} onClick={() => approve(draft.id)}>
                {t('plan.approve')}
              </Button>
            </div>
          )}
        </Section>
      )}

      {canEdit && (
        <Section title={t('plan.title')}>
          <div className="flex flex-col gap-4">
            <TextField
              label={t('plan.intervalLabel')}
              hint={t('plan.intervalHint')}
              type="number"
              inputMode="numeric"
              value={intervalDays}
              onChange={setIntervalDays}
            />

            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-base font-semibold text-on-surface">
                {t('plan.locationsLabel')}
              </legend>
              <p className="mb-2 text-sm text-muted">{t('plan.locationsHint')}</p>
              {ALL_LOCATIONS.map((code) => (
                <Checkbox
                  key={code}
                  label={t(`codes:location.${code}`)}
                  checked={locations.includes(code)}
                  onChange={(checked) =>
                    setLocations((current) =>
                      checked ? [...current, code] : current.filter((c) => c !== code),
                    )
                  }
                />
              ))}
            </fieldset>

            <TextField
              label={t('plan.startLabel')}
              type="date"
              value={startDate}
              onChange={setStartDate}
            />
            <TextField
              label={t('plan.endLabel')}
              hint={t('plan.endHint')}
              type="date"
              value={endDate}
              onChange={setEndDate}
            />
            <Textarea
              label={t('plan.followUpLabel')}
              hint={t('plan.followUpHint')}
              value={followUpNote}
              onChange={setFollowUpNote}
              rows={3}
            />

            <Button size="lg" fullWidth loading={busy} onClick={saveDraft}>
              {t('plan.save')}
            </Button>
          </div>
        </Section>
      )}

      {plans.length > 0 && (
        <Section title={t('plan.history')}>
          <ul className="flex flex-col gap-3">
            {plans.map((plan) => (
              <li key={plan.id}>
                <PlanCard plan={plan} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  )
}

function PlanCard({ plan }: { plan: MonitoringPlan }) {
  const { t } = useMonitoringTranslation()
  const details = readPlanDetails(plan)

  if (details === null) {
    // A plan written by an older build reads as unusable rather than crashing.
    // NOT "no monitoring plan": this plan exists and a practitioner created it,
    // so saying there is none would misreport the record. It says what is
    // actually true and what to do about it.
    return (
      <Card>
        <p className="text-base font-semibold text-on-surface">{t('plan.unreadable')}</p>
        <p className="mt-1 text-sm text-muted">{t('plan.unreadableHint')}</p>
      </Card>
    )
  }

  return (
    <Card>
      <p className="text-lg font-semibold text-on-surface">
        {t('plan.everyDays', { count: details.intervalDays })}
      </p>
      <p className="mt-1 text-sm text-muted">
        {t(`plan.status${plan.status}`, { defaultValue: plan.status })}
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {details.locationCodes.map((code) => (
          <li
            key={code}
            className="rounded-pill bg-surface-sunken px-3 py-1 text-sm text-on-surface"
          >
            {t(`codes:location.${code}`)}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm text-muted">
        {t('plan.startedOn', { date: details.startDate })}
        {' - '}
        {details.endDate === undefined
          ? t('plan.openEnded')
          : t('plan.untilOn', { date: details.endDate })}
      </p>

      {details.followUpNote !== undefined && (
        <p className="mt-3 text-base text-on-surface">{details.followUpNote}</p>
      )}
    </Card>
  )
}
