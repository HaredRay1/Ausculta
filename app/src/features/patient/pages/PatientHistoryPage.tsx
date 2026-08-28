import {
  Banner,
  Card,
  CheckCircleIcon,
  CloseIcon,
  DisclaimerBanner,
  QuestionIcon,
  Section,
  type IconComponent,
} from '../../../components'
import {
  FAMILY_HISTORY_CODES,
  RESPIRATORY_HISTORY_CODES,
  type FamilyHistoryCode,
  type RespiratoryHistoryCode,
} from '../../../db/codes'
import type { Patient } from '../../../db/types'
import { PatientScreen } from '../components/PatientScreen'
import type { PatientRepository } from '../data/patientRepository'
import { notesByCode, splitHistory } from '../data/history'
import { ageInYears, formatLongDate } from '../format'
import { usePatientTranslation } from '../i18n'

/**
 * Everything on record about this person, read-only.
 *
 * Read-only is the design, not a shortcut. A patient correcting their own
 * standing history on a shared clinic device would be an unauditable change to
 * a clinical record; the screen says who to ask instead.
 *
 * The one rule this screen exists to get right: a question that was never asked
 * is shown as never asked. See `data/history.ts`.
 */

const RESPIRATORY_ORDER = Object.values(RESPIRATORY_HISTORY_CODES) as RespiratoryHistoryCode[]
const FAMILY_ORDER = Object.values(FAMILY_HISTORY_CODES) as FamilyHistoryCode[]

export interface PatientHistoryPageProps {
  repository?: PatientRepository
}

export function PatientHistoryPage({ repository }: PatientHistoryPageProps) {
  const { t, i18n } = usePatientTranslation()
  const language = i18n.language

  return (
    <PatientScreen
      activeId="history"
      title={t('patient:history.title')}
      {...(repository !== undefined && { repository })}
    >
      {(overview) => {
        const patient = overview.patient as Patient
        const age = ageInYears(patient.birthDate)

        return (
          <>
            <Banner tone="info">{t('patient:history.readOnlyNote')}</Banner>

            <Section title={t('patient:history.profileHeading')}>
              <Card>
                <dl className="flex flex-col gap-3">
                  <Fact label={t('patient:history.name')} value={patient.name} />
                  <Fact label={t('patient:history.studyId')} value={patient.studyId} />
                  <Fact
                    label={t('patient:history.birthDate')}
                    value={formatLongDate(patient.birthDate, language)}
                  />
                  <Fact
                    label={t('patient:history.age')}
                    value={
                      age === null ? undefined : t('patient:history.ageValue', { count: age })
                    }
                  />
                  <Fact
                    label={t('patient:history.sex')}
                    value={t(`codes:sex.${patient.sex}`)}
                  />
                  <Fact label={t('patient:history.address')} value={patient.address} />
                  <Fact label={t('patient:history.contact')} value={patient.contact} />
                  <Fact
                    label={t('patient:history.language')}
                    value={patient.preferredLanguage}
                  />
                </dl>
              </Card>
            </Section>

            <Section title={t('patient:history.consentHeading')}>
              <Card>
                {patient.consent === null ? (
                  <p className="text-base text-on-surface">{t('patient:history.consentNone')}</p>
                ) : (
                  <dl className="flex flex-col gap-3">
                    <Fact
                      label={t('patient:history.consentStatus')}
                      value={t(`codes:consentStatus.${patient.consent.status}`)}
                    />
                    <Fact
                      label={t('patient:history.consentGivenOn', { date: '' })}
                      value={formatLongDate(patient.consent.presentedAt, language)}
                    />
                    <Fact
                      label={t('patient:history.consentLanguage', { language: '' })}
                      value={patient.consent.language}
                    />
                  </dl>
                )}
              </Card>
            </Section>

            <HistorySection
              title={t('patient:history.respiratoryHeading')}
              codes={RESPIRATORY_ORDER}
              entries={patient.respiratoryHistory}
              namespace="respiratoryHistory"
            />

            <HistorySection
              title={t('patient:history.familyHeading')}
              codes={FAMILY_ORDER}
              entries={patient.familyHistory}
              namespace="familyHistory"
            />

            <DisclaimerBanner />
          </>
        )
      }}
    </PatientScreen>
  )
}

function Fact({ label, value }: { label: string; value?: string }) {
  const { t } = usePatientTranslation()
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={value === undefined || value === '' ? 'text-base text-muted' : 'text-base text-on-surface'}>
        {value === undefined || value === '' ? t('patient:history.notRecorded') : value}
      </dd>
    </div>
  )
}

/**
 * One history section, in three labelled groups.
 *
 * The groups are separate lists with their own headings rather than one list
 * with per-row icons, so a reader skimming cannot land on a "not asked" row and
 * read it as an answer. The "not asked" group also carries a sentence saying
 * explicitly that it is not the same as no.
 */
function HistorySection<TCode extends string>({
  title,
  codes,
  entries,
  namespace,
}: {
  title: string
  codes: readonly TCode[]
  entries: readonly { code: TCode; present: boolean; notes?: string }[]
  namespace: 'respiratoryHistory' | 'familyHistory'
}) {
  const { t } = usePatientTranslation()
  const split = splitHistory(codes, entries)
  const notes = notesByCode(entries)

  return (
    <Section title={title}>
      <Card>
        {entries.length === 0 ? (
          <p className="text-base text-on-surface">{t('patient:history.noneRecorded')}</p>
        ) : null}

        <AnswerGroup
          heading={t('patient:history.yesHeading')}
          icon={CheckCircleIcon}
          codes={split.yes}
          namespace={namespace}
          notes={notes}
        />
        <AnswerGroup
          heading={t('patient:history.noHeading')}
          icon={CloseIcon}
          codes={split.no}
          namespace={namespace}
          notes={notes}
        />
        <AnswerGroup
          heading={t('patient:history.notAskedHeading')}
          icon={QuestionIcon}
          codes={split.notAsked}
          namespace={namespace}
          notes={notes}
          note={t('patient:history.notAskedNote')}
        />
      </Card>
    </Section>
  )
}

function AnswerGroup<TCode extends string>({
  heading,
  icon: Icon,
  codes,
  namespace,
  notes,
  note,
}: {
  heading: string
  icon: IconComponent
  codes: readonly TCode[]
  namespace: string
  notes: Record<string, string>
  note?: string
}) {
  const { t } = usePatientTranslation()
  if (codes.length === 0) return null

  return (
    <section aria-label={heading} className="mt-4 first:mt-0">
      <h3 className="flex items-center gap-2 font-heading text-base font-bold text-on-surface">
        <Icon className="size-5 shrink-0 text-muted" />
        {heading}
      </h3>
      {note !== undefined && <p className="mt-1 text-sm text-muted">{note}</p>}
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-6 text-base text-on-surface">
        {codes.map((code) => (
          <li key={code}>
            {t(`codes:${namespace}.${code}`)}
            {notes[code] !== undefined && (
              <span className="block text-sm text-muted">{notes[code]}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
