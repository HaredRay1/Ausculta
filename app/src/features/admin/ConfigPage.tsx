import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Banner, Button, Card, NotConnectedPanel, Spinner, TextField } from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { setConfiguredIdleTimeoutMs } from '../../auth/idleTimeout'
import { TUNABLES } from '../../audio/constants'
import { AdminShell } from './AdminShell'
import {
  ConfigError,
  DEFAULT_SEVERITY_BANDS,
  MAX_IDLE_TIMEOUT_MINUTES,
  MIN_IDLE_TIMEOUT_MINUTES,
  createConfigStore,
  type ClinicalConfig,
  type ConfigStore,
  type SeverityBand,
} from './config'
import { useAdminTranslation } from './i18n'

export interface ConfigPageProps {
  /** Injected in tests so the screen can run against an isolated database. */
  store?: ConfigStore
}

/**
 * The thresholds worth showing a person, read-only.
 *
 * Only the clinically meaningful ones — the numbers that decide a verdict and
 * reject a recording. The windowing and DSP constants are implementation and
 * would be noise on this screen.
 */
const SHOWN_THRESHOLDS: ReadonlyArray<readonly [string, number | string]> = [
  ['CONFIDENCE_MEAN_MIN', TUNABLES.CONFIDENCE_MEAN_MIN],
  ['HEALTHY_MEAN_MIN', TUNABLES.HEALTHY_MEAN_MIN],
  ['AGREEMENT_MIN', TUNABLES.AGREEMENT_MIN],
  ['MIN_VALID_WINDOWS', TUNABLES.MIN_VALID_WINDOWS],
  ['MIN_DURATION_S', TUNABLES.MIN_DURATION_S],
  ['MAX_DURATION_S', TUNABLES.MAX_DURATION_S],
]

/**
 * Settings an administrator may change.
 *
 * What is editable here is chosen by one test: would typing a number actually
 * change what the app does? The idle timeout passes — it is read on every
 * expiry check. The severity bands pass as storage, and are labelled as
 * consumed by nothing yet, because no severity model exists.
 *
 * The analysis thresholds fail that test and are therefore not editable. They
 * are compile-time constants inside the classifier worker, so a field here
 * would accept a value, save it, show a success message and change nothing at
 * all — on the numbers that decide whether a recording is called a possible
 * finding. That is a worse failure than not having the feature, because it
 * invites an administrator to believe they have calibrated the system.
 */
export function ConfigPage({ store }: ConfigPageProps = {}) {
  const { t } = useAdminTranslation()
  const { user } = useAuth()
  const configStore = useMemo(() => store ?? createConfigStore(), [store])

  const [config, setConfig] = useState<ClinicalConfig | null>(null)
  const [idleMinutes, setIdleMinutes] = useState('')
  const [bands, setBands] = useState<SeverityBand[]>([])
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [savedVersion, setSavedVersion] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  function applyToForm(loaded: ClinicalConfig) {
    setConfig(loaded)
    setIdleMinutes(String(loaded.idleTimeoutMinutes))
    setBands(loaded.severityBands.map((band) => ({ ...band })))
  }

  useEffect(() => {
    let cancelled = false
    void configStore
      .read()
      .then((loaded) => {
        if (!cancelled) applyToForm(loaded)
      })
      .catch(() => {
        if (!cancelled) setErrorKey('admin:error.UNEXPECTED')
      })
    return () => {
      cancelled = true
    }
  }, [configStore])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy || user === null) return

    setErrorKey(null)
    setSavedVersion(null)
    setBusy(true)
    try {
      const next = await configStore.update(user.id, {
        idleTimeoutMinutes: Number(idleMinutes),
        severityBands: bands,
      })
      applyToForm(next)
      setSavedVersion(next.version)
      // Takes effect on the next expiry check rather than the next launch.
      setConfiguredIdleTimeoutMs(next.idleTimeoutMinutes * 60_000)
    } catch (error) {
      setErrorKey(
        error instanceof ConfigError ? `admin:error.${error.code}` : 'admin:error.UNEXPECTED',
      )
    } finally {
      setBusy(false)
    }
  }

  if (config === null) {
    return (
      <AdminShell activeId="config" title={t('admin:config.title')}>
        <div className="flex items-center gap-3 py-6" aria-busy="true">
          <Spinner />
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell
      activeId="config"
      title={t('admin:config.title')}
      subtitle={t('admin:config.subtitle')}
    >
      <Card>
        <h3 className="font-heading text-base font-bold text-on-surface">
          {t('admin:config.versionHeading')}
        </h3>
        <p className="mt-1 text-lg font-bold text-on-surface">
          {t('admin:config.versionValue', { version: config.version })}
        </p>
        <p className="mt-1 text-sm text-muted">{t('admin:config.versionExplain')}</p>
        <p className="mt-1 text-sm text-muted">
          {config.updatedBy === 'DEFAULT'
            ? t('admin:config.neverChanged')
            : t('admin:config.lastChanged', {
                date: new Date(config.updatedAt).toLocaleString(),
                who: config.updatedBy,
              })}
        </p>
      </Card>

      {errorKey !== null && <Banner tone="danger">{t(errorKey)}</Banner>}
      {savedVersion !== null && (
        <Banner tone="success">
          {t('admin:config.saved', { version: savedVersion })}
        </Banner>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <section className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-bold text-on-surface">
            {t('admin:config.sessionHeading')}
          </h3>
          <TextField
            label={t('admin:config.idleLabel')}
            hint={t('admin:config.idleHint', {
              min: MIN_IDLE_TIMEOUT_MINUTES,
              max: MAX_IDLE_TIMEOUT_MINUTES,
            })}
            value={idleMinutes}
            onChange={setIdleMinutes}
            inputMode="numeric"
            disabled={busy}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-heading text-base font-bold text-on-surface">
            {t('admin:config.severityHeading')}
          </h3>
          <p className="text-sm text-muted">{t('admin:config.severityIntro')}</p>

          {/*
            Editable and versioned, but honest about being inert: nothing reads
            these yet, so a screen implying they are shaping results would be
            the same lie as an editable threshold.
          */}
          <NotConnectedPanel
            title={t('admin:config.severityHeading')}
            body={t('admin:config.severityIntro')}
          />

          {bands.map((band, index) => (
            <TextField
              key={band.code}
              label={t('admin:config.bandLabel', { name: t(`codes:severityCategory.${band.code}`) })}
              hint={t('admin:config.bandUnit')}
              value={String(band.minScore)}
              inputMode="numeric"
              disabled={busy}
              onChange={(value) =>
                setBands((current) =>
                  current.map((entry, i) =>
                    i === index ? { ...entry, minScore: Number(value) } : entry,
                  ),
                )
              }
            />
          ))}
        </section>

        <Button type="submit" size="lg" fullWidth loading={busy}>
          {busy ? t('admin:config.saving') : t('admin:config.save')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => applyToForm(config)}
        >
          {t('admin:config.reset')}
        </Button>
      </form>

      <section className="flex flex-col gap-3">
        <h3 className="font-heading text-base font-bold text-on-surface">
          {t('admin:config.thresholdsHeading')}
        </h3>
        <Banner tone="info" title={t('admin:config.thresholdsReadOnlyTitle')}>
          {t('admin:config.thresholdsReadOnlyBody')}
        </Banner>
        <Card>
          <p className="text-sm font-semibold text-on-surface">
            {t('admin:config.thresholdsVersion', { version: TUNABLES.tunablesVersion })}
          </p>
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            {SHOWN_THRESHOLDS.map(([name, value]) => (
              <div key={name} className="flex justify-between gap-3">
                <dt className="text-muted">{name}</dt>
                <dd className="font-semibold tabular-nums text-on-surface">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>
    </AdminShell>
  )
}

/** Re-exported so a caller can show the same default set the store validates. */
export { DEFAULT_SEVERITY_BANDS }
