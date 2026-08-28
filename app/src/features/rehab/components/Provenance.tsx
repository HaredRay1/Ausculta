import { Banner } from '../../../components'
import {
  CITATIONS,
  citationLabelKey,
  citationNoteKey,
  citationSourceKey,
  type CitationId,
} from '../content/citations'
import { REHAB_CLINICIAN_REVIEWED, REHAB_CONTENT_VERSION, useRehabTranslation } from '../i18n'

/**
 * Provenance furniture: where a statement came from, and whether a clinician
 * has signed it off.
 *
 * A pulmonologist scores clinical relevance, clinical appropriateness and
 * patient safety directly during validation. Every clinical statement in this
 * feature therefore shows its source on the screen it appears on, not in a
 * footnote and not in the repository. Confidence is shown as a sentence, never
 * as a colour or a bare tag — the reader has to be able to tell "read directly
 * from the guideline" from "circulates widely, unconfirmed" without decoding
 * anything.
 */

/**
 * The banner that says a human clinician has not checked this yet.
 *
 * Rendered on every screen in the feature while `REHAB_CLINICIAN_REVIEWED` is
 * false. `info` rather than `warning`: the prototype disclaimer already carries
 * the warning tone, and two competing warnings on one screen teaches people to
 * ignore both.
 */
export function PendingReviewNotice() {
  const { t } = useRehabTranslation()

  if (REHAB_CLINICIAN_REVIEWED) return null

  return (
    <Banner tone="info" title={t('rehab:review.pendingTitle')}>
      <p>{t('rehab:review.pendingBody')}</p>
      <p className="mt-1 text-sm">
        {t('rehab:review.contentVersion', { version: REHAB_CONTENT_VERSION })}
      </p>
    </Banner>
  )
}

export interface CitationListProps {
  citations: readonly CitationId[]
  /** Omit the "Where this comes from" heading when the caller supplies one. */
  heading?: boolean
}

/**
 * The sources behind a block of content.
 *
 * A `<ul>` of full references with the confidence sentence attached to each,
 * plus a verification note where the research synthesis recorded a claim
 * without a checkable reference. Links open the source document where one has a
 * stable public URL; several do not, so the reference stands alone as text.
 */
export function CitationList({ citations, heading = true }: CitationListProps) {
  const { t } = useRehabTranslation()

  if (citations.length === 0) return null

  return (
    <div className="mt-3 border-t border-border pt-3">
      {heading && (
        <h4 className="font-heading text-base font-bold text-on-surface">
          {t('rehab:provenance.sourceHeading')}
        </h4>
      )}
      <ul className="mt-1 flex flex-col gap-2">
        {citations.map((id) => (
          <CitationEntry key={id} id={id} />
        ))}
      </ul>
    </div>
  )
}

function CitationEntry({ id }: { id: CitationId }) {
  const { t } = useRehabTranslation()
  const citation = CITATIONS[id]
  const note = t(citationNoteKey(id), { defaultValue: '' })

  return (
    <li className="text-sm text-muted">
      <span className="font-semibold text-on-surface">{t(citationLabelKey(id))}</span>
      <span className="mt-0.5 block">{t(citationSourceKey(id))}</span>
      <span className="mt-0.5 block">
        {t('rehab:provenance.confidenceLabel')}: {t(`rehab:provenance.confidence.${citation.confidence}`)}
      </span>
      {note !== '' && <span className="mt-0.5 block font-semibold">{note}</span>}
      {citation.needsVerification === true && (
        <span className="mt-0.5 block">{t('rehab:provenance.verifyNote')}</span>
      )}
      {citation.url !== undefined && (
        <a
          href={citation.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex min-h-12 items-center text-primary underline"
        >
          {citation.url}
        </a>
      )}
    </li>
  )
}
