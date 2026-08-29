import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  FictionalDataBanner,
  InboxIcon,
  Page,
  Select,
  Skeleton,
  SkeletonGroup,
} from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { REVIEW_STATUSES, type ReviewStatus } from '../../db/codes'
import { ageInYears } from '../patients/validation'
import { useReviewTranslation } from './i18n'
import {
  createReviewRepository,
  type Actor,
  type QueueItem,
  type ReviewRepository,
} from './repository'

export interface ReviewQueuePageProps {
  repository?: ReviewRepository
}

export function ReviewQueuePage({ repository }: ReviewQueuePageProps = {}) {
  const { t } = useReviewTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const repo = useMemo(() => repository ?? createReviewRepository(), [repository])
  const actor: Actor | null = user === null ? null : { id: user.id, role: user.role }

  const [status, setStatus] = useState<ReviewStatus>(REVIEW_STATUSES.PENDING_REVIEW)
  const [items, setItems] = useState<QueueItem[] | null>(null)

  useEffect(() => {
    if (actor === null) return
    let cancelled = false

    void repo.queue(actor, { status }).then((rows) => {
      if (!cancelled) setItems(rows)
    })

    return () => {
      cancelled = true
    }
  }, [actor?.id, actor?.role, repo, status])

  const statusOptions = Object.values(REVIEW_STATUSES).map((code) => ({
    value: code,
    label: t(`codes:reviewStatus.${code}`),
  }))

  return (
    <Page>
      {/* The alerts queue had no entry point anywhere in the app. The review
          queue is the practitioner's home, so it is where the other thing
          waiting for them belongs. */}
      <AppBar
        title={t('queue.title')}
        subtitle={t('queue.subtitle')}
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate('/monitoring/alerts')}>
            {t('queue.openAlerts')}
          </Button>
        }
      />

      <Select
        label={t('queue.filterLabel')}
        value={status}
        onChange={(value) => {
          setItems(null)
          setStatus(value as ReviewStatus)
        }}
        options={statusOptions}
      />

      {items !== null && items.length > 0 && (
        <>
          <p className="text-sm text-muted">{t('queue.count', { count: items.length })}</p>
          {/* Says out loud what the ordering means, so nobody reads the top of
              the list as "sickest patient". */}
          <p className="text-sm text-muted">{t('queue.orderNote')}</p>
        </>
      )}

      {items === null ? (
        <SkeletonGroup label={t('queue.loading')}>
          <Skeleton className="h-24 w-full" lines={3} />
        </SkeletonGroup>
      ) : items.length === 0 ? (
        <EmptyState title={t('queue.empty')} body={t('queue.emptyHint')} icon={<InboxIcon />} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.assessment.id}>
              <QueueRow
                item={item}
                onOpen={() => navigate(`/review/${item.assessment.id}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

function QueueRow({ item, onOpen }: { item: QueueItem; onOpen: () => void }) {
  const { t } = useReviewTranslation()
  const age = ageInYears(item.patient.birthDate)

  return (
    <Card as="div" padding="none">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-16 w-full flex-col items-start gap-1 px-4 py-3 text-left active:bg-surface-sunken"
      >
        <span className="text-lg font-semibold text-on-surface">{item.patient.name}</span>
        <span className="text-sm text-muted">
          {age === null ? t('case.ageUnknown') : t('case.age', { count: age })}
          {' - '}
          {t(`codes:sex.${item.patient.sex}`)}
          {' - '}
          {t('case.recordedOn', { date: new Date(item.assessment.date).toLocaleDateString() })}
        </span>

        <span className="text-base text-on-surface">
          {t('queue.locations', { count: item.recordingCount })}
        </span>

        {/* What the app reported, always named as the app's doing. */}
        <span className="text-base text-on-surface">
          {item.flaggedCount > 0
            ? t('queue.flagged', { count: item.flaggedCount })
            : t('queue.nothingFlagged')}
        </span>

        {item.unusableCount > 0 && (
          <span className="text-base text-on-surface">
            {t('queue.unusable', { count: item.unusableCount })}
          </span>
        )}

        <span className="text-sm text-muted">
          {item.waitingDays === 0
            ? t('queue.waitingToday')
            : t('queue.waiting', { count: item.waitingDays })}
        </span>
      </button>

      {item.assessment.isDemo === 1 && (
        <div className="px-4 pb-3">
          <FictionalDataBanner compact />
        </div>
      )}
    </Card>
  )
}
