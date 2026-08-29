import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  AppBar,
  Banner,
  Button,
  Card,
  EmptyState,
  FictionalDataBanner,
  InboxIcon,
  Page,
  RadioGroup,
  Section,
  Spinner,
} from '../../../components'
import { db as defaultDb, type AuscultaDB } from '../../../db/db'
import { useDemoMode } from '../../demo/useDemoMode'
import {
  EXPORT_COLUMNS,
  buildExportRows,
  exportFileName,
  toCsv,
  toJson,
  type ExportRow,
} from '../deidentify'
import { useResearchTranslation } from '../i18n'

type Format = 'csv' | 'json'

/**
 * De-identified export.
 *
 * The screen states plainly what leaves the device before offering the button,
 * and lists every column, because "de-identified" is a claim a researcher is
 * entitled to check rather than take on trust. When demonstration mode is on
 * it says so in a warning the reader cannot miss — a fictional patient inside
 * a research dataset is a contamination that is very hard to notice later.
 */
export function ExportPage({ database = defaultDb }: { database?: AuscultaDB } = {}) {
  const navigate = useNavigate()
  const { t } = useResearchTranslation()
  const { enabled: demoEnabled, ready: demoReady } = useDemoMode(database)

  const [rows, setRows] = useState<ExportRow[] | null>(null)
  const [format, setFormat] = useState<Format>('csv')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!demoReady) return
    let cancelled = false
    void buildExportRows(database, demoEnabled).then((next) => {
      if (!cancelled) setRows(next)
    })
    return () => {
      cancelled = true
    }
  }, [database, demoEnabled, demoReady])

  function download() {
    if (rows === null) return
    setBusy(true)
    setError(null)
    let url: string | null = null
    try {
      const text = format === 'csv' ? toCsv(rows) : toJson(rows)
      const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json'
      url = URL.createObjectURL(new Blob([text], { type }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = exportFileName(format)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch {
      setError(t('export.error'))
    } finally {
      // Revoked on the next tick so the click has taken the URL; leaving it
      // alive would pin the whole serialised export in memory.
      if (url !== null) {
        const toRevoke = url
        setTimeout(() => URL.revokeObjectURL(toRevoke), 0)
      }
      setBusy(false)
    }
  }

  return (
    <>
      <AppBar onBack={() => navigate(-1)} title={t('export.title')} />
      <Page>
        {demoEnabled && <FictionalDataBanner />}
        <p className="text-base text-muted">{t('export.intro')}</p>

        {rows === null ? (
          <Spinner label={t('export.loading')} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('export.emptyTitle')}
            body={t('export.emptyBody')}
            icon={<InboxIcon className="size-10" />}
          />
        ) : (
          <>
            {demoEnabled && (
              <Banner tone="warning" title={t('export.demoWarningTitle')}>
                {t('export.demoWarningBody')}
              </Banner>
            )}

            <Banner tone="info" title={t('export.privacyHeading')}>
              {t('export.privacyBody')}
            </Banner>

            <Section title={t('export.formatHeading')}>
              <RadioGroup
                label={t('export.formatHeading')}
                value={format}
                onChange={(next) => setFormat(next as Format)}
                options={[
                  { value: 'csv', label: t('export.csv'), description: t('export.csvHint') },
                  { value: 'json', label: t('export.json'), description: t('export.jsonHint') },
                ]}
              />
            </Section>

            {error !== null && (
              <Banner tone="danger" title={t('export.error')}>
                {error}
              </Banner>
            )}

            <Section>
              <p className="text-base text-on-surface tabular-nums">
                {t('export.rowCount', { count: rows.length })}
              </p>
              <div className="mt-3">
                <Button onClick={download} loading={busy} fullWidth>
                  {busy ? t('export.preparing') : t('export.download')}
                </Button>
              </div>
            </Section>

            <Section title={t('export.columnsHeading')}>
              <Card padding="sm">
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                  {EXPORT_COLUMNS.map((column) => (
                    <li key={column} className="font-mono">
                      {column}
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
          </>
        )}
      </Page>
    </>
  )
}

export default ExportPage
