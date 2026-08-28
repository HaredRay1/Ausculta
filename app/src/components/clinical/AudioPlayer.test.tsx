import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n as appI18n } from '../../i18n'
import { registerDesignResources } from '../../design/i18n'
import { AudioPlayer } from './AudioPlayer'

registerDesignResources(appI18n)

const t = (key: string, options?: Record<string, unknown>) => appI18n.t(`design:${key}`, options)

let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>
let urlCounter = 0

beforeEach(() => {
  urlCounter = 0
  createObjectURL = vi.fn(() => `blob:mock/${(urlCounter += 1)}`)
  revokeObjectURL = vi.fn()
  // jsdom implements neither the object-URL store nor media playback.
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, writable: true })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    value: vi.fn(async () => undefined),
    writable: true,
    configurable: true,
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  })
})

afterEach(cleanup)

function makeBlob(content = 'audio-bytes') {
  return new Blob([content], { type: 'audio/wav' })
}

describe('AudioPlayer', () => {
  it('names its controls after the recording, not just the verb', () => {
    render(<AudioPlayer blob={makeBlob()} label="Right upper lung" durationSec={12} />)

    // Six of these sit on one review screen; "Play" alone identifies nothing.
    expect(
      screen.getByRole('button', { name: t('audio.play', { label: 'Right upper lung' }) }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('slider', { name: t('audio.seek', { label: 'Right upper lung' }) }),
    ).toBeInTheDocument()
  })

  it('shows the current time and the total duration as text', () => {
    render(<AudioPlayer blob={makeBlob()} label="Left lower lung" durationSec={75} />)

    expect(screen.getByText('0:00 / 1:15')).toBeInTheDocument()
  })

  it('creates exactly one object URL for the blob', () => {
    render(<AudioPlayer blob={makeBlob()} label="Right upper lung" durationSec={5} />)

    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('revokes the object URL on unmount, so the buffer is not pinned in memory', () => {
    const { unmount } = render(
      <AudioPlayer blob={makeBlob()} label="Right upper lung" durationSec={5} />,
    )
    expect(revokeObjectURL).not.toHaveBeenCalled()

    unmount()

    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('revokes the old URL and creates a new one when the blob changes', () => {
    const { rerender } = render(
      <AudioPlayer blob={makeBlob('first')} label="Right upper lung" durationSec={5} />,
    )

    rerender(<AudioPlayer blob={makeBlob('second')} label="Right upper lung" durationSec={5} />)

    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('toggles to a pause control once playing', async () => {
    render(<AudioPlayer blob={makeBlob()} label="Right upper lung" durationSec={5} />)

    fireEvent.click(
      screen.getByRole('button', { name: t('audio.play', { label: 'Right upper lung' }) }),
    )

    expect(
      await screen.findByRole('button', {
        name: t('audio.pause', { label: 'Right upper lung' }),
      }),
    ).toBeInTheDocument()
  })

  it('stops the other players when one starts', async () => {
    render(
      <>
        <AudioPlayer blob={makeBlob('a')} label="Right upper lung" durationSec={5} />
        <AudioPlayer blob={makeBlob('b')} label="Left lower lung" durationSec={5} />
      </>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: t('audio.play', { label: 'Right upper lung' }) }),
    )
    await screen.findByRole('button', { name: t('audio.pause', { label: 'Right upper lung' }) })

    fireEvent.click(
      screen.getByRole('button', { name: t('audio.play', { label: 'Left lower lung' }) }),
    )

    // Six recordings audible at once on a phone speaker is not a review.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: t('audio.play', { label: 'Right upper lung' }) }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: t('audio.pause', { label: 'Left lower lung' }) }),
    ).toBeInTheDocument()
  })

  it('seeks to the position the user picked', () => {
    render(<AudioPlayer blob={makeBlob()} label="Right upper lung" durationSec={60} />)

    const slider = screen.getByRole('slider', {
      name: t('audio.seek', { label: 'Right upper lung' }),
    })
    fireEvent.change(slider, { target: { value: '30' } })

    expect(screen.getByText('0:30 / 1:00')).toBeInTheDocument()
  })

  it('takes the duration the browser reports over the one it was given', () => {
    render(<AudioPlayer blob={makeBlob()} label="Right upper lung" durationSec={10} />)

    const audio = document.querySelector('audio') as HTMLAudioElement
    Object.defineProperty(audio, 'duration', { value: 42, configurable: true })
    fireEvent.loadedMetadata(audio)

    expect(screen.getByText('0:00 / 0:42')).toBeInTheDocument()
  })

  it('survives a browser that reports no duration at all', () => {
    render(<AudioPlayer blob={makeBlob()} label="Right upper lung" />)

    const audio = document.querySelector('audio') as HTMLAudioElement
    Object.defineProperty(audio, 'duration', { value: Number.NaN, configurable: true })
    fireEvent.loadedMetadata(audio)

    expect(screen.getByText('0:00 / 0:00')).toBeInTheDocument()
  })
})

describe('AudioPlayer failure', () => {
  // A silently dead player leads a practitioner to conclude "there is nothing
  // to hear" when the file simply failed to load. These are the assertions
  // that stop a UI failure from becoming a clinical conclusion.
  it('states the failure loudly instead of looking idle', () => {
    render(<AudioPlayer blob={makeBlob()} label="Right upper lung" durationSec={5} />)

    fireEvent.error(document.querySelector('audio') as HTMLAudioElement)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(t('audio.errorTitle', { label: 'Right upper lung' }))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says explicitly that a failure is not a silent or normal recording', () => {
    render(<AudioPlayer blob={makeBlob()} label="Right upper lung" durationSec={5} />)

    fireEvent.error(document.querySelector('audio') as HTMLAudioElement)

    expect(screen.getByText(/does not mean the recording is silent or normal/i)).toBeInTheDocument()
  })

  it('carries an icon as well as red, so the failure is not colour-only', () => {
    const { container } = render(
      <AudioPlayer blob={makeBlob()} label="Right upper lung" durationSec={5} />,
    )

    fireEvent.error(document.querySelector('audio') as HTMLAudioElement)

    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('tells the caller once, so a screen can record the failure', () => {
    const onError = vi.fn()
    render(<AudioPlayer blob={makeBlob()} label="Right upper lung" onError={onError} />)

    fireEvent.error(document.querySelector('audio') as HTMLAudioElement)

    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('reports a rejected play() the same way as a dead file', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      value: vi.fn(async () => {
        throw new Error('NotAllowedError')
      }),
      writable: true,
      configurable: true,
    })
    const onError = vi.fn()
    render(<AudioPlayer blob={makeBlob()} label="Right upper lung" onError={onError} />)

    fireEvent.click(
      screen.getByRole('button', { name: t('audio.play', { label: 'Right upper lung' }) }),
    )

    // Indistinguishable to the user from a file that will not load, so it is
    // reported identically rather than swallowed.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  // The value arrives from a database this component does not control.
  // createObjectURL throws a TypeError on anything that is not a Blob, and it
  // is called from a passive effect — so an unguarded throw is an uncaught
  // exception that unmounts the whole screen. On a review screen that is a
  // practitioner opening a case and getting a blank page.
  it.each([
    ['a plain object where a Blob was expected', { size: 10, type: 'audio/wav' }],
    ['undefined', undefined],
    ['null', null],
    ['a string', 'not-a-blob'],
  ])('shows the error state rather than crashing on %s', (_label, value) => {
    const onError = vi.fn()

    expect(() =>
      render(
        <AudioPlayer
          blob={value as unknown as Blob}
          label="Right upper lung"
          onError={onError}
        />,
      ),
    ).not.toThrow()

    expect(screen.getByRole('alert')).toHaveTextContent(
      t('audio.errorTitle', { label: 'Right upper lung' }),
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('does not churn the object URL when onError is a fresh function each render', () => {
    const blob = makeBlob()
    const { rerender } = render(
      <AudioPlayer blob={blob} label="Right upper lung" onError={() => undefined} />,
    )
    rerender(<AudioPlayer blob={blob} label="Right upper lung" onError={() => undefined} />)
    rerender(<AudioPlayer blob={blob} label="Right upper lung" onError={() => undefined} />)

    // An unstable onError must not tear down and rebuild the URL each render.
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('recovers when a new blob arrives after a failure', () => {
    const { rerender } = render(
      <AudioPlayer blob={makeBlob('broken')} label="Right upper lung" durationSec={5} />,
    )
    fireEvent.error(document.querySelector('audio') as HTMLAudioElement)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(<AudioPlayer blob={makeBlob('good')} label="Right upper lung" durationSec={5} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t('audio.play', { label: 'Right upper lung' }) }),
    ).toBeInTheDocument()
  })
})
