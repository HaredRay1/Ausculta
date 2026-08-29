import { Card, Section } from '../../../components'
import type { MonitoringPlanDetails } from '../../monitoring/repository'
import { formatLongDate } from '../format'
import { usePatientTranslation } from '../i18n'
import { useExampleCopy } from './ExampleCopy'

/**
 * What the practitioner has asked for, read-only, for the patient.
 *
 * The monitoring loop assumes the patient knows the plan — how often, where,
 * until when. Until now it existed only on the clinician screens, so a patient
 * had no way to find out what was expected of them, which makes a plan that
 * will not be followed.
 *
 * Read-only and approved-only. A draft is the practitioner's working copy; a
 * patient shown one would reasonably start following instructions nobody has
 * agreed to. The repository only ever hands over an ACTIVE plan, so that
 * choice lives in one place rather than being re-checked here.
 *
 * It lives on the rehab tab rather than a nav tab of its own, because "what my
 * practitioner has asked of me" and "the exercises they gave me" are one story
 * to a patient, and the bottom nav is already at its five-item ceiling.
 */
export function MonitoringPlanCard({
  plan,
  language,
}: {
  plan: MonitoringPlanDetails
  language: string
}) {
  const { t } = usePatientTranslation()
  const exampleCopy = useExampleCopy()

  return (
    <Section title={t('patient:rehab.plan.heading', exampleCopy)}>
      <Card>
        <p className="text-base text-on-surface">{t('patient:rehab.plan.intro', exampleCopy)}</p>

        <dl className="mt-4 flex flex-col gap-3">
          <Row label={t('patient:rehab.plan.howOften')} value={frequencyPhrase(plan.intervalDays, t)} />
          <Row
            label={t('patient:rehab.plan.where')}
            value={t('patient:rehab.plan.wherePlural', { count: plan.locationCodes.length })}
          />
          <Row
            label={t('patient:rehab.plan.from')}
            value={formatLongDate(plan.startDate, language)}
          />
          <Row
            label={t('patient:rehab.plan.until')}
            value={
              plan.endDate === undefined
                ? t('patient:rehab.plan.openEnded')
                : formatLongDate(plan.endDate, language)
            }
          />
        </dl>

        {/* The places, by name. A patient reading "R_UPPER" learns nothing. */}
        <ul className="mt-3 flex flex-wrap gap-2">
          {plan.locationCodes.map((code) => (
            <li
              key={code}
              className="rounded-pill bg-nested px-3 py-1 text-sm text-on-surface"
            >
              {t(`codes:location.${code}`)}
            </li>
          ))}
        </ul>

        {plan.followUpNote !== undefined && plan.followUpNote !== '' && (
          <div className="mt-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
              {t('patient:rehab.plan.note')}
            </h3>
            <p className="mt-1 text-base text-on-surface">{plan.followUpNote}</p>
          </div>
        )}

        <p className="mt-4 text-sm text-muted">{t('patient:rehab.plan.whoToAsk', exampleCopy)}</p>
      </Card>
    </Section>
  )
}

/**
 * "Every two weeks" rather than "every 14 days".
 *
 * Whole weeks are how people actually talk about a repeating appointment, so
 * they are said that way; anything else stays in days rather than being forced
 * into an awkward fraction of a week.
 */
function frequencyPhrase(
  intervalDays: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (intervalDays % 7 === 0 && intervalDays >= 7) {
    return t('patient:rehab.plan.everyNWeeks', { count: intervalDays / 7 })
  }
  return t('patient:rehab.plan.everyNDays', { count: intervalDays })
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-base text-on-surface">{value}</dd>
    </div>
  )
}
