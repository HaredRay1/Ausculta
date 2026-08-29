import { useEffect, useState } from 'react'
import { Banner, Card, EmptyState, Spinner } from '../../components'
import { db as defaultDb, type AuscultaDB } from '../../db/db'
import type { MissingTranslationEntry } from '../../db/types'
import { AdminShell } from './AdminShell'
import { useAdminTranslation } from './i18n'

export interface TranslationsPageProps {
  /** Injected in tests so the screen can run against an isolated database. */
  database?: AuscultaDB
}

/**
 * The Filipino translation worklist.
 *
 * `missingTranslations` has been filling up since the app was first opened —
 * every key that fell back to English, with a count and a last-seen time — and
 * nobody has ever looked at it. Sorted by count because that turns a list of
 * gaps into a priority order: the key needed forty times is on a screen
 * everybody reaches, and the one needed once is on a screen almost nobody does.
 *
 * The key itself is shown deliberately. It is not user-facing prose, but it is
 * exactly what a translator needs to find the string in the locale files, and
 * hiding it would make the list pretty and useless.
 */
export function TranslationsPage({ database }: TranslationsPageProps = {}) {
  const { t } = useAdminTranslation()
  const [rows, setRows] = useState<MissingTranslationEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const db = database ?? defaultDb
    let cancelled = false

    void db.missingTranslations
      .toArray()
      .then((all) => {
        if (cancelled) return
        // Most-needed first; a stable tiebreak so the order does not shuffle
        // between visits while someone is working down the list.
        setRows(
          [...all].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
        )
      })
      .catch(() => {
        // Reporting "nothing is missing" because the read failed would be
        // actively reassuring about the opposite of what happened.
        if (cancelled) return
        setFailed(true)
        setRows([])
      })

    return () => {
      cancelled = true
    }
  }, [database])

  const body = (() => {
    if (rows === null) {
      return (
        <div className="flex items-center gap-3 py-6" aria-busy="true">
          <Spinner />
          <p className="text-base text-muted">{t('admin:translations.loading')}</p>
        </div>
      )
    }

    if (failed) {
      return <Banner tone="danger">{t('admin:translations.loadFailed')}</Banner>
    }

    if (rows.length === 0) {
      return (
        <EmptyState
          title={t('admin:translations.empty')}
          body={t('admin:translations.emptyHint')}
        />
      )
    }

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('admin:translations.sortedNote')}</p>
        <p className="text-base font-semibold text-on-surface">
          {t('admin:translations.total', { count: rows.length })}
        </p>

        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={`${row.key}-${row.language}`}>
              <Card as="div" padding="sm">
                <div className="flex flex-col gap-1">
                  <code className="break-all text-sm font-semibold text-on-surface">
                    {row.key}
                  </code>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span>
                      {t('admin:translations.language')}: {row.language}
                    </span>
                    <span>
                      {t('admin:translations.count')}: {row.count}
                    </span>
                    <span>
                      {t('admin:translations.lastSeen')}:{' '}
                      {new Date(row.lastSeen).toLocaleString()}
                    </span>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <p className="text-sm text-muted">{t('admin:translations.copyHint')}</p>
      </div>
    )
  })()

  return (
    <AdminShell
      activeId="translations"
      title={t('admin:translations.title')}
      subtitle={t('admin:translations.subtitle')}
    >
      {body}
    </AdminShell>
  )
}
