import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Banner } from '../../components/feedback/Banner'
import { EmptyState } from '../../components/feedback/EmptyState'
import { Skeleton, SkeletonGroup } from '../../components/feedback/Skeleton'
import { AppBar } from '../../components/layout/AppBar'
import { Page, Section } from '../../components/layout/Page'
import { Button } from '../../components/primitives/Button'
import { Card } from '../../components/primitives/Card'
import { InboxIcon } from '../../components/icons'
import { useAuth } from '../../auth/AuthContext'
import type { HistoryEntry, Patient } from '../../db/types'
import { usePatientsTranslation } from './i18n'
import { formatPatientIdForDisplay } from './ids'
import { createPatientRepository, type Actor } from './repository'
import { ageInYears } from './validation'

type LoadState = 'loading' | 'found' | 'missing'

export function PatientDetailPage() {
  const { t } = usePatientsTranslation()
  const navigate = useNavigate()
  const { patientId = '' } = useParams()
  const { user } = useAuth()

  const repo = useMemo(() => createPatientRepository(), [])
  const actor: Actor | null = user === null ? null : { id: user.id, role: user.role }

  const [patient, setPatient] = useState<Patient | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    if (actor === null) return
    let cancelled = false

    void repo.get(patientId, actor).then((found) => {
      if (cancelled) return
      setPatient(found ?? null)
      setState(found === undefined ? 'missing' : 'found')
    })

    return () => {
      cancelled = true
    }
  }, [patientId, actor?.id, actor?.role, repo])

  if (state === 'loading') {
    return (
      <Page>
        <AppBar title={t('detail.title')} onBack={() => navigate('/patients')} />
        <SkeletonGroup label={t('list.loading')}>
          <Skeleton className="h-24 w-full" lines={4} />
        </SkeletonGroup>
      </Page>
    )
  }

  if (state === 'missing' || patient === null) {
    return (
      <Page>
        <AppBar title={t('detail.title')} onBack={() => navigate('/patients')} />
        <EmptyState
          title={t('detail.notFound')}
          body={t('detail.notFoundHint')}
          icon={<InboxIcon />}
          action={
            <Button fullWidth onClick={() => navigate('/patients')}>
              {t('detail.backToList')}
            </Button>
          }
        />
      </Page>
    )
  }

  const age = ageInYears(patient.birthDate)

  return (
    <Page>
      <AppBar
        title={patient.name}
        subtitle={formatPatientIdForDisplay(patient.id)}
        onBack={() => navigate('/patients')}
      />

      <Section title={t('detail.demographics')}>
        <Card>
          <dl className="flex flex-col gap-3">
            <Row label={t('detail.patientId')} value={formatPatientIdForDisplay(patient.id)} />
            <Row
              label={t('field.birthDate')}
              value={`${patient.birthDate}${
                age === null ? '' : ` (${t('card.age', { count: age })})`
              }`}
            />
            <Row label={t('field.sex')} value={t(`codes:sex.${patient.sex}`)} />
            {patient.address !== undefined && (
              <Row label={t('field.address')} value={patient.address} />
            )}
            {patient.contact !== undefined && (
              <Row label={t('field.contact')} value={patient.contact} />
            )}
            <Row
              label={t('detail.studyId')}
              value={patient.studyId}
              hint={t('detail.studyIdHint')}
            />
          </dl>
        </Card>
      </Section>

      <Section title={t('detail.consent')}>
        {patient.consent === null ? (
          <Banner tone="warning" title={t('consent.notRecorded')}>
            {t('consent.notRecordedHint')}
          </Banner>
        ) : (
          <Card>
            <p className="text-lg font-semibold text-on-surface">
              {t(`codes:consentStatus.${patient.consent.status}`)}
            </p>
            <dl className="mt-3 flex flex-col gap-3">
              <Row
                label={t('consent.shownIn', { language: patient.consent.language })}
                value={t('consent.version', { version: patient.consent.textVersion })}
              />
              <Row
                label={t('consent.recordedOn', {
                  date: new Date(patient.consent.presentedAt).toLocaleString(),
                })}
                value={t('consent.recordedBy', { name: patient.consent.recordedBy })}
              />
            </dl>
          </Card>
        )}
      </Section>

      <HistorySection
        title={t('detail.respiratory')}
        entries={patient.respiratoryHistory}
        codeNamespace="respiratoryHistory"
        emptyLabel={t('detail.noHistoryRecorded')}
      />

      <HistorySection
        title={t('detail.family')}
        entries={patient.familyHistory}
        codeNamespace="familyHistory"
        emptyLabel={t('detail.noFamilyRecorded')}
      />

      <Section title={t('detail.care')}>
        <Card>
          <dl className="flex flex-col gap-3">
            <Row
              label={t('care.practitioners')}
              value={
                patient.assignedPractitionerIds.length === 0
                  ? t('care.none')
                  : patient.assignedPractitionerIds.join(', ')
              }
            />
            <Row
              label={t('care.healthWorkers')}
              value={
                patient.assignedHealthWorkerIds.length === 0
                  ? t('care.none')
                  : patient.assignedHealthWorkerIds.join(', ')
              }
            />
            <Row
              label={t('detail.account')}
              value={
                patient.linkedUserId === undefined
                  ? t('account.notLinked')
                  : t('account.linked', { username: patient.linkedUserId })
              }
            />
          </dl>
        </Card>
      </Section>
    </Page>
  )
}

function HistorySection({
  title,
  entries,
  codeNamespace,
  emptyLabel,
}: {
  title: string
  entries: readonly HistoryEntry[]
  codeNamespace: 'respiratoryHistory' | 'familyHistory'
  emptyLabel: string
}) {
  const { t } = usePatientsTranslation()

  if (entries.length === 0) {
    return (
      <Section title={title}>
        <Card>
          <p className="text-base text-on-surface-muted">{emptyLabel}</p>
        </Card>
      </Section>
    )
  }

  return (
    <Section title={title}>
      <Card>
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.code} className="flex items-baseline justify-between gap-3">
              <span className="text-base text-on-surface">
                {t(`codes:${codeNamespace}.${entry.code}`)}
              </span>
              <span
                className={
                  entry.present
                    ? 'text-base font-semibold text-on-surface'
                    : 'text-base text-on-surface-muted'
                }
              >
                {entry.present ? t('detail.historyPresent') : t('detail.historyAbsent')}
              </span>
            </li>
          ))}
        </ul>
        {/* Absent codes were never asked, which is not the same as answered no. */}
        <p className="mt-3 text-sm text-on-surface-muted">{t('detail.notAskedNote')}</p>
      </Card>
    </Section>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-sm text-on-surface-muted">{label}</dt>
      <dd className="text-base text-on-surface">{value}</dd>
      {hint !== undefined && <dd className="text-xs text-on-surface-muted">{hint}</dd>}
    </div>
  )
}
