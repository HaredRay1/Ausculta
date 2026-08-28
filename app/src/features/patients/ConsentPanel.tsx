import { useState } from 'react'
import { Banner, Button, Card, RadioGroup, Section } from '../../components'
import type { ConsentStatus } from '../../db/codes'
import {
  DRAFT_EN_CONSENT_VERSION,
  getConsentDocument,
  isConsentDocumentApproved,
  outstandingEthicsReviewItems,
} from './consent'
import { usePatientsTranslation } from './i18n'

export interface ConsentPanelProps {
  value: ConsentStatus | ''
  onChange: (status: ConsentStatus) => void
  statuses: readonly ConsentStatus[]
  /** Which document to present. Defaults to the current English draft. */
  documentVersion?: string
}

/**
 * Presents the consent document and records what the patient said.
 *
 * The unapproved-draft warning is not dismissible on purpose. While the text
 * is a draft it must be impossible to take consent from a real participant
 * without having seen that fact on screen.
 */
export function ConsentPanel({
  value,
  onChange,
  statuses,
  documentVersion = DRAFT_EN_CONSENT_VERSION,
}: ConsentPanelProps) {
  const { t } = usePatientsTranslation()
  const [showOutstanding, setShowOutstanding] = useState(false)

  const document = getConsentDocument(documentVersion)
  const approved = isConsentDocumentApproved(documentVersion)
  const outstanding = outstandingEthicsReviewItems(documentVersion)

  if (document === undefined) {
    return (
      <Section title={t('consent.title')}>
        <Banner tone="danger">{t('error.CONSENT_DOCUMENT_UNKNOWN')}</Banner>
      </Section>
    )
  }

  return (
    <Section title={t('consent.title')}>
      {!approved && (
        <Banner tone="warning" title={t('consent.draftWarningTitle')}>
          {t('consent.draftWarningBody')}
        </Banner>
      )}

      <Banner tone="info" className="mt-3">
        {t('consent.languageNotice')}
      </Banner>

      <Card className="mt-3">
        <p className="text-sm font-medium text-muted">{t('consent.readAloud')}</p>

        <h3 className="mt-3 text-lg font-semibold text-on-surface">{document.title}</h3>

        <div className="mt-3 flex flex-col gap-4">
          {document.sections.map((section) => (
            <div key={section.heading}>
              <h4 className="text-base font-semibold text-on-surface">{section.heading}</h4>
              <p className="mt-1 text-base leading-relaxed text-muted">
                {section.body}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-muted">
          {t('consent.version', { version: document.version })}
        </p>
      </Card>

      {outstanding.length > 0 && (
        <div className="mt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowOutstanding((open) => !open)}
            aria-expanded={showOutstanding}
          >
            {t('consent.outstandingTitle')}
          </Button>
          {showOutstanding && (
            <Card className="mt-2">
              <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted">
                {outstanding.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="mt-4">
        <RadioGroup
          label={t('consent.statusLabel')}
          hint={t('consent.statusHint')}
          value={value}
          onChange={(next) => onChange(next as ConsentStatus)}
          options={statuses.map((code) => ({
            value: code,
            label: t(`codes:consentStatus.${code}`),
          }))}
        />
      </div>
    </Section>
  )
}
