import { useCallback, useEffect, useRef, useState } from 'react'
import { useDesignTranslation } from '../../design/i18n'
import { DangerIcon, MicIcon } from '../icons'

export interface AudioPlayerProps {
  /**
   * The recording itself.
   *
   * A Blob rather than an object-URL string on purpose: six players on a review
   * screen means six URLs to create and revoke, and a leaked object URL pins
   * the whole decoded buffer in memory on a cheap Android phone. The lifecycle
   * lives in here, once, instead of in six call sites.
   */
  blob: Blob
  /** Names this player — in practice the lung location. Required. */
  label: string
  /** Known duration, used until the browser reports its own. */
  durationSec?: number
  /** Called once when the recording cannot be played, for any reason. */
  onError?: () => void
}

/**
 * Every mounted player's pause function.
 *
 * Starting one stops the others: six recordings audible at once on a phone
 * speaker is not a review, it is noise. Module-level rather than context so a
 * screen does not have to wrap anything to get the behaviour.
 */
const mountedPlayers = new Set<() => void>()

/** Seconds to `m:ss`. Recordings are short; hours would be false precision. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * Plays one recording.
 *
 * The recording is the clinical evidence on a review screen — it is what a
 * practitioner listens to before agreeing or disagreeing with the model. Two
 * consequences shape this component:
 *
 * 1. Failure is loud. A player that silently does nothing leads a reviewer to
 *    conclude "there is nothing to hear" when in fact the file did not load —
 *    a wrong clinical conclusion caused by a UI failure, which is the worst
 *    outcome available here. A blob that will not decode replaces the whole
 *    control with a stated error carrying an icon and words, never a greyed-out
 *    button that looks merely idle.
 *
 * 2. It is usable one-handed at a bedside. A 48px play control, a seek slider
 *    with a thumb big enough to hit without aiming, and both times always
 *    visible as text rather than inferred from a bar position.
 */
export function AudioPlayer({ blob, label, durationSec, onError }: AudioPlayerProps) {
  const { t } = useDesignTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(durationSec ?? 0)
  const [failed, setFailed] = useState(false)

  /**
   * Held in a ref so `fail` stays stable.
   *
   * If `fail` changed identity whenever a caller passed a fresh inline
   * `onError`, the effect below would tear down and rebuild the object URL on
   * every render — the exact leak this component exists to prevent.
   */
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const fail = useCallback(() => {
    setFailed(true)
    setPlaying(false)
    onErrorRef.current?.()
  }, [])

  /**
   * One object URL per blob, revoked on unmount and whenever the blob changes.
   *
   * Guarded because this value comes out of a database this component does not
   * control, and `createObjectURL` throws a TypeError on anything that is not a
   * Blob. Thrown from a passive effect that becomes an uncaught exception which
   * unmounts the whole screen — so a practitioner opening a case would get a
   * blank page with nothing saying why. A bad value belongs in the same stated
   * error state as a blob that will not decode.
   */
  useEffect(() => {
    let objectUrl: string
    try {
      if (!(blob instanceof Blob)) throw new TypeError('not a Blob')
      objectUrl = URL.createObjectURL(blob)
    } catch {
      fail()
      return
    }
    setUrl(objectUrl)
    setFailed(false)
    setCurrentTime(0)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob, fail])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setPlaying(false)
  }, [])

  useEffect(() => {
    mountedPlayers.add(pause)
    return () => {
      mountedPlayers.delete(pause)
    }
  }, [pause])

  async function toggle() {
    const audio = audioRef.current
    if (audio === null) return

    if (playing) {
      pause()
      return
    }

    for (const otherPause of mountedPlayers) {
      if (otherPause !== pause) otherPause()
    }

    try {
      await audio.play()
      setPlaying(true)
    } catch {
      // A rejected play() is indistinguishable to the user from a dead file,
      // so it is reported the same way rather than swallowed.
      fail()
    }
  }

  function onSeek(value: number) {
    const audio = audioRef.current
    if (audio === null) return
    audio.currentTime = value
    setCurrentTime(value)
  }

  if (failed) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-card border-2 border-destructive bg-destructive-surface p-4 text-on-destructive-surface"
      >
        <DangerIcon className="mt-0.5 size-6 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t('audio.errorTitle', { label })}</p>
          <p className="mt-0.5 text-base">{t('audio.errorBody')}</p>
        </div>
      </div>
    )
  }

  const effectiveDuration = duration > 0 ? duration : (durationSec ?? 0)

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface-raised p-3">
      <audio
        ref={audioRef}
        src={url ?? undefined}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration
          if (Number.isFinite(value) && value > 0) setDuration(value)
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false)
          setCurrentTime(0)
        }}
        onError={fail}
      >
        <track kind="captions" />
      </audio>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          // Names the recording, not just the verb: on a screen with six
          // players, "play" alone tells a screen-reader user nothing.
          aria-label={playing ? t('audio.pause', { label }) : t('audio.play', { label })}
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-pill bg-primary-strong text-on-primary active:opacity-90"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="currentColor">
              <rect x="6.5" y="5" width="4" height="14" rx="1" />
              <rect x="13.5" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="currentColor">
              <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2Z" />
            </svg>
          )}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <MicIcon className="size-5 shrink-0 text-muted" />
          <span className="truncate text-base font-medium text-on-surface">{label}</span>
        </div>

        {/* Both times as text. A bar position is not a readable number. */}
        <span className="shrink-0 text-sm tabular-nums text-muted">
          {formatTime(currentTime)} / {formatTime(effectiveDuration)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={effectiveDuration > 0 ? effectiveDuration : 1}
        step={0.1}
        value={Math.min(currentTime, effectiveDuration > 0 ? effectiveDuration : 1)}
        onChange={(event) => onSeek(Number(event.target.value))}
        disabled={effectiveDuration <= 0}
        aria-label={t('audio.seek', { label })}
        aria-valuetext={`${formatTime(currentTime)} / ${formatTime(effectiveDuration)}`}
        // A hairline scrubber is unusable one-handed. The track is 8px, the
        // thumb 28px, and the control reserves a 48px row to be hit in.
        className="h-12 w-full cursor-pointer appearance-none bg-transparent
          [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-pill [&::-webkit-slider-runnable-track]:bg-surface-sunken
          [&::-webkit-slider-thumb]:mt-[-10px] [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-pill [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-on-primary [&::-webkit-slider-thumb]:bg-primary-strong
          [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-pill [&::-moz-range-track]:bg-surface-sunken
          [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-pill [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-on-primary [&::-moz-range-thumb]:bg-primary-strong
          disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}
