import { useEffect, useMemo, useState } from 'react'
import { Button, Card, EmptyState, Select, Spinner } from '../../components'
import { ANONYMOUS_ACTOR } from '../../audit/audit'
import { db as defaultDb, type AuscultaDB } from '../../db/db'
import type { AuditLog, Patient, User } from '../../db/types'
import { AdminShell } from './AdminShell'
import { useAdminTranslation } from './i18n'

export const AUDIT_PAGE_SIZE = 25

export interface AuditLogPageProps {
  /** Injected in tests so the screen can run against an isolated database. */
  database?: AuscultaDB
}

interface Filters {
  userId: string
  actionCode: string
  patientId: string
}

const NO_FILTER = ''

/**
 * The accountability record, finally visible.
 *
 * Every feature has been writing to `auditLogs` all along and nothing has ever
 * read it. An audit trail nobody can read is not an audit trail — it is a table.
 *
 * Newest first, because the question an administrator arrives with is almost
 * always "what just happened", not "what happened in March". Ordered by `seq`
 * rather than by timestamp: two actions in the same millisecond are common
 * during a seed or a bulk approval, and the auto-increment key is the only
 * thing that preserves which came first.
 *
 * Ids are resolved to names where an account or patient still exists, and
 * labelled plainly where it does not — a log that says only
 * `9f3a-…` answers nothing, and silently dropping rows whose actor was deleted
 * would quietly remove exactly the entries most worth reading.
 */
export function AuditLogPage({ database }: AuditLogPageProps = {}) {
  const { t } = useAdminTranslation()

  const [rows, setRows] = useState<AuditLog[] | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [filters, setFilters] = useState<Filters>({
    userId: NO_FILTER,
    actionCode: NO_FILTER,
    patientId: NO_FILTER,
  })
  const [page, setPage] = useState(0)

  useEffect(() => {
    const db = database ?? defaultDb
    let cancelled = false

    void Promise.all([
      db.auditLogs.orderBy('seq').reverse().toArray(),
      db.users.toArray(),
      db.patients.toArray(),
    ])
      .then(([logs, allUsers, allPatients]) => {
        if (cancelled) return
        setRows(logs)
        setUsers(allUsers)
        setPatients(allPatients)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })

    return () => {
      cancelled = true
    }
  }, [database])

  const userName = useMemo(() => {
    const byId = new Map(users.map((user) => [user.id, user.name]))
    return (id: string) => {
      if (id === ANONYMOUS_ACTOR) return t('admin:audit.anonymous')
      return byId.get(id) ?? t('admin:audit.unknownUser')
    }
  }, [users, t])

  const patientName = useMemo(() => {
    const byId = new Map(patients.map((patient) => [patient.id, patient.name]))
    return (id: string) => byId.get(id) ?? id
  }, [patients])

  /** Action codes actually present, so the filter never offers an empty result. */
  const actionCodes = useMemo(
    () => [...new Set((rows ?? []).map((row) => row.actionCode))].sort(),
    [rows],
  )
  const actorIds = useMemo(
    () => [...new Set((rows ?? []).map((row) => row.userId))].sort(),
    [rows],
  )
  const patientIds = useMemo(
    () =>
      [...new Set((rows ?? []).map((row) => row.patientId).filter((id): id is string => id !== undefined))].sort(),
    [rows],
  )

  const filtered = useMemo(() => {
    return (rows ?? []).filter((row) => {
      if (filters.userId !== NO_FILTER && row.userId !== filters.userId) return false
      if (filters.actionCode !== NO_FILTER && row.actionCode !== filters.actionCode) return false
      if (filters.patientId !== NO_FILTER && row.patientId !== filters.patientId) return false
      return true
    })
  }, [rows, filters])

  const pageCount = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(safePage * AUDIT_PAGE_SIZE, (safePage + 1) * AUDIT_PAGE_SIZE)

  function setFilter(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }))
    // Any filter change invalidates the current offset: page 4 of a narrower
    // result set is usually empty, which reads as "nothing found".
    setPage(0)
  }

  const hasFilters =
    filters.userId !== NO_FILTER ||
    filters.actionCode !== NO_FILTER ||
    filters.patientId !== NO_FILTER

  const body = (() => {
    if (rows === null) {
      return (
        <div className="flex items-center gap-3 py-6" aria-busy="true">
          <Spinner />
          <p className="text-base text-muted">{t('admin:audit.loading')}</p>
        </div>
      )
    }

    if (rows.length === 0) return <EmptyState title={t('admin:audit.empty')} />

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Select
            label={t('admin:audit.filterUser')}
            value={filters.userId}
            onChange={(userId) => setFilter({ userId })}
            options={[
              { value: NO_FILTER, label: t('admin:audit.filterAny') },
              ...actorIds.map((id) => ({ value: id, label: userName(id) })),
            ]}
          />
          <Select
            label={t('admin:audit.filterAction')}
            value={filters.actionCode}
            onChange={(actionCode) => setFilter({ actionCode })}
            options={[
              { value: NO_FILTER, label: t('admin:audit.filterAnyAction') },
              ...actionCodes.map((code) => ({
                value: code,
                // Action codes come from several features' own vocabularies, so
                // an unknown one shows its code rather than a blank.
                label: t(`admin:action.${code}`, {
                  defaultValue: t(`auth:auditAction.${code}`, { defaultValue: code }),
                }),
              })),
            ]}
          />
          {patientIds.length > 0 && (
            <Select
              label={t('admin:audit.filterPatient')}
              value={filters.patientId}
              onChange={(patientId) => setFilter({ patientId })}
              options={[
                { value: NO_FILTER, label: t('admin:audit.filterAnyPatient') },
                ...patientIds.map((id) => ({ value: id, label: patientName(id) })),
              ]}
            />
          )}
          {hasFilters && (
            <Button
              variant="secondary"
              onClick={() =>
                setFilter({ userId: NO_FILTER, actionCode: NO_FILTER, patientId: NO_FILTER })
              }
            >
              {t('admin:audit.clearFilters')}
            </Button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState title={t('admin:audit.noMatches')} />
        ) : (
          <>
            <p className="text-sm text-muted" role="status">
              {t('admin:audit.showing', {
                from: safePage * AUDIT_PAGE_SIZE + 1,
                to: safePage * AUDIT_PAGE_SIZE + visible.length,
                total: filtered.length,
              })}
            </p>

            {/* Named so the entries are distinguishable from the section nav
                and the filter controls, for a screen reader and for a test. */}
            <ul aria-label={t('admin:audit.title')} className="flex flex-col gap-2">
              {visible.map((row) => (
                <li key={row.seq}>
                  <Card as="div" padding="sm">
                    <div className="flex flex-col gap-1">
                      <span className="text-base font-semibold text-on-surface">
                        {t(`admin:action.${row.actionCode}`, {
                          defaultValue: t(`auth:auditAction.${row.actionCode}`, {
                            defaultValue: row.actionCode,
                          }),
                        })}
                      </span>
                      <span className="text-sm text-muted">
                        {new Date(row.timestamp).toLocaleString()}
                      </span>
                      <span className="text-sm text-on-surface">
                        {t('admin:audit.byWhom', { name: userName(row.userId) })}
                      </span>
                      {row.patientId !== undefined && (
                        <span className="text-sm text-on-surface">
                          {t('admin:audit.aboutPatient', { name: patientName(row.patientId) })}
                        </span>
                      )}
                      {row.detail !== undefined && (
                        <details className="text-sm text-muted">
                          <summary className="min-h-12 cursor-pointer py-3">
                            {t('admin:audit.detail')}
                          </summary>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">
                            {JSON.stringify(row.detail, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            {pageCount > 1 && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={safePage === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  {t('admin:audit.previous')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                >
                  {t('admin:audit.next')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    )
  })()

  return (
    <AdminShell
      activeId="audit"
      title={t('admin:audit.title')}
      subtitle={t('admin:audit.subtitle')}
    >
      {body}
    </AdminShell>
  )
}
