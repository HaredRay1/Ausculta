import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppBar, Button, EmptyState, Page, Spinner, verdictTitleKey } from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { LOCATION_CODES, type LocationCode } from '../../db/codes'
import type { Measurement, SymptomEntry } from '../../db/types'
import { ageInYears } from '../patients/validation'
import { aiFindingFor } from './aiFinding'
import { useReviewTranslation } from './i18n'
import {
  createReviewRepository,
  type Actor,
  type ClinicalCase,
  type ReviewRepository,
} from './repository'

/**
 * The printable referral summary.
 *
 * These clinics refer to hospitals on paper, so this sheet leaves the building
 * and is read by someone with no access to the app and no context beyond what
 * is on it. That drives every decision here:
 *
 * - Three sections, numbered and ruled: what the patient said, what the
 *   software produced, what the practitioner concluded. Numbering them "1 of 3"
 *   is not decoration — a receiving clinician who is handed page two alone
 *   needs to know which voice they are reading, and on a mono printer the
 *   colour that separates them on screen is gone.
 * - The automatic section names the software as its author on the page itself.
 *   A printed number with no attribution becomes, by the time it reaches a
 *   ward, "the machine said". The disclaimer at the foot says the same thing
 *   again, because footers get read when headers get skimmed.
 * - Nothing is invented to fill a gap. A location the model did not decide says
 *   so; an unreviewed assessment prints "not yet reviewed" rather than an empty
 *   heading that reads as a clean result.
 */

type LoadState = 'loading' | 'found' | 'missing'

const ALL_LOCATIONS = Object.values(LOCATION_CODES) as LocationCode[]

export interface ReportPageProps {
  /** Injected in tests so the screen can run against an isolated database. */
  repository?: ReviewRepository
}

/** A ruled, numbered block. The rule and the number survive a mono printer. */
function ReportSection({
  number,
  title,
  note,
  children,
}: {
  number: number
  title: string
  note?: string
  children: ReactNode
}) {
  const { t } = useReviewTranslation()
  return (
    <section className="print-keep-together flex flex-col gap-2 border-t-2 border-on-surface pt-3">
      <header className="flex flex-col gap-0.5">
        <span className="text-xs font-bold uppercase tracking-widest text-muted">
          {t('review:report.sectionOf', { number })}
        </span>
        <h2 className="font-heading text-lg font-bold text-on-surface">{title}</h2>
        {note !== undefined && <p className="text-sm text-muted">{note}</p>}
      </header>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 font-semibold text-on-surface">{label}:</span>
      <span className="text-on-surface">{value}</span>
    </div>
  )
}

export function ReportPage({ repository }: ReportPageProps = {}) {
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
        <div className="flex items-center gap-3 py-10" aria-busy="true">
          <Spinner />
          <p className="text-base text-muted">{t('review:case.title')}</p>
        </div>
      </Page>
    )
  }

  if (state === 'missing' || clinicalCase === null) {
    return (
      <>
        <AppBar title={t('review:report.title')} onBack={() => navigate('/review')} />
        <Page>
          <EmptyState
            title={t('review:case.notFound')}
            body={t('review:case.notFoundHint')}
            action={
              <Button fullWidth onClick={() => navigate('/review')}>
                {t('review:case.backToQueue')}
              </Button>
            }
          />
        </Page>
      </>
    )
  }

  const { assessment, patient, locations, reviews } = clinicalCase
  const overall = reviews.find((review) => review.recordingId === undefined)
  const perLocation = reviews.filter((review) => review.recordingId !== undefined)
  // Age as at the assessment, not as at printing: a sheet read weeks later
  // must describe the patient as they were when the recording was taken.
  const age = ageInYears(patient.birthDate, new Date(assessment.date))

  const findings = locations.map((location) => ({
    location,
    finding: aiFindingFor(location.recording),
  }))

  const modelVersion =
    findings.find((entry) => entry.finding.modelVersion !== undefined)?.finding.modelVersion ??
    assessment.aiSeverity.modelVersion ??
    null

  const presentSymptoms = assessment.symptoms.filter((symptom: SymptomEntry) => symptom.present)
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString()

  return (
    <>
      <div className="no-print">
        <AppBar
          title={t('review:report.title')}
          onBack={() => navigate(`/review/${assessment.id}`)}
          action={
            <Button size="sm" onClick={() => window.print()}>
              {t('review:report.print')}
            </Button>
          }
        />
      </div>

      <Page>
        <p className="no-print text-sm text-muted">{t('review:report.printHint')}</p>

        <article className="flex flex-col gap-4 text-on-surface">
          <header className="print-keep-together flex flex-col gap-2 border-b-2 border-on-surface pb-3">
            <h1 className="font-heading text-xl font-bold">{t('review:report.title')}</h1>
            <div className="flex flex-col gap-0.5">
              <Field label={t('review:report.patientLabel')} value={patient.name} />
              <Field label={t('review:report.studyId')} value={patient.studyId} />
              <Field
                label={t('review:report.birthDate')}
                value={
                  age === null
                    ? t('review:case.ageUnknown')
                    : `${formatDate(patient.birthDate)} (${t('review:case.age', { count: age })})`
                }
              />
              <Field label={t('review:report.sex')} value={t(`codes:sex.${patient.sex}`)} />
              <Field
                label={t('review:report.assessedOn')}
                value={formatDate(assessment.date)}
              />
              <Field
                label={t('review:report.locationsRecorded')}
                value={t('review:report.locationsCount', {
                  count: locations.length,
                  total: ALL_LOCATIONS.length,
                })}
              />
            </div>
          </header>

          <ReportSection number={1} title={t('review:report.patientReported')}>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold uppercase tracking-wide">
                {t('review:case.symptoms')}
              </h3>
              {presentSymptoms.length === 0 ? (
                <p className="text-sm">{t('review:report.noSymptoms')}</p>
              ) : (
                <ul className="list-inside list-disc text-sm">
                  {presentSymptoms.map((symptom) => (
                    <li key={symptom.code}>{t(`codes:symptom.${symptom.code}`)}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold uppercase tracking-wide">
                {t('review:case.vitals')}
              </h3>
              {assessment.vitals.length === 0 ? (
                <p className="text-sm">{t('review:report.noVitals')}</p>
              ) : (
                <ul className="list-inside list-disc text-sm">
                  {assessment.vitals.map((vital: Measurement) => (
                    <li key={`${vital.code}-${vital.enteredAt}`}>
                      {t(`codes:measurement.${vital.code}`)}: {vital.value} {vital.unit}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ReportSection>

          <ReportSection
            number={2}
            title={t('review:label.ai')}
            note={t('review:label.aiNote')}
          >
            <ul className="flex flex-col gap-1.5 text-sm">
              {findings.map(({ location, finding }) => (
                <li key={finding.recordingId} className="flex flex-col">
                  <span className="font-semibold">
                    {t(`codes:location.${location.locationCode}`)}
                  </span>
                  {/*
                    When the model decided nothing there is no confidence to
                    discuss, so the line says that and stops. Appending "no
                    confidence value" to "no result" reads as two separate
                    failures rather than one absence.
                  */}
                  {finding.verdict === null ? (
                    <span>{t('review:report.nothingDecided')}</span>
                  ) : (
                    <span>
                      {[
                        /*
                         * The model's verdict, in the design system's own
                         * wording — the same words the ResultCard shows on
                         * screen, so a printed referral and the screen it came
                         * from cannot say different things.
                         *
                         * An earlier version looked `finding.state` up in
                         * `review:outcome.*`, which is keyed by
                         * INTERPRETATION_CODES: what a PRACTITIONER decided,
                         * not what the MODEL said. Two of the four states fell
                         * through to a fallback and `uncertain` — which exists
                         * in both vocabularies with different meanings —
                         * silently resolved to the practitioner's wording.
                         */
                        t(`design:${verdictTitleKey(finding.verdict)}`),
                        finding.classificationCode === undefined
                          ? null
                          : t(`codes:classification.${finding.classificationCode}`),
                        finding.confidencePercent === undefined
                          ? t('review:report.noConfidence')
                          : t('review:report.confidence', {
                              percent: finding.confidencePercent,
                            }),
                      ]
                        .filter((part) => part !== null)
                        .join(' — ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Field
              label={t('review:report.modelVersion')}
              value={modelVersion ?? t('review:report.modelUnknown')}
            />
          </ReportSection>

          <ReportSection
            number={3}
            title={t('review:label.practitioner')}
            note={t('review:label.practitionerNote')}
          >
            {overall === undefined ? (
              // An empty heading under "practitioner's conclusion" would read on
              // paper as a clinician having looked and found nothing wrong.
              <p className="text-sm font-semibold">{t('review:report.notReviewedYet')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <Field
                  label={t('review:report.overallConclusion')}
                  value={t(`codes:interpretation.${overall.interpretationCode}`)}
                />
                <Field
                  label={t('review:report.reviewedOn')}
                  value={formatDate(overall.reviewedAt)}
                />
                <p className="text-sm">
                  {overall.notes.trim() === '' ? t('review:report.noNotes') : overall.notes}
                </p>

                {perLocation.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-bold uppercase tracking-wide">
                      {t('review:report.perLocation')}
                    </h3>
                    <ul className="flex flex-col gap-1 text-sm">
                      {perLocation.map((review) => {
                        const match = locations.find(
                          (location) => location.recording.id === review.recordingId,
                        )
                        return (
                          <li key={review.id}>
                            <span className="font-semibold">
                              {match === undefined
                                ? review.recordingId
                                : t(`codes:location.${match.locationCode}`)}
                              :{' '}
                            </span>
                            {t(`codes:interpretation.${review.interpretationCode}`)}
                            {review.notes.trim() === '' ? '' : ` — ${review.notes}`}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="print-only mt-6 border-t border-on-surface pt-1 text-sm">
              {t('review:report.signature')}
            </div>
          </ReportSection>

          <footer className="print-keep-together border-t-2 border-on-surface pt-3 text-xs">
            <p className="font-semibold">{t('review:report.disclaimer')}</p>
            <p className="mt-1">
              {t('review:report.generatedOn', { date: new Date().toLocaleString() })}
            </p>
          </footer>
        </article>
      </Page>
    </>
  )
}
