import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppBar,
  Avatar,
  Button,
  Chip,
  EmptyState,
  FictionalDataBanner,
  InboxIcon,
  ListRow,
  WarningIcon,
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
  // "Nothing waiting" when the read failed would be a false all-clear on a
  // clinical queue -- the worst possible direction for this screen to be wrong.
  const [failed, setFailed] = useState(false)
  // Setting status to its current value would not re-run the effect: React
  // bails out on an identical value, so the retry button would do nothing.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (actor === null) return
    let cancelled = false

    setFailed(false)
    repo
      .queue(actor, { status })
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch(() => {
        if (cancelled) return
        setItems(null)
        setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [actor?.id, actor?.role, repo, status, attempt])

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

      {failed ? (
        <EmptyState
          title={t('queue.loadFailed')}
          body={t('queue.loadFailedBody')}
          icon={<WarningIcon />}
          action={
            <Button fullWidth onClick={() => setAttempt((n) => n + 1)}>
              {t('queue.retry')}
            </Button>
          }
        />
      ) : items === null ? (
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

  /*
   * Six stacked sentences became a row with chips.
   *
   * Every fact that was on its own full-width line is still here and still
   * says the same words — the change is that they sit side by side, so a
   * practitioner scanning twenty cases can compare "3 places flagged" against
   * the case above it instead of reading twenty short paragraphs.
   *
   * WHY THE CHIPS ARE NOT COLOUR-CODED BY FLAG COUNT, since that is the first
   * thing anyone will want to add: this screen already refuses to imply
   * triage. `queue.orderNote` exists to say out loud that the ordering is not
   * severity, and painting the flagged count amber or red would assert through
   * colour exactly what that sentence is there to deny. The app's machine
   * finding is a count of places it marked, not a judgement of how ill someone
   * is, and it has no severity model behind it. Clinical colour in this app
   * belongs to StatusPill and the verdict vocabulary, which a practitioner
   * reaches by opening the case.
   *
   * `unusable` is the exception and is warning-toned, because it is a
   * data-quality fact with an unambiguous action — those recordings need
   * taking again — and it makes no claim about the patient at all.
   *
   * The chip wording was shortened after a 360px capture showed every chip
   * taking a full line of its own, which is the stacked-sentences layout again
   * with rounded corners on it. "3 locations flagged by the app" became "App
   * flagged 3 places" — the attribution is the part that had to survive, since
   * a count with no actor reads as the app's clinical opinion rather than as a
   * record of what it marked, and it is now the first thing in the sentence
   * rather than a trailing qualifier.
   *
   * That alone did not make them pack, and the second capture said why: the
   * chips were living in the text column indented past the avatar, 218px wide,
   * while the pair needed 309. No wording fits that. ListRow now spans the chip
   * row across the whole card, and the remaining ~13px came out of the NEUTRAL
   * chip — "6 places recorded" lost a word it could spare so that the flagged
   * chip could keep every word of its attribution. When something has to give,
   * it is not the one naming who made the finding.
   */
  return (
    <ListRow
      leading={<Avatar name={item.patient.name} />}
      title={item.patient.name}
      subtitle={[
        age === null ? t('case.ageUnknown') : t('case.age', { count: age }),
        t(`codes:sex.${item.patient.sex}`),
        t('case.recordedOn', { date: new Date(item.assessment.date).toLocaleDateString() }),
      ].join(' · ')}
      trailing={
        <span className="text-sm font-semibold text-on-surface">
          {item.waitingDays === 0
            ? t('queue.waitingToday')
            : t('queue.waiting', { count: item.waitingDays })}
        </span>
      }
      detail={
        <>
          <Chip>{t('queue.locations', { count: item.recordingCount })}</Chip>
          {/* What the app reported, always named as the app's doing. */}
          <Chip>
            {item.flaggedCount > 0
              ? t('queue.flagged', { count: item.flaggedCount })
              : t('queue.nothingFlagged')}
          </Chip>
          {item.unusableCount > 0 && (
            <Chip tone="warning">{t('queue.unusable', { count: item.unusableCount })}</Chip>
          )}
        </>
      }
      {...(item.assessment.isDemo === 1 && { footer: <FictionalDataBanner compact /> })}
      onClick={onOpen}
    />
  )
}
