import { useEffect, useState } from 'react'
import { Banner } from '../../../components'
import { patientRepository as defaultRepository, type PatientRepository } from '../data/patientRepository'
import { formatDuration } from '../format'
import { usePatientTranslation } from '../i18n'

export interface RecordingAudioProps {
  audioBlobId: string
  /** Already-translated place name, e.g. "Right upper lung". */
  locationLabel: string
  durationSec: number
  repository?: PatientRepository
}

/**
 * Listening to one recording.
 *
 * A native `<audio controls>` rather than a custom transport. The controls are
 * the platform's own, so they are already the right size, already keyboard
 * reachable, already localised, and already familiar to someone who has used
 * any other app on the phone — which matters more here than visual consistency,
 * because validators navigate this unaided and a hand-rolled play button is one
 * more thing to learn.
 *
 * The blob URL is revoked on unmount and whenever the recording changes.
 * A patient scrolling a visit with six recordings would otherwise leak six
 * object URLs per visit for the lifetime of the tab.
 */
export function RecordingAudio({
  audioBlobId,
  locationLabel,
  durationSec,
  repository = defaultRepository,
}: RecordingAudioProps) {
  const { t } = usePatientTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    let cancelled = false
    let created: string | null = null
    setState('loading')
    setUrl(null)

    repository
      .readAudio(audioBlobId)
      .then((blob) => {
        if (cancelled) return
        if (blob === null) {
          setState('missing')
          return
        }
        created = URL.createObjectURL(blob)
        setUrl(created)
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('missing')
      })

    return () => {
      cancelled = true
      if (created !== null) URL.revokeObjectURL(created)
    }
  }, [audioBlobId, repository])

  if (state === 'missing') {
    return <Banner tone="info">{t('patient:recordings.noAudio')}</Banner>
  }

  if (state === 'loading' || url === null) {
    return (
      <p className="text-base text-muted" aria-busy="true">
        {t('patient:recordings.loading')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a lung sound has no speech to caption. */}
      <audio
        controls
        preload="none"
        src={url}
        aria-label={t('patient:recordings.playerLabel', { location: locationLabel })}
        className="w-full"
      />
      <p className="text-sm text-muted">{formatDuration(durationSec)}</p>
    </div>
  )
}
