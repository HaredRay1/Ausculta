import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppBar,
  Banner,
  Button,
  Card,
  EmptyState,
  InboxIcon,
  Page,
  RadioGroup,
  Section,
  Select,
  Skeleton,
  SkeletonGroup,
  Textarea,
} from '../../components'
import { useAuth } from '../../auth/AuthContext'
import {
  CLASSIFICATION_CODES,
  INTERPRETATION_CODES,
  type ClassificationCode,
  type InterpretationCode,
} from '../../db/codes'
import { useReviewTranslation } from './i18n'
import {
  ReviewError,
  createReviewRepository,
  type Actor,
  type ClinicalCase,
  type LocationJudgementInput,
  type ReviewRepository,
} from './repository'

type LoadState = 'loading' | 'found' | 'missing'

/** Outcomes that are statements about one lung location. */
const LOCATION_SCOPED: readonly InterpretationCode[] = [
  INTERPRETATION_CODES.MODIFIED,
  INTERPRETATION_CODES.REPEAT_REQUESTED,
]

export interface ReviewFormPageProps {
  repository?: ReviewRepository
}

export function ReviewFormPage({ repository }: ReviewFormPageProps = {}) {
  const { t } = useReviewTranslation()
  const navigate = useNavigate()
  const { assessmentId = '' } = useParams()
  const { user } = useAuth()

  const repo = useMemo(() => repository ?? createReviewRepository(), [repository])
  const actor: Actor | null = user === null ? null : { id: user.id, role: user.role }

  const [clinicalCase, setClinicalCase] = useState<ClinicalCase | null>(null)
  const [state, setState] = useState<LoadState>('loading')

  const [outcome, setOutcome] = useState<InterpretationCode | ''>('')
  const [notes, setNotes] = useState('')
  const [recordingId, setRecordingId] = useState('')
  const [replacement, setReplacement] = useState<ClassificationCode | ''>('')

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

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
        <AppBar title={t('form.title')} onBack={() => navigate(`/review/${assessmentId}`)} />
        <SkeletonGroup label={t('case.loading')}>
          <Skeleton className="h-24 w-full" lines={3} />
        </SkeletonGroup>
      </Page>
    )
  }

  if (state === 'missing' || clinicalCase === null) {
    return (
      <Page>
        <AppBar title={t('form.title')} onBack={() => navigate('/review')} />
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

  if (done) {
    return (
      <Page>
        <AppBar title={t('form.submitted')} />
        <Card>
          <Banner tone="success" title={t('form.submitted')}>
            {t('form.submittedHint')}
          </Banner>
          <p className="mt-3 text-sm text-muted">{t('form.immutabilityNote')}</p>
          <div className="mt-4 flex flex-col gap-3">
            <Button fullWidth onClick={() => navigate(`/review/${assessmentId}`)}>
              {t('form.backToCase')}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => navigate('/review')}>
              {t('form.backToQueue')}
            </Button>
          </div>
        </Card>
      </Page>
    )
  }

  const needsLocation = outcome !== '' && LOCATION_SCOPED.includes(outcome)
  const needsReplacement = outcome === INTERPRETATION_CODES.MODIFIED

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (actor === null || saving || outcome === '') return

    setSaving(true)
    setError(null)

    // The fast path sends no location judgements at all. One is added only for
    // the two outcomes that are inherently about a site.
    const locations: LocationJudgementInput[] =
      needsLocation && recordingId !== ''
        ? [
            {
              recordingId,
              interpretationCode: outcome,
              ...(needsReplacement && replacement !== '' && {
                modifiedClassificationCode: replacement,
              }),
            },
          ]
        : []

    try {
      await repo.submitReview(assessmentId, { interpretationCode: outcome, notes, locations }, actor)
      setDone(true)
    } catch (caught) {
      setError(
        caught instanceof ReviewError ? t(`error.${caught.code}`) : t('error.SUBMIT_FAILED'),
      )
    } finally {
      setSaving(false)
    }
  }

  const outcomeOptions = Object.values(INTERPRETATION_CODES).map((code) => ({
    value: code,
    label: t(`outcome.${code}`),
    description: t(`outcome.${code}_DESC`),
  }))

  const locationOptions = clinicalCase.locations.map((location) => ({
    value: location.recording.id,
    label: t(`codes:location.${location.locationCode}`),
  }))

  const classificationOptions = Object.values(CLASSIFICATION_CODES).map((code) => ({
    value: code,
    label: t(`codes:classification.${code}`),
  }))

  return (
    <Page>
      <AppBar
        title={t('form.title')}
        subtitle={clinicalCase.patient.name}
        onBack={() => navigate(`/review/${assessmentId}`)}
      />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Card>
          <p className="text-base text-on-surface">{t('form.intro')}</p>
        </Card>

        {error !== null && <Banner tone="danger">{error}</Banner>}

        <Section title={t('form.outcomeLabel')}>
          <RadioGroup
            label={t('form.outcomeLabel')}
            value={outcome}
            onChange={(value) => {
              setOutcome(value as InterpretationCode)
              setError(null)
            }}
            options={outcomeOptions}
          />
        </Section>

        {needsLocation && (
          <Section title={t('form.locationLabel')} description={t('form.locationHint')}>
            <Select
              label={t('form.locationLabel')}
              value={recordingId}
              onChange={setRecordingId}
              options={locationOptions}
              placeholder={t('form.locationLabel')}
            />
            {needsReplacement && (
              <div className="mt-4">
                <Select
                  label={t('form.modifiedLabel')}
                  value={replacement}
                  onChange={(value) => setReplacement(value as ClassificationCode)}
                  options={classificationOptions}
                  placeholder={t('form.modifiedLabel')}
                />
              </div>
            )}
          </Section>
        )}

        <Section title={t('form.notesLabel')} description={t('form.notesHint')}>
          <Textarea
            label={t('form.notesLabel')}
            value={notes}
            onChange={setNotes}
            rows={4}
          />
        </Section>

        <Card>
          <p className="text-sm text-muted">{t('form.immutabilityNote')}</p>
        </Card>

        <div className="flex flex-col gap-3 pb-4">
          <Button type="submit" size="lg" fullWidth loading={saving} disabled={outcome === ''}>
            {saving ? t('form.submitting') : t('form.submit')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            fullWidth
            onClick={() => navigate(`/review/${assessmentId}`)}
          >
            {t('form.cancel')}
          </Button>
        </div>
      </form>
    </Page>
  )
}
