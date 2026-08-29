import { Link, useParams } from 'react-router-dom'
import {
  Banner,
  Card,
  DisclaimerBanner,
  EmptyState,
  Section,
  WarningIcon,
} from '../../../components'
import { CitationList, PendingReviewNotice } from '../components/Provenance'
import { RehabScreen } from '../components/RehabScreen'
import {
  findTechnique,
  techniqueCautionsKey,
  techniqueNameKey,
  techniqueStepsKey,
  techniqueSuitsKey,
  techniqueSummaryKey,
  type Technique,
} from '../content/techniques'
import { useRehabTranslation } from '../i18n'
import { REHAB_PATHS } from '../navigation'

/**
 * One technique in full.
 *
 * Fixed order — summary, who it suits, cautions, steps, sources — and the
 * cautions come *before* the steps deliberately. A person reading a set of
 * instructions follows them; the limits of the technique have to be on screen
 * before the instructions are, not after.
 *
 * The steps carry no counts, no breath ratios and no durations. The clinical
 * research behind this module grades the techniques but contains no
 * step-by-step protocol, so any number here would be invented clinical content.
 * How often and for how long is a practitioner's decision under the
 * specification's own approval boundary, and the screen says so.
 */
export function TechniqueDetailPage() {
  const { t } = useRehabTranslation()
  const { techniqueCode } = useParams<{ techniqueCode: string }>()
  const technique = techniqueCode === undefined ? undefined : findTechnique(techniqueCode)

  if (technique === undefined) {
    return (
      <RehabScreen title={t('rehab:techniques.title')} backTo={REHAB_PATHS.techniques}>
        <EmptyState
          title={t('rehab:techniques.title')}
          body={t('rehab:techniques.lead')}
          action={
            <Link
              to={REHAB_PATHS.techniques}
              className="inline-flex min-h-14 w-full items-center justify-center rounded-control bg-primary-strong px-5 text-lg font-semibold text-on-primary"
            >
              {t('rehab:techniques.backToList')}
            </Link>
          }
        />
      </RehabScreen>
    )
  }

  return (
    <RehabScreen
      title={t(techniqueNameKey(technique.code))}
      backTo={REHAB_PATHS.techniques}
    >
      <PendingReviewNotice />

      <p className="text-lg text-on-surface">{t(techniqueSummaryKey(technique.code))}</p>

      <Banner tone="warning" action={<SafetyLink />}>
        {t('rehab:techniques.universalCaution')}
      </Banner>

      <Section title={t('rehab:techniques.suitsHeading')}>
        <Card>
          <p className="text-base text-on-surface">{t(techniqueSuitsKey(technique.code))}</p>
          <p className="mt-2 text-base font-semibold text-on-surface">
            {t('rehab:techniques.practitionerSets')}
          </p>
        </Card>
      </Section>

      <CautionsSection technique={technique} />

      <StepsSection technique={technique} />

      <Section title={t('rehab:techniques.evidenceHeading')}>
        <Card>
          <p className="text-base text-on-surface">
            {t(`rehab:techniques.evidence.${technique.evidence}`)}
          </p>
          <CitationList citations={technique.citations} />
        </Card>
      </Section>

      <DisclaimerBanner />
    </RehabScreen>
  )
}

function SafetyLink() {
  const { t } = useRehabTranslation()

  return (
    <Link
      to={REHAB_PATHS.safety}
      className="inline-flex min-h-12 items-center gap-2 rounded-control border-2 border-border-strong bg-card px-4 text-base font-semibold text-on-surface"
    >
      <WarningIcon className="size-5 shrink-0" />
      {t('rehab:nav.safety')}
    </Link>
  )
}

/**
 * Reads the `cautions` / `steps` arrays out of the locale bundle.
 *
 * `returnObjects` gives back the array; anything else (a missing key, a
 * translation that flattened the array to a string) falls back to an empty
 * list rather than rendering a raw i18n key at a patient.
 */
function readList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function CautionsSection({ technique }: { technique: Technique }) {
  const { t } = useRehabTranslation()
  const cautions = readList(t(techniqueCautionsKey(technique.code), { returnObjects: true }))

  return (
    <Section title={t('rehab:techniques.cautionsHeading')}>
      <Banner tone="warning">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {cautions.map((caution) => (
            <li key={caution} className="text-base">
              {caution}
            </li>
          ))}
        </ul>
      </Banner>
    </Section>
  )
}

function StepsSection({ technique }: { technique: Technique }) {
  const { t } = useRehabTranslation()
  const steps = readList(t(techniqueStepsKey(technique.code), { returnObjects: true }))

  return (
    <Section title={t('rehab:techniques.stepsHeading')}>
      <Card>
        <ol className="flex list-decimal flex-col gap-3 pl-5">
          {steps.map((step) => (
            <li key={step} className="text-base text-on-surface">
              {step}
            </li>
          ))}
        </ol>
        {technique.stepsProvenance === 'DESCRIPTIVE_PENDING_REVIEW' && (
          <p className="mt-4 border-t border-border pt-3 text-sm text-muted">
            {t('rehab:review.stepsWrittenByTeam')}
          </p>
        )}
      </Card>
    </Section>
  )
}
