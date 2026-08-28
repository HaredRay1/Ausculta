import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppBar,
  AudioPlayer,
  Banner,
  Button,
  Card,
  ConfidenceBar,
  EmptyState,
  FictionalDataBanner,
  InboxIcon,
  NotConnectedPanel,
  Page,
  ResultCard,
  Section,
  Skeleton,
  SkeletonGroup,
  SourceBadge,
} from '../../components'
import { useAuth } from '../../auth/AuthContext'
import type { HistoryEntry, Measurement, Patient, SymptomEntry } from '../../db/types'
import { ageInYears } from '../patients/validation'
import { aiFindingFor, type AiFinding } from './aiFinding'
import { useReviewTranslation } from './i18n'
import {
  createReviewRepository,
  type Actor,
  type ClinicalCase,
  type LocationCase,
  type ReviewRepository,
} from './repository'

type LoadState = 'loading' | 'found' | 'missing'

export interface ClinicalViewPageProps {
  /** Injected in tests so the screen can run against an isolated database. */
  repository?: ReviewRepository
}

export function ClinicalViewPage({ repository }: ClinicalViewPageProps = {}) {
  const { t } = useReviewTranslation()
  const navigate = useNavigate()
  const { assessmentId = '' } = useParams()
  const { user } = useAuth()

  const repo = useMemo(() => repository ?? createReviewRepository(), [repository])
  const actor: Actor | null = user === null ? null : { id: user.id, role: user.role }

  const [clinicalCase, setClinicalCase] = useState<ClinicalCase | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    if (actor === null) return
    let cancelled = false

    void repo.getCase(assessmentId, actor).then((found) => {
      if (cancelled) return
      setClinicalCase(found ?? null)
      setState(found === undefined ? 'missing' : 'found')
    })

    return () => {
      cancelled = true
    }
  }, [assessmentId, actor?.id, actor?.role, repo])

  if (state === 'loading') {
    return (
      <Page>
        <AppBar title={t('case.title')} onBack={() => navigate('/review')} />
        <SkeletonGroup label={t('queue.loading')}>
          <Skeleton className="h-28 w-full" lines={4} />
        </SkeletonGroup>
      </Page>
    )
  }

  if (state === 'missing' || clinicalCase === null) {
    return (
      <Page>
        <AppBar title={t('case.title')} onBack={() => navigate('/review')} />
        <EmptyState
          title={t('case.notFound')}
          body={t('case.notFoundHint')}
          icon={<InboxIcon />}
          action={
            <Button fullWidth onClick={() => navigate('/review')}>
              {t('case.backToQueue')}
            </Button>
          }
        />
      </Page>
    )
  }

  const { assessment, patient, locations, reviews } = clinicalCase
  const overallReview = reviews.find((r) => r.recordingId === undefined)
  const modelVersion = locations.find((l) => l.recording.modelVersion !== undefined)?.recording
    .modelVersion

  return (
    <Page>
      <AppBar
        title={patient.name}
        subtitle={t('case.recordedOn', { date: formatDate(assessment.date) })}
        onBack={() => navigate('/review')}
      />

      {assessment.isDemo === 1 && <FictionalDataBanner />}

      {/*
        The practitioner's conclusion sits ABOVE the machine's output when one
        exists. A reviewer opening a case someone has already decided should
        meet the human judgement first, not scroll past six model outputs to
        discover the question was already answered.
      */}
      <PractitionerBlock
        interpretation={overallReview?.interpretationCode}
        notes={overallReview?.notes}
        reviewedAt={overallReview?.reviewedAt}
      />

      <PatientContext patient={patient} symptoms={assessment.symptoms} vitals={assessment.vitals} />

      <Section title={t('case.recordings')}>
        <div className="flex flex-col gap-4">
          {locations.map((location) => (
            <LocationBlock key={location.recording.id} location={location} />
          ))}
        </div>
      </Section>

      <Section title={t('case.model')}>
        <Card>
          <p className="text-base text-on-surface">
            {modelVersion === undefined
              ? t('case.modelUnknown')
              : t('case.modelVersion', { version: modelVersion })}
          </p>
          <p className="mt-2 text-sm text-muted">{t('case.modelNote')}</p>
        </Card>
      </Section>

      <div className="flex flex-col gap-3 pb-4">
        <Button
          size="lg"
          fullWidth
          onClick={() => navigate(`/review/${assessment.id}/decide`)}
        >
          {t('case.startReview')}
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => navigate(`/review/${assessment.id}/report`)}
        >
          {t('case.openReport')}
        </Button>
      </div>
    </Page>
  )
}

/**
 * The human side of the split.
 *
 * Given its own heading and its own words in every state, including the state
 * where nobody has reviewed yet — an absent block would leave the machine's
 * output as the only thing on the page, which is exactly the confusion this
 * screen exists to prevent.
 */
function PractitionerBlock({
  interpretation,
  notes,
  reviewedAt,
}: {
  interpretation?: string
  notes?: string
  reviewedAt?: string
}) {
  const { t } = useReviewTranslation()

  if (interpretation === undefined) {
    return (
      <Section title={t('label.practitioner')}>
        <Card>
          <p className="text-base font-semibold text-on-surface">{t('label.notReviewed')}</p>
          <p className="mt-1 text-sm text-muted">{t('label.notReviewedNote')}</p>
        </Card>
      </Section>
    )
  }

  return (
    <Section title={t('label.practitioner')}>
      <Card>
        <p className="text-lg font-semibold text-on-surface">{t(`outcome.${interpretation}`)}</p>
        <p className="mt-1 text-sm text-muted">{t('label.practitionerNote')}</p>
        {notes !== undefined && notes !== '' && (
          <p className="mt-3 text-base text-on-surface">{notes}</p>
        )}
        {reviewedAt !== undefined && (
          <p className="mt-3 text-sm text-muted">
            {t('case.reviewedOn', { date: formatDate(reviewedAt) })}
          </p>
        )}
      </Card>
    </Section>
  )
}

function PatientContext({
  patient,
  symptoms,
  vitals,
}: {
  patient: Patient
  symptoms: readonly SymptomEntry[]
  vitals: readonly Measurement[]
}) {
  const { t } = useReviewTranslation()
  const age = ageInYears(patient.birthDate)

  return (
    <Section title={t('case.patientContext')}>
      <Card>
        <p className="text-base text-on-surface">
          {age === null ? t('case.ageUnknown') : t('case.age', { count: age })}
          {' - '}
          {t(`codes:sex.${patient.sex}`)}
        </p>

        <SubHeading>{t('case.symptoms')}</SubHeading>
        {symptoms.length === 0 ? (
          <Muted>{t('case.noSymptoms')}</Muted>
        ) : (
          <ul className="flex flex-col gap-1">
            {symptoms.map((symptom) => (
              <li key={symptom.code} className="text-base text-on-surface">
                {t(`codes:symptom.${symptom.code}`)}
                {symptom.present ? '' : ` - ${t('label.notReviewed')}`}
                {symptom.severityCode !== undefined &&
                  ` - ${t(`codes:symptomSeverity.${symptom.severityCode}`)}`}
              </li>
            ))}
          </ul>
        )}

        <SubHeading>{t('case.vitals')}</SubHeading>
        {vitals.length === 0 ? (
          <Muted>{t('case.noVitals')}</Muted>
        ) : (
          <ul className="flex flex-col gap-2">
            {vitals.map((vital) => (
              <li key={`${vital.code}-${vital.enteredAt}`} className="flex flex-wrap items-center gap-2">
                <span className="text-base text-on-surface">
                  {t(`codes:measurement.${vital.code}`)}: {vital.value} {vital.unit}
                </span>
                {/* Every value carries where it came from. */}
                <SourceBadge source={vital.source} />
              </li>
            ))}
          </ul>
        )}

        <SubHeading>{t('case.respiratory')}</SubHeading>
        <HistoryList entries={patient.respiratoryHistory} namespace="respiratoryHistory" />

        <SubHeading>{t('case.family')}</SubHeading>
        <HistoryList entries={patient.familyHistory} namespace="familyHistory" />

        <p className="mt-3 text-sm text-muted">{t('case.notAskedNote')}</p>
      </Card>
    </Section>
  )
}

function HistoryList({
  entries,
  namespace,
}: {
  entries: readonly HistoryEntry[]
  namespace: 'respiratoryHistory' | 'familyHistory'
}) {
  const { t } = useReviewTranslation()
  if (entries.length === 0) return <Muted>{t('case.noHistory')}</Muted>

  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) => (
        <li key={entry.code} className="flex items-baseline justify-between gap-3">
          <span className="text-base text-on-surface">{t(`codes:${namespace}.${entry.code}`)}</span>
          <span className={entry.present ? 'text-base font-semibold text-on-surface' : 'text-base text-muted'}>
            {entry.present ? 'Yes' : 'No'}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * One lung location.
 *
 * The machine's output is wrapped in a block whose heading says, in words, that
 * it came from software. The brief's central rule is that a reviewer glancing
 * quickly must never mistake a model guess for a colleague's opinion, and a
 * colour or an icon alone does not survive a glance, a greyscale print, or a
 * screen reader.
 */
function LocationBlock({ location }: { location: LocationCase }) {
  const { t } = useReviewTranslation()
  const [audioFailed, setAudioFailed] = useState(false)
  const finding = aiFindingFor(location.recording)
  const locationName = t(`codes:location.${location.locationCode}`)

  return (
    <Card as="article" aria-label={locationName}>
      <h3 className="text-lg font-semibold text-on-surface">{locationName}</h3>

      <div className="mt-3">
        {location.audioBlob === undefined || audioFailed ? (
          <Banner tone="warning" title={t('location.audioMissing')}>
            {t('location.audioMissingHint')}
          </Banner>
        ) : (
          <AudioPlayer
            blob={location.audioBlob}
            label={t('location.listen', { location: locationName })}
            durationSec={location.recording.durationSec}
            onError={() => setAudioFailed(true)}
          />
        )}
      </div>

      {/* --- the machine's output, named as such --- */}
      <div className="mt-4 border-t-2 border-border pt-3">
        <h4 className="text-sm font-bold uppercase tracking-wide text-muted">{t('label.ai')}</h4>
        <p className="mt-1 text-sm text-muted">{t('label.aiNote')}</p>
        <div className="mt-3">
          <AiBlock finding={finding} />
        </div>
      </div>

      <Comparison location={location} />
    </Card>
  )
}

function AiBlock({ finding }: { finding: AiFinding }) {
  const { t } = useReviewTranslation()

  if (finding.verdict === null) {
    // Nothing was decided. NotConnectedPanel carries no number and no control,
    // so it cannot read as a value that came back empty.
    return <NotConnectedPanel title={t('label.ai')} />
  }

  return (
    <ResultCard
      verdict={finding.verdict}
      {...(finding.confidencePercent !== undefined && {
        confidencePercent: finding.confidencePercent,
      })}
    >
      {finding.classificationCode !== undefined && (
        <p className="text-base text-on-surface">
          {t(`codes:classification.${finding.classificationCode}`)}
        </p>
      )}
      {finding.confidencePercent !== undefined && (
        <div className="mt-2">
          <ConfidenceBar percent={finding.confidencePercent} hideExplanation />
        </div>
      )}
    </ResultCard>
  )
}

/**
 * Previous versus current for this location.
 *
 * Renders nothing at all when there is no earlier recording. The wording is
 * deliberately about the recordings, never about the person: the app observes a
 * change in a sound pattern, and the clinician is the one who concludes whether
 * that means anything.
 */
function Comparison({ location }: { location: LocationCase }) {
  const { t } = useReviewTranslation()
  if (location.previous === undefined || location.changed === undefined) return null

  return (
    <div className="mt-4 border-t-2 border-border pt-3">
      <h4 className="text-sm font-bold uppercase tracking-wide text-muted">
        {t('location.previous')}
      </h4>
      <p className="mt-1 text-sm text-muted">
        {t('location.comparedWith', { date: formatDate(location.previous.createdAt) })}
      </p>
      <p className="mt-2 text-base text-on-surface">
        {location.changed ? t('location.changed') : t('location.unchanged')}
      </p>
    </div>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mt-4 mb-1 text-sm font-bold uppercase tracking-wide text-muted">{children}</h4>
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-muted">{children}</p>
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString()
}
