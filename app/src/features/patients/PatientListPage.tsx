import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  FictionalDataBanner,
  InboxIcon,
  Page,
  SearchIcon,
  Skeleton,
  SkeletonGroup,
  TextField,
} from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { ROLES } from '../../db/codes'
import type { Patient } from '../../db/types'
import { usePatientsTranslation } from './i18n'
import { formatPatientIdForDisplay } from './ids'
import {
  createPatientRepository,
  ROLES_THAT_CAN_REGISTER,
  type Actor,
  type PatientRepository,
} from './repository'
import { ageInYears } from './validation'

export interface PatientListPageProps {
  /** Injected in tests so a page can run against an isolated database. */
  repository?: PatientRepository
}

export function PatientListPage({ repository }: PatientListPageProps = {}) {
  const { t } = usePatientsTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const repo = useMemo(() => repository ?? createPatientRepository(), [repository])
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
        <p className="text-sm text-muted">
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
        <span className="text-sm text-muted">
          {age === null ? t('card.ageUnknown') : t('card.age', { count: age })}
          {' - '}
          {t(`codes:sex.${patient.sex}`)}
          {' - '}
          {formatPatientIdForDisplay(patient.id)}
        </span>
        <span className="flex flex-wrap gap-2 pt-1">
          {patient.consent === null ? (
            <Tag tone="warning">{t('card.consentMissing')}</Tag>
          ) : (
            <Tag tone="neutral">{t(`codes:consentStatus.${patient.consent.status}`)}</Tag>
          )}
        </span>
      </button>

      {/* Outside the button: seeded rows must be labelled as fictional, and a
          banner does not belong inside a control's accessible name. */}
      {patient.isDemo === 1 && (
        <div className="px-4 pb-3">
          <FictionalDataBanner compact />
        </div>
      )}
    </Card>
  )
}

function Tag({ tone, children }: { tone: 'neutral' | 'warning'; children: React.ReactNode }) {
  const className =
    tone === 'warning'
      ? 'bg-warning-surface text-on-warning-surface'
      : 'bg-surface-sunken text-muted'
  return (
    <span className={`rounded-pill px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>
  )
}
