import { Link } from 'react-router-dom'
import {
  Banner,
  Card,
  ChevronRightIcon,
  DangerIcon,
  DisclaimerBanner,
  Section,
  WarningIcon,
} from '../../../components'
import { CitationList, PendingReviewNotice } from '../components/Provenance'
import { RehabScreen } from '../components/RehabScreen'
import {
  TECHNIQUES,
  excludedTechniquesShownToUser,
  techniqueNameKey,
  techniqueSummaryKey,
  type Technique,
} from '../content/techniques'
import { useRehabTranslation } from '../i18n'
import { REHAB_PATHS, techniquePath } from '../navigation'

/**
 * The technique library.
 *
 * Four techniques, not ten. Every one is either well-evidenced or very
 * low-risk, and each carries its evidence strength as a sentence rather than a
 * badge — "moderate" means nothing to a patient, "one good trial supports it,
 * with real limits on what it showed" means something.
 *
 * Three things sit above the list, in this order:
 *
 * 1. The link to the red flags, so the safety screen is one tap from here too.
 * 2. The universal caution: none of this replaces reliever medicine.
 * 3. An honest paragraph about how much these actually do, written in the same
 *    modest register as NIH's own consumer guidance rather than the confident
 *    claims made by wellness sites.
 *
 * At the bottom, deliberately, is the note about huff coughing — an activity
 * the master specification lists and this module refuses to ship. It is framed
 * as an exclusion with its reason, never as a technique, so it can never read
 * as a suggestion; and it is in the product rather than only in a commit
 * message so that the next person to work from the specification finds out why
 * before adding it back.
 */
export function TechniquesPage() {
  const { t } = useRehabTranslation()

  return (
    <RehabScreen title={t('rehab:techniques.title')}>
      <PendingReviewNotice />
      <p className="text-lg text-on-surface">{t('rehab:techniques.lead')}</p>

      <Banner tone="warning" action={<SafetyLink />}>
        {t('rehab:techniques.universalCaution')}
      </Banner>

      <Card>
        <p className="text-base text-on-surface">{t('rehab:techniques.honesty')}</p>
        <p className="mt-2 text-base font-semibold text-on-surface">
          {t('rehab:techniques.practitionerSets')}
        </p>
        <CitationList citations={['NCCIH_2022']} />
      </Card>

      <Section title={t('rehab:techniques.title')}>
        <ul className="flex flex-col gap-3">
          {TECHNIQUES.map((technique) => (
            <TechniqueRow key={technique.code} technique={technique} />
          ))}
        </ul>
      </Section>

      <ExcludedNote />

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

/** One technique, as a whole-card link so the entire tile is the touch target. */
function TechniqueRow({ technique }: { technique: Technique }) {
  const { t } = useRehabTranslation()

  return (
    <li>
      <Link
        to={techniquePath(technique.code)}
        className="flex min-h-16 items-start gap-3 rounded-card bg-card p-4 text-on-surface"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-lg font-bold">
            {t(techniqueNameKey(technique.code))}
          </span>
          <span className="mt-0.5 block text-base text-muted">
            {t(techniqueSummaryKey(technique.code))}
          </span>
          <span className="mt-1 block text-sm text-on-surface">
            {t('rehab:techniques.evidenceHeading')} {t(`rehab:techniques.evidence.${technique.evidence}`)}
          </span>
        </span>
        <ChevronRightIcon className="mt-1 size-6 shrink-0 text-muted" />
      </Link>
    </li>
  )
}

/**
 * What we took out, and why.
 *
 * `danger` tone with an icon and a heading that says "left out": this must not
 * be mistakable for an entry in the list above it, on any screen, in any
 * theme, in greyscale.
 */
function ExcludedNote() {
  const { t } = useRehabTranslation()
  const excluded = excludedTechniquesShownToUser()

  if (excluded.length === 0) return null

  return (
    <Section title={t('rehab:techniques.notOffered.heading')}>
      <p className="text-base text-muted">{t('rehab:techniques.notOffered.body')}</p>
      {excluded.map((entry) => (
        <Banner
          key={entry.code}
          tone="danger"
          title={t(`rehab:techniques.notOffered.${entry.code}.name`)}
        >
          <div className="flex items-start gap-2">
            <DangerIcon className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>{t(`rehab:techniques.notOffered.${entry.code}.reason`)}</p>
              <p className="mt-2 font-semibold">
                {t(`rehab:techniques.notOffered.${entry.code}.rule`)}
              </p>
              <CitationList citations={entry.citations} />
            </div>
          </div>
        </Banner>
      ))}
    </Section>
  )
}
