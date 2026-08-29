import type { ReactNode } from 'react'
import { Card, ChipIcon, PeopleIcon, QuestionIcon } from '../../../components'
import { REVIEW_STATUSES, type ReviewStatus } from '../../../db/codes'
import type { Assessment } from '../../../db/types'
import { formatLongDate } from '../format'
import { usePatientTranslation } from '../i18n'
import type { StaffDisplay } from '../data/patientRepository'
import { useExampleCopy } from './ExampleCopy'

/**
 * Who said this: the app, or a person.
 *
 * The hard project rule these two components exist to enforce is that **an AI
 * output is never presentable as a clinician's opinion.** A pulmonologist scores
 * exactly this, and the failure mode is not malice — it is a screen where the
 * model's guess and the doctor's note sit in two adjacent grey boxes and a
 * frightened reader takes both as medical advice.
 *
 * So the two are separated four ways, none of which is colour:
 *
 * 1. Different headings in plain words — "What the app heard" against "What the
 *    doctor said".
 * 2. A named source line inside each block, present whether or not the reader
 *    scrolled past the heading.
 * 3. A caveat sentence in each, stating what the block is and is not.
 * 4. Different landmark names, so a screen reader announces the difference on
 *    entering the region and never has to rely on the visual grouping.
 *
 * A colour-blind reader, a greyscale screenshot and a screen reader all still
 * get the distinction. That is the requirement.
 */

interface AttributionBlockProps {
  children: ReactNode
}

/** Everything the app worked out on its own. */
export function AiAttribution({ children }: AttributionBlockProps) {
  const { t } = usePatientTranslation()

  return (
    <Card as="section" aria-label={t('patient:review.aiLabel')} padding="md">
      <div className="flex items-start gap-3">
        <ChipIcon className="mt-0.5 size-6 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-bold text-on-surface">
            {t('patient:review.aiHeading')}
          </h2>
          <p className="mt-0.5 text-sm font-semibold text-muted">{t('patient:review.aiLabel')}</p>
        </div>
      </div>

      <p className="mt-3 rounded-control border border-border-strong bg-surface-sunken p-3 text-base text-on-surface">
        {t('patient:review.aiCaveat')}
      </p>

      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </Card>
  )
}

export interface PractitionerAttributionProps {
  assessment: Assessment
  /** Resolved display name for the reviewing practitioner, when known. */
  reviewer?: StaffDisplay
  language: string
}

/**
 * What a person actually said, or an explicit statement that nobody has.
 *
 * The "nobody has" branch is the important one. An absent review rendered as
 * absent whitespace lets the AI block above it become, by default, the only
 * opinion on the screen — so the absence is stated in words instead.
 */
export function PractitionerAttribution({
  assessment,
  reviewer,
  language,
}: PractitionerAttributionProps) {
  const { t } = usePatientTranslation()
  const exampleCopy = useExampleCopy()
  const severity = assessment.practitionerSeverity
  const reviewed =
    severity !== undefined &&
    assessment.reviewStatus !== REVIEW_STATUSES.DRAFT &&
    assessment.reviewStatus !== REVIEW_STATUSES.PENDING_REVIEW

  if (!reviewed) {
    return (
      <Card as="section" aria-label={t('patient:review.pending.title')} padding="md">
        <div className="flex items-start gap-3">
          <QuestionIcon className="mt-0.5 size-6 shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold text-on-surface">
              {t('patient:review.pending.title')}
            </h2>
            <p className="mt-1 text-base text-on-surface">{t('patient:review.pending.body')}</p>
            <p className="mt-2 text-base text-muted">
              {t(`patient:review.statusBody.${assessment.reviewStatus}`)}
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card as="section" aria-label={t('patient:review.practitionerLabel')} padding="md">
      <div className="flex items-start gap-3">
        <PeopleIcon className="mt-0.5 size-6 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-bold text-on-surface">
            {t('patient:review.practitionerHeading')}
          </h2>
          <p className="mt-0.5 text-sm font-semibold text-muted">
            {t('patient:review.practitionerLabel')}
          </p>
        </div>
      </div>

      <p className="mt-3 rounded-control border border-border-strong bg-surface-sunken p-3 text-base text-on-surface">
        {t('patient:review.practitionerCaveat', exampleCopy)}
      </p>

      <dl className="mt-4 flex flex-col gap-2 text-base">
        {reviewer !== undefined && (
          <div>
            <dt className="text-sm text-muted">{t('patient:review.practitionerLabel')}</dt>
            <dd className="font-semibold text-on-surface">
              {t('patient:review.reviewedBy', { name: reviewer.name })}
              {reviewer.designation !== undefined && (
                <span className="ml-1 font-normal text-muted">({reviewer.designation})</span>
              )}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-sm text-muted">{t('patient:review.status.label')}</dt>
          <dd className="font-semibold text-on-surface">
            {t(`patient:review.status.${assessment.reviewStatus}`)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{t('patient:review.reviewedOn', { date: '' })}</dt>
          <dd className="text-on-surface">{formatLongDate(severity.reviewedAt, language)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-base text-on-surface">
        {t('patient:review.interpretation', {
          interpretation: t(`codes:interpretation.${severity.interpretation}`),
        })}
      </p>

      {severity.notes.trim() !== '' && (
        <div className="mt-3">
          <h3 className="font-heading text-base font-bold text-on-surface">
            {t('patient:review.notesHeading')}
          </h3>
          <blockquote className="mt-1 border-l-4 border-primary pl-3 text-base text-on-surface">
            {severity.notes}
          </blockquote>
        </div>
      )}
    </Card>
  )
}

/**
 * The review state as one line, for a list row.
 *
 * Always a word, never a dot: "has a person checked this?" is the single most
 * important thing about a result row and it must survive greyscale.
 */
export function ReviewStatusLine({ status }: { status: ReviewStatus }) {
  const { t } = usePatientTranslation()
  const byPerson = status === REVIEW_STATUSES.APPROVED || status === REVIEW_STATUSES.DISAPPROVED

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted">
      {byPerson ? (
        <PeopleIcon className="size-4 shrink-0" />
      ) : (
        <ChipIcon className="size-4 shrink-0" />
      )}
      {t(`patient:review.status.${status}`)}
    </span>
  )
}
