import { useState } from 'react'
import {
  AppBar,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FictionalDataBanner,
  FlaskIcon,
  Page,
  RefreshIcon,
  Section,
  Switch,
} from '../../../components'
import { db } from '../../../db/db'
import { syncDemoAssignments } from '../assignments'
import { walkthroughPatientSpec } from '../dataset'
import { useDemoTranslation } from '../i18n'
import { resetDemoData, seedDemoData } from '../seed'
import { useDemoMode, useDemoSeedStatus } from '../useDemoMode'

/**
 * Demo mode: load the fictional clinic, show it, remove it.
 *
 * The screen is deliberately blunt. Someone arriving here is deciding whether
 * a device shows invented patients, and every control says what it does to the
 * data rather than naming a mode.
 */
export function DemoSettingsPage({ onBack }: { onBack?: () => void }) {
  const { t } = useDemoTranslation()
  const { enabled, ready, setEnabled } = useDemoMode(db)
  const { marker, ready: statusReady } = useDemoSeedStatus(db)

  const [busy, setBusy] = useState<'seed' | 'reset' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const seeded = marker !== null
  const walkthrough = walkthroughPatientSpec()

  async function handleSeed() {
    setBusy('seed')
    setError(null)
    try {
      await seedDemoData(db, { force: true })
      // Without this the rows exist but every non-admin patient list is empty.
      await syncDemoAssignments(db)
      await setEnabled(true)
    } catch {
      setError(t('errors.load'))
    } finally {
      setBusy(null)
    }
  }

  async function handleReset() {
    setBusy('reset')
    setError(null)
    try {
      await resetDemoData(db)
      setConfirmingReset(false)
    } catch {
      setError(t('errors.remove'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <AppBar title={t('title')} {...(onBack !== undefined && { onBack })} />
      <Page>
        <FictionalDataBanner />

        <p className="text-base text-muted">{t('intro')}</p>

        {error !== null && (
          <Banner tone="danger" title={t('errors.title')}>
            {error}
          </Banner>
        )}

        <Section title={t('status.heading')}>
          {!statusReady ? null : seeded ? (
            <Card>
              <p className="text-base text-on-surface">
                {t('status.loaded', {
                  patients: marker.counts.patients,
                  assessments: marker.counts.assessments,
                  recordings: marker.counts.recordings,
                })}
              </p>
              {marker.seededAt !== '' && (
                <p className="mt-1 text-sm text-muted">
                  {t('status.loadedAt', {
                    date: new Date(marker.seededAt).toLocaleDateString(),
                  })}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={handleSeed}
                  loading={busy === 'seed'}
                  iconStart={<RefreshIcon className="size-5" />}
                >
                  {t('actions.reload')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmingReset(true)}
                  disabled={busy !== null}
                >
                  {t('actions.remove')}
                </Button>
              </div>
            </Card>
          ) : (
            <EmptyState
              title={t('status.empty')}
              body={t('intro')}
              icon={<FlaskIcon className="size-10" />}
              action={
                <Button onClick={handleSeed} loading={busy === 'seed'} fullWidth>
                  {busy === 'seed' ? t('actions.loading') : t('actions.load')}
                </Button>
              }
            />
          )}
        </Section>

        {seeded && (
          <Section>
            <Switch
              label={t('toggle.label')}
              checked={enabled}
              onChange={(next) => void setEnabled(next)}
              hint={enabled ? t('toggle.hintOn') : t('toggle.hintOff')}
              disabled={!ready || busy !== null}
            />
          </Section>
        )}

        {seeded && (
          <Section title={t('walkthrough.heading')}>
            <Card>
              <p className="text-base text-on-surface">
                {t('walkthrough.body', {
                  name: walkthrough.name,
                  count: walkthrough.visits.length,
                })}
              </p>
            </Card>
          </Section>
        )}

        <Section title={t('audio.heading')}>
          <Banner tone="warning" title={t('audio.heading')}>
            {t('audio.body')}
          </Banner>
        </Section>
      </Page>

      <ConfirmDialog
        open={confirmingReset}
        title={t('actions.remove')}
        confirmLabel={t('actions.remove')}
        destructive
        busy={busy === 'reset'}
        onConfirm={() => void handleReset()}
        onCancel={() => setConfirmingReset(false)}
      >
        {t('actions.confirmRemove')}
      </ConfirmDialog>
    </>
  )
}

export default DemoSettingsPage
