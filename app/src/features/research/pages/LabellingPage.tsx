import { useCallback, useEffect, useState } from 'react'
import {
  AppBar,
  AudioPlayer,
  Banner,
  Button,
  Card,
  EmptyState,
  FictionalDataBanner,
  InboxIcon,
  Page,
  RadioGroup,
  Section,
  Select,
  CheckCircleIcon,
  Spinner,
} from '../../../components'
import { useTranslation } from 'react-i18next'
import { CLASSIFICATION_CODES, type ClassificationCode } from '../../../db/codes'
import { db as defaultDb, type AuscultaDB } from '../../../db/db'
import { useAuth } from '../../../auth/AuthContext'
import { useDemoMode } from '../../demo/useDemoMode'
import { readLabellingQueue, saveResearchLabel, type LabellingRow } from '../data'
import {
  GROUND_TRUTH_STATUSES,
  GROUND_TRUTH_STATUS_LIST,
  STATUSES_REQUIRING_LABEL,
  type GroundTruthStatus,
} from '../groundTruth'
import { useResearchTranslation } from '../i18n'

/**
 * Ground-truth labelling.
 *
 * A researcher listens and records what the recording actually is, forming
 * that judgement independently of the model. The model's own prediction is
 * shown — hiding it would be dishonest about what the researcher can see —
 * but the label is stored as a separate row and never writes back to the
 * recording. That separation is the whole basis of the performance screen: if
 * labelling overwrote the prediction there would be nothing left to score.
 */
export function LabellingPage({ database = defaultDb }: { database?: AuscultaDB } = {}) {
  const { t } = useResearchTranslation()
  const { t: tc } = useTranslation('codes', { useSuspense: false })
  const { user } = useAuth()
  const { enabled: demoEnabled, ready: demoReady } = useDemoMode(database)

  const [queue, setQueue] = useState<LabellingRow[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const rows = await readLabellingQueue(database, demoEnabled, 100)
    setQueue(rows)
    setSelectedId((current) => current ?? rows[0]?.recording.id ?? null)
  }, [database, demoEnabled])

  useEffect(() => {
    if (!demoReady) return
    void refresh()
  }, [demoReady, refresh])

  const selected = queue?.find((row) => row.recording.id === selectedId) ?? null

  return (
    <>
      <AppBar title={t('labels.title')} />
      <Page>
        {demoEnabled && <FictionalDataBanner />}
        <p className="text-base text-muted">{t('labels.intro')}</p>

        {queue === null ? (
          <Spinner label={t('labels.title')} />
        ) : queue.length === 0 ? (
          <EmptyState
            title={t('labels.emptyTitle')}
            body={t('labels.emptyBody')}
            icon={<InboxIcon className="size-10" />}
          />
        ) : (
          <>
            {selected !== null && (
              <LabelEditor
                key={selected.recording.id}
                row={selected}
                database={database}
                labeledBy={user?.id ?? ''}
                onSaved={refresh}
              />
            )}

            <Section title={t('labels.queueHeading')}>
              <ul className="flex flex-col gap-2">
                {queue.map((row) => (
                  <li key={row.recording.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.recording.id)}
                      aria-current={row.recording.id === selectedId ? 'true' : undefined}
                      className={[
                        'flex w-full min-h-(--size-touch-min) items-center justify-between gap-3 rounded-control border px-4 py-3 text-left',
                        row.recording.id === selectedId
                          ? 'border-primary bg-accent text-on-accent'
                          : 'border-border bg-surface-raised text-on-surface',
                      ].join(' ')}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-base">
                          {tc(`location.${row.recording.locationCode}`)}
                        </span>
                        <span className="block text-sm text-muted">
                          {row.recording.aiClassification !== undefined
                            ? tc(`classification.${row.recording.aiClassification}`)
                            : tc(`aiStatus.${row.recording.aiStatus}`)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold">
                        {row.label === null ? t('labels.unlabelled') : t('labels.labelled')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </Page>
    </>
  )
}

function LabelEditor({
  row,
  database,
  labeledBy,
  onSaved,
}: {
  row: LabellingRow
  database: AuscultaDB
  labeledBy: string
  onSaved: () => Promise<void>
}) {
  const { t } = useResearchTranslation()
  const { t: tc } = useTranslation('codes', { useSuspense: false })

  const [status, setStatus] = useState<GroundTruthStatus>(
    (row.label?.groundTruthStatus as GroundTruthStatus | undefined) ??
      GROUND_TRUTH_STATUSES.CORRECT,
  )
  const [labelCode, setLabelCode] = useState<string>(
    row.label?.labelCode ?? row.recording.aiClassification ?? '',
  )
  const [blob, setBlob] = useState<Blob | null>(null)
  const [audioFailed, setAudioFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void database.audioBlobs.get(row.recording.audioBlobId).then((found) => {
      // A blob that survived storage as something other than a Blob is not
      // playable and must not reach the player; the screen simply says so.
      if (!cancelled) setBlob(found?.blob instanceof Blob ? found.blob : null)
    })
    return () => {
      cancelled = true
    }
  }, [database, row.recording.audioBlobId])

  const needsClass = (STATUSES_REQUIRING_LABEL as readonly string[]).includes(status)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await saveResearchLabel(
        {
          recordingId: row.recording.id,
          groundTruthStatus: status,
          ...(needsClass && labelCode !== ''
            ? { labelCode: labelCode as ClassificationCode }
            : {}),
          labeledBy,
        },
        database,
      )
      setSaved(true)
      await onSaved()
    } catch {
      setError(t('labels.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card as="section" aria-label={t('labels.title')}>
      <p className="font-heading text-lg font-bold text-on-surface">
        {tc(`location.${row.recording.locationCode}`)}
      </p>

      <div className="mt-3">
        {blob !== null && !audioFailed ? (
          <AudioPlayer
            blob={blob}
            label={tc(`location.${row.recording.locationCode}`)}
            durationSec={row.recording.durationSec}
            onError={() => setAudioFailed(true)}
          />
        ) : (
          <Banner tone="warning" title={t('labels.title')}>
            {t('labels.emptyBody')}
          </Banner>
        )}
      </div>

      <p className="mt-4 text-sm text-muted">
        {row.recording.aiClassification !== undefined
          ? `${t('labels.modelSaid')}: ${tc(`classification.${row.recording.aiClassification}`)}`
          : t('labels.modelSaidNothing')}
      </p>

      <div className="mt-4">
        <RadioGroup
          label={t('labels.statusLegend')}
          value={status}
          onChange={(next) => {
            setStatus(next as GroundTruthStatus)
            setSaved(false)
          }}
          options={GROUND_TRUTH_STATUS_LIST.map((code) => ({
            value: code,
            label: t(`groundTruth.${code}`),
            description: t(`groundTruth.${code}_HINT`),
          }))}
        />
      </div>

      {needsClass && (
        <div className="mt-4">
          <Select
            label={t('labels.classLegend')}
            hint={t('labels.classHint')}
            value={labelCode}
            onChange={(next) => {
              setLabelCode(next)
              setSaved(false)
            }}
            options={Object.values(CLASSIFICATION_CODES).map((code) => ({
              value: code,
              label: tc(`classification.${code}`),
            }))}
          />
        </div>
      )}

      {error !== null && (
        <div className="mt-4">
          <Banner tone="danger" title={t('labels.error')}>
            {error}
          </Banner>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void save()} loading={busy} disabled={needsClass && labelCode === ''}>
          {busy ? t('labels.saving') : t('labels.save')}
        </Button>
        {saved && !busy && (
          <span role="status" className="flex items-center gap-1.5 text-sm text-on-success-surface">
            <CheckCircleIcon className="size-5" />
            {t('labels.saved')}
          </span>
        )}
      </div>

      {row.label !== null && (
        <p className="mt-3 text-sm text-muted">
          {t('labels.labelledBy', {
            who: row.label.labeledBy,
            when: new Date(row.label.labeledAt).toLocaleString(),
          })}
        </p>
      )}
    </Card>
  )
}

export default LabellingPage
