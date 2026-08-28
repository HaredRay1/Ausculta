import {
  Banner,
  Card,
  DangerIcon,
  DisclaimerBanner,
  InfoIcon,
  Section,
  WarningIcon,
  type IconComponent,
} from '../../../components'
import { CitationList, PendingReviewNotice } from '../components/Provenance'
import { RehabScreen } from '../components/RehabScreen'
import type { CitationId } from '../content/citations'
import {
  RED_FLAG_URGENCY,
  RESPIRATORY_RATE_BANDS,
  RESPIRATORY_RATE_CITATION,
  redFlagDetailKey,
  redFlagTitleKey,
  redFlagsByUrgency,
  type RedFlag,
  type RedFlagUrgency,
} from '../content/redFlags'
import { useRehabTranslation } from '../i18n'

/**
 * When to stop, and when to get medical care.
 *
 * The most important screen in the rehabilitation module and, by design, the
 * one that needs nothing from the database: no plan, no account, no seeded
 * data. It renders identically for every user, which is precisely what makes it
 * safe for software to author — nothing on it is personalised, so nothing on it
 * is a clinical decision the app has taken.
 *
 * Reachable in one tap from the rehabilitation home, and again from the top of
 * every technique screen.
 *
 * ## Three lists, three different instructions
 *
 * Emergency signs and worsening signs are not merged, because "go now" and
 * "follow your plan and call your practitioner" are different actions and a
 * single list would blur them. The two-week cough sits apart again: in a
 * TB-endemic setting it is a screening prompt, not an asthma sign, and stapling
 * it to a list of emergencies would either scare people or get it ignored.
 *
 * Each group leads with its instruction and then lists the signs, rather than
 * the other way round. During an attack a person reads the first line and acts.
 */
export function RedFlagsPage() {
  const { t } = useRehabTranslation()

  return (
    <RehabScreen title={t('rehab:safety.title')}>
      <PendingReviewNotice />

      <p className="text-lg text-on-surface">{t('rehab:safety.lead')}</p>

      <Banner tone="warning" title={t('rehab:safety.stopExercisesTitle')}>
        {t('rehab:safety.stopExercisesBody')}
      </Banner>

      <FlagGroup
        urgency={RED_FLAG_URGENCY.EMERGENCY}
        icon={DangerIcon}
        headingKey="rehab:safety.emergency.heading"
        descriptionKey="rehab:safety.emergency.description"
        actionKeys={['rehab:safety.emergency.action', 'rehab:safety.emergency.papppAction']}
        actionTone="danger"
        actionCitations={['PAPP_2021']}
      />

      <FlagGroup
        urgency={RED_FLAG_URGENCY.WORSENING}
        icon={WarningIcon}
        headingKey="rehab:safety.worsening.heading"
        descriptionKey="rehab:safety.worsening.description"
        actionKeys={[]}
        actionTone="warning"
        actionCitations={[]}
      />

      <RespiratoryRateReference />

      <FlagGroup
        urgency={RED_FLAG_URGENCY.NON_ACUTE}
        icon={InfoIcon}
        headingKey="rehab:safety.nonAcute.heading"
        descriptionKey="rehab:safety.nonAcute.description"
        actionKeys={[]}
        actionTone="info"
        actionCitations={[]}
      />

      <Section title={t('rehab:safety.appBoundary.heading')}>
        <Card>
          <p className="text-base text-on-surface">{t('rehab:safety.appBoundary.body')}</p>
          <p className="mt-2 text-base font-semibold text-on-surface">
            {t('rehab:safety.appBoundary.fallback')}
          </p>
        </Card>
      </Section>

      <DisclaimerBanner />
    </RehabScreen>
  )
}

interface FlagGroupProps {
  urgency: RedFlagUrgency
  icon: IconComponent
  headingKey: string
  descriptionKey: string
  /** The escalation sentences, shown above the signs. */
  actionKeys: readonly string[]
  actionTone: 'danger' | 'warning' | 'info'
  actionCitations: readonly CitationId[]
}

function FlagGroup({
  urgency,
  icon: Icon,
  headingKey,
  descriptionKey,
  actionKeys,
  actionTone,
  actionCitations,
}: FlagGroupProps) {
  const { t } = useRehabTranslation()
  const flags = redFlagsByUrgency(urgency)

  return (
    <Section title={t(headingKey)} description={t(descriptionKey)}>
      {actionKeys.length > 0 && (
        <Banner tone={actionTone}>
          {actionKeys.map((key) => (
            <p key={key} className="text-lg font-semibold first:mt-0 [&:not(:first-child)]:mt-2">
              {t(key)}
            </p>
          ))}
          {actionCitations.length > 0 && (
            <CitationList citations={actionCitations} heading={false} />
          )}
        </Banner>
      )}

      <ul className="flex flex-col gap-3">
        {flags.map((flag) => (
          <FlagCard key={flag.id} flag={flag} icon={Icon} />
        ))}
      </ul>
    </Section>
  )
}

/**
 * One sign.
 *
 * Icon plus a bold headline plus the explanation: the icon and the words carry
 * the urgency together, so the group is still distinguishable in greyscale and
 * to a screen reader.
 */
function FlagCard({ flag, icon: Icon }: { flag: RedFlag; icon: IconComponent }) {
  const { t } = useRehabTranslation()

  return (
    <Card as="li">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-6 shrink-0 text-on-surface" />
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-lg font-bold text-on-surface">
            {t(redFlagTitleKey(flag.id))}
          </h3>
          <p className="mt-1 text-base text-on-surface">{t(redFlagDetailKey(flag.id))}</p>
          {flag.requiresEquipment !== undefined && (
            <p className="mt-2 text-base font-semibold text-muted">
              {t(`rehab:safety.equipment.${flag.requiresEquipment}`)}
            </p>
          )}
          <CitationList citations={flag.citations} />
        </div>
      </div>
    </Card>
  )
}

/**
 * The breathing-rate reference table.
 *
 * Deliberately general information, and labelled as such twice: this is the
 * national template's reference table, not a threshold set for anyone. The plan
 * viewer never copies these numbers into a patient's plan — only a clinician
 * fills a patient's zone thresholds in.
 *
 * The guideline's two versions of these numbers disagree slightly because they
 * answer different questions. Rather than pick one silently, both are shown and
 * the difference is explained.
 */
function RespiratoryRateReference() {
  const { t } = useRehabTranslation()

  return (
    <Section title={t('rehab:safety.respiratoryRate.heading')}>
      <Card>
        <p className="text-base text-on-surface">{t('rehab:safety.respiratoryRate.howTo')}</p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-base">
            <caption className="pb-2 text-left text-base text-muted">
              {t('rehab:safety.respiratoryRate.tableCaption')}
            </caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-3 font-heading font-bold text-on-surface">
                  {t('rehab:safety.respiratoryRate.ageHeader')}
                </th>
                <th scope="col" className="py-2 font-heading font-bold text-on-surface">
                  {t('rehab:safety.respiratoryRate.rateHeader')}
                </th>
              </tr>
            </thead>
            <tbody>
              {RESPIRATORY_RATE_BANDS.map((band) => (
                <tr key={band} className="border-b border-border last:border-b-0">
                  <th
                    scope="row"
                    className="py-2 pr-3 text-left font-normal text-on-surface"
                  >
                    {t(`rehab:safety.respiratoryRate.band.${band}.age`)}
                  </th>
                  <td className="py-2 text-on-surface">
                    {t(`rehab:safety.respiratoryRate.band.${band}.rate`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-base font-semibold text-on-surface">
          {t('rehab:safety.respiratoryRate.notYourThreshold')}
        </p>
        <p className="mt-2 text-base text-muted">
          {t('rehab:safety.respiratoryRate.discrepancy')}
        </p>

        <CitationList citations={[RESPIRATORY_RATE_CITATION]} />
      </Card>
    </Section>
  )
}
