import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AppBar,
  Banner,
  Button,
  Card,
  EmptyState,
  FictionalDataBanner,
  InboxIcon,
  Page,
  Section,
  Skeleton,
  SkeletonGroup,
  Textarea,
} from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { ALERT_STATUSES } from '../../db/codes'
import { useMonitoringTranslation } from './i18n'
import {
  MonitoringError,
  createMonitoringRepository,
  type Actor,
  type AlertWithPatient,
  type MonitoringRepository,
} from './repository'

export interface AlertsPageProps {
  repository?: MonitoringRepository
}

export function AlertsPage({ repository }: AlertsPageProps = {}) {
  const { t } = useMonitoringTranslation()
  const { user } = useAuth()

  const repo = useMemo(() => repository ?? createMonitoringRepository(), [repository])
  const actor: Actor | null = user === null ? null : { id: user.id, role: user.role }

  const [rows, setRows] = useState<AlertWithPatient[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (actor === null) return
    setRows(await repo.openAlerts(actor))
  }, [actor?.id, actor?.role, repo])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Page>
      <AppBar title={t('alerts.title')} subtitle={t('alerts.subtitle')} />

      {/* Said once at the top, so every alert below is read in this frame. */}
      <Banner tone="info">{t('alerts.observationNote')}</Banner>

      {error !== null && <Banner tone="danger">{error}</Banner>}

      {rows !== null && rows.length > 0 && (
        <p className="text-sm text-muted">{t('alerts.count', { count: rows.length })}</p>
      )}

      {rows === null ? (
        <SkeletonGroup label={t('alerts.loading')}>
          <Skeleton className="h-24 w-full" lines={3} />
        </SkeletonGroup>
      ) : rows.length === 0 ? (
        <EmptyState title={t('alerts.empty')} body={t('alerts.emptyHint')} icon={<InboxIcon />} />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row) => (
            <li key={row.alert.id}>
              <AlertCard
                row={row}
                onAcknowledge={async () => {
                  if (actor === null) return
                  try {
                    await repo.acknowledgeAlert(row.alert.id, actor)
                    await load()
                  } catch (caught) {
                    setError(
                      caught instanceof MonitoringError
                        ? t(`error.${caught.code}`)
                        : t('error.SAVE_FAILED'),
                    )
                  }
                }}
                onClose={async (note) => {
                  if (actor === null) return
                  try {
                    await repo.closeAlert(row.alert.id, note, actor)
                    await load()
                  } catch (caught) {
                    setError(
                      caught instanceof MonitoringError
                        ? t(`error.${caught.code}`)
                        : t('error.SAVE_FAILED'),
                    )
                    throw caught
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

function AlertCard({
  row,
  onAcknowledge,
  onClose,
}: {
  row: AlertWithPatient
  onAcknowledge: () => Promise<void>
  onClose: (note: string) => Promise<void>
}) {
  const { t } = useMonitoringTranslation()
  const [closing, setClosing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const { alert, patient, payload } = row
  const params = {
    ...payload.params,
    ...(payload.locationCode !== undefined && {
      location: t(`codes:location.${payload.locationCode}`),
    }),
  }

  return (
    <Card as="article" aria-label={t(`alertType.${alert.typeCode}`)}>
      <h3 className="text-lg font-semibold text-on-surface">
        {t(`alertType.${alert.typeCode}`)}
      </h3>
      <p className="mt-1 text-base text-on-surface">{patient.name}</p>

      {/* The observation, in the reader's language, built from stored evidence
          rather than from a sentence saved in the row. */}
      <p className="mt-3 text-base text-on-surface">
        {t(`alertType.${alert.typeCode}_body`, params)}
      </p>

      <p className="mt-3 text-sm text-muted">
        {t('alerts.raisedOn', { date: new Date(alert.createdAt).toLocaleDateString() })}
      </p>

      {alert.status === ALERT_STATUSES.ACKNOWLEDGED && (
        <p className="mt-1 text-sm text-muted">{t('alerts.acknowledged')}</p>
      )}

      {patient.isDemo === 1 && (
        <div className="mt-3">
          <FictionalDataBanner compact />
        </div>
      )}

      {closing ? (
        <div className="mt-4 flex flex-col gap-3">
          <Textarea
            label={t('alerts.closeNoteLabel')}
            hint={t('alerts.closeNoteHint')}
            value={note}
            onChange={setNote}
            rows={3}
          />
          <Button
            fullWidth
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onClose(note)
              } catch {
                // The page banner reports it; keep the form open so the note
                // the practitioner typed is not thrown away.
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('alerts.closeConfirm')}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setClosing(false)}>
            {t('alerts.cancel')}
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {alert.status !== ALERT_STATUSES.ACKNOWLEDGED && (
            <Button variant="secondary" fullWidth onClick={onAcknowledge}>
              {t('alerts.acknowledge')}
            </Button>
          )}
          <Button fullWidth onClick={() => setClosing(true)}>
            {t('alerts.close')}
          </Button>
        </div>
      )}
    </Card>
  )
}

/** Exported for the plan screen, which shows the same explanatory framing. */
export function ObservationNote() {
  const { t } = useMonitoringTranslation()
  return (
    <Section title={t('alerts.whatThisMeans')}>
      <Card>
        <p className="text-base text-muted">{t('alerts.observationNote')}</p>
      </Card>
    </Section>
  )
}
