import { useEffect, useState } from 'react'
import { useAssessmentTranslation } from '../i18n'

/**
 * Plays back the recording that was just analysed.
 *
 * A clinician reading a result has to be able to hear what the model heard —
 * it is the only way to sanity-check a machine opinion about a patient's
 * chest. The object URL is revoked when the screen goes away; without that,
 * six positions in a row would pin six decoded WAVs in memory on a cheap
 * phone.
 */
export interface RecordingPlayerProps {
  blob: Blob | null
}

export function RecordingPlayer({ blob }: RecordingPlayerProps) {
  const { t } = useAssessmentTranslation()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (blob === null || typeof URL.createObjectURL !== 'function') {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (url === null) {
    return <p className="text-sm text-muted">{t('result.audioUnsupported')}</p>
  }

  return (
    <audio controls src={url} className="w-full" aria-label={t('result.audioHeading')}>
      {t('result.audioUnsupported')}
    </audio>
  )
}
