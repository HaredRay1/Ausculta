import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/feedback/EmptyState'
import { SkeletonGroup, Skeleton } from '../../components/feedback/Skeleton'
import { AppBar } from '../../components/layout/AppBar'
import { Page } from '../../components/layout/Page'
import { Button } from '../../components/primitives/Button'
import { Card } from '../../components/primitives/Card'
import { TextField } from '../../components/primitives/TextField'
import { InboxIcon, SearchIcon } from '../../components/icons'
import { useAuth } from '../../auth/AuthContext'
import { ROLES } from '../../db/codes'
import type { Patient } from '../../db/types'
import { usePatientsTranslation } from './i18n'
import { formatPatientIdForDisplay } from './ids'
import { createPatientRepository, ROLES_THAT_CAN_REGISTER, type Actor } from './repository'
import { ageInYears } from './validation'

export function PatientListPage() {
  const { t } = usePatientsTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const repo = useMemo(() => createPatientRepository(), [])
  const actor: Actor | null = user === null ? null : { id: user.id, role: user.role }

  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<Patient[] | null>(null)

  const load = useCallback(
    async (search: string) => {
      if (actor === null) return
      setPatients(await repo.search(search, actor))
    },
    [actor?.id, actor?.role, repo],
  )

  useEffect(() => {
    void load(query)
  }, [load, query])

  const canRegister = actor !== null && ROLES_THAT_CAN_REGISTER.includes(actor.role)
  const isResearcher = actor?.role === ROLES.RESEARCHER

  const registerButton = canRegister ? (
    <Button size="lg" fullWidth onClick={() => navigate('/patients/new')}>
      {t('list.register')}
    </Button>
  ) : undefined

  function body() {
    if (isResearcher) {
      // Not an error and not an empty list: this role is answered, not stuck.
      return (
        <EmptyState
          title={t('list.researcherBlocked')}
          body={t('list.researcherBlockedHint')}
          icon={<InboxIcon />}
        />
      )
    }

    if (patients === null) {
      return (
        <SkeletonGroup label={t('list.loading')}>
          <Skeleton className="h-20 w-full" lines={3} />
        </SkeletonGroup>
      )
    }

    if (patients.length === 0) {
      const searching = query.trim() !== ''
      return (
        <EmptyState
          title={searching ? t('list.noResults') : t('list.empty')}
          body={searching ? t('list.noResultsHint') : t('list.emptyHint')}
          icon={searching ? <SearchIcon /> : <InboxIcon />}
          action={searching ? undefined : registerButton}
        />
      )
    }

    return (
      <ul className="flex flex-col gap-3">
        {patients.map((patient) => (
          <li key={patient.id}>
            <PatientRow patient={patient} onOpen={() => navigate(`/patients/${patient.id}`)} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Page>
      <AppBar title={t('list.title')} />

      {!isResearcher && (
        <TextField
          label={t('list.searchLabel')}
          hint={t('list.searchHint')}
          value={query}
          onChange={setQuery}
          type="search"
          inputMode="search"
        />
      )}

      {patients !== null && patients.length > 0 && (
        <p className="text-sm text-on-surface-muted">
          {t('list.count', { count: patients.length })}
        </p>
      )}

      {body()}

      {!isResearcher && canRegister && patients !== null && patients.length > 0 && (
        <div className="pt-2">{registerButton}</div>
      )}
    </Page>
  )
}

function PatientRow({ patient, onOpen }: { patient: Patient; onOpen: () => void }) {
  const { t } = usePatientsTranslation()
  const age = ageInYears(patient.birthDate)

  return (
    <Card as="div" padding="none">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-16 w-full flex-col items-start gap-1 px-4 py-3 text-left active:bg-surface-sunken"
      >
        <span className="text-lg font-semibold text-on-surface">{patient.name}</span>
        <span className="text-sm text-on-surface-muted">
          {age === null ? t('card.ageUnknown') : t('card.age', { count: age })}
          {' · '}
          {t(`codes:sex.${patient.sex}`)}
          {' · '}
          {formatPatientIdForDisplay(patient.id)}
        </span>
        <span className="flex flex-wrap gap-2 pt-1">
          {patient.consent === null ? (
            <Tag tone="warning">{t('card.consentMissing')}</Tag>
          ) : (
            <Tag tone="neutral">{t(`codes:consentStatus.${patient.consent.status}`)}</Tag>
          )}
          {patient.isDemo === 1 && <Tag tone="neutral">{t('card.demo')}</Tag>}
        </span>
      </button>
    </Card>
  )
}

function Tag({ tone, children }: { tone: 'neutral' | 'warning'; children: React.ReactNode }) {
  const className =
    tone === 'warning'
      ? 'bg-warning-subtle text-on-warning-subtle'
      : 'bg-surface-sunken text-on-surface-muted'
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>
  )
}
