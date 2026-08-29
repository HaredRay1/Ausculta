import { useId, type ChangeEvent } from 'react'
import { Banner, Card, Section, Spinner } from '../../../components'
import type { LocationCode } from '../../../db/codes'
import { lungPositionNumber } from '../guides'
import { useAssessmentTranslation } from '../i18n'

/**
 * Step 5 — import the WAV the device wrote to its memory card.
 *
 * The file picker is a real `<input type="file">` with a visible label rather
 * than a styled button wrapping a hidden input: on Android the native picker is
 * the part people already know how to use, and the visible label is what makes
 * the control findable at all.
 *
 * Every failure here names the specific problem — "that file is not 16-bit
 * audio" rather than "invalid file" — because the health worker has to decide
 * whether to copy the file again, choose another, or go back to the patient.
 */
export interface CaptureStepProps {
  locationCode: LocationCode
  fileName: string | null
  busy: boolean
  importErrorKey: string | null
  onChooseFile: (file: File) => void
}

export function CaptureStep({
  locationCode,
  fileName,
  busy,
  importErrorKey,
  onChooseFile,
}: CaptureStepProps) {
  const { t } = useAssessmentTranslation()
  const inputId = useId()

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file !== undefined) onChooseFile(file)
  }

  return (
    <Section
      title={t('capture.title')}
      description={t('capture.subtitle', { number: lungPositionNumber(locationCode) })}
    >
      {importErrorKey !== null && (
        <Banner tone="danger" title={t('capture.errorTitle')}>
          {t(importErrorKey)}
        </Banner>
      )}

      <Card>
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-base font-semibold text-on-surface">
            {t('capture.fileLabel')}
          </label>
          <input
            id={inputId}
            type="file"
            accept="audio/wav,audio/x-wav,.wav"
            onChange={onChange}
            disabled={busy}
            className="min-h-12 w-full rounded-control border-2 border-border-strong bg-card px-3 py-2 text-base text-on-surface"
          />
          <p className="text-sm text-muted">{t('capture.hint')}</p>
          {fileName !== null && importErrorKey === null && (
            <p className="text-sm font-medium text-on-surface">
              {t('capture.selected', { name: fileName })}
            </p>
          )}
        </div>
      </Card>

      {busy && <Spinner label={t('capture.checking')} />}
    </Section>
  )
}
