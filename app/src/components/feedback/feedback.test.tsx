import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n as appI18n } from '../../i18n'
import { registerDesignResources } from '../../design/i18n'
import { DisclaimerBanner } from '../DisclaimerBanner'
import { Banner, type BannerTone } from './Banner'
import { ConfirmDialog } from './ConfirmDialog'
import { EmptyState } from './EmptyState'
import { Skeleton, SkeletonGroup } from './Skeleton'
import { Spinner } from './Spinner'
import { ToastProvider, useToast } from './Toast'

registerDesignResources(appI18n)
afterEach(cleanup)

const t = (key: string) => appI18n.t(`design:${key}`)
const TONES: BannerTone[] = ['info', 'success', 'warning', 'danger']

describe('Banner', () => {
  it.each(TONES)('renders the %s tone with an icon as well as its text', (tone) => {
    const { container } = render(<Banner tone={tone}>Something happened</Banner>)

    // Colour is never the only signal: there is always a glyph too.
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByText('Something happened')).toBeInTheDocument()
  })

  it('gives each tone a distinct icon, so tones are told apart without colour', () => {
    const shapes = TONES.map((tone) => {
      const { container, unmount } = render(<Banner tone={tone}>text</Banner>)
      const paths = [...container.querySelectorAll('svg path, svg circle')]
        .map((node) => node.getAttribute('d') ?? node.tagName)
        .join('|')
      unmount()
      return paths
    })

    expect(new Set(shapes).size).toBe(TONES.length)
  })

  it('interrupts for bad news and stays polite otherwise', () => {
    const { unmount } = render(<Banner tone="danger">Could not save</Banner>)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
    unmount()

    render(<Banner tone="success">Saved</Banner>)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('renders a title above the message', () => {
    render(
      <Banner tone="info" title="Heads up">
        Details here
      </Banner>,
    )

    expect(screen.getByText('Heads up')).toBeInTheDocument()
    expect(screen.getByText('Details here')).toBeInTheDocument()
  })

  it('has no dismiss control unless one is asked for', () => {
    render(<Banner tone="info">Cannot be dismissed</Banner>)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('gives the icon-only dismiss control an accessible name', () => {
    const onDismiss = vi.fn()
    render(
      <Banner tone="info" onDismiss={onDismiss}>
        Dismiss me
      </Banner>,
    )

    fireEvent.click(screen.getByRole('button', { name: t('action.dismiss') }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('DisclaimerBanner', () => {
  it('states the prototype disclaimer in full by default', () => {
    render(<DisclaimerBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(t('disclaimer.long'))
  })

  it('says plainly that it does not diagnose and does not replace a clinician', () => {
    render(<DisclaimerBanner />)

    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toMatch(/does not diagnose/i)
    expect(text).toMatch(/does not replace/i)
  })

  it('still honours an explicit key, as the landing screen passes', () => {
    render(<DisclaimerBanner i18nKey="common:disclaimer" />)

    expect(screen.getByRole('status')).toHaveTextContent(
      appI18n.t('common:disclaimer') as unknown as string,
    )
  })

  it('carries an icon, not just a colour wash', () => {
    const { container } = render(<DisclaimerBanner />)

    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})

describe('Toast', () => {
  function Harness({ tone }: { tone?: BannerTone }) {
    const { show } = useToast()
    return (
      <button type="button" onClick={() => show('Saved to this device', tone)}>
        Trigger
      </button>
    )
  }

  it('mounts the live region before any message exists', () => {
    render(
      <ToastProvider>
        <p>content</p>
      </ToastProvider>,
    )

    // Mounting the region together with its first message makes announcement
    // unreliable, so the region is always present.
    const region = screen.getByRole('status', { name: t('toast.region') })
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('shows a queued message', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }))

    expect(screen.getByText('Saved to this device')).toBeInTheDocument()
  })

  it('does not steal focus from what the user was doing', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    trigger.focus()
    fireEvent.click(trigger)

    expect(document.activeElement).toBe(trigger)
  })

  it('disappears on its own after the duration', () => {
    vi.useFakeTimers()
    try {
      render(
        <ToastProvider durationMs={4000}>
          <Harness />
        </ToastProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Trigger' }))
      expect(screen.getByText('Saved to this device')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(4001)
      })

      expect(screen.queryByText('Saved to this device')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stacks more than one message', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Trigger' })
    fireEvent.click(trigger)
    fireEvent.click(trigger)

    expect(screen.getAllByText('Saved to this device')).toHaveLength(2)
  })
})

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<Skeleton />)

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('repeats for a multi-line placeholder', () => {
    const { container } = render(<Skeleton lines={3} />)

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3)
  })

  it('announces the region busy exactly once, not per placeholder', () => {
    render(
      <SkeletonGroup label="Loading recordings">
        <Skeleton lines={4} />
      </SkeletonGroup>,
    )

    const region = screen.getByRole('status', { name: 'Loading recordings' })
    expect(region).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Spinner', () => {
  it('is decorative by default', () => {
    const { container } = render(<Spinner />)

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('becomes an announced status when given a label', () => {
    render(<Spinner label="Loading results" />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByTitle('Loading results')).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('names what is missing and offers a way forward', () => {
    render(
      <EmptyState
        title="No recordings yet"
        body="Recordings you make will show up here."
        action={<button type="button">Make a recording</button>}
      />,
    )

    expect(screen.getByRole('heading', { name: 'No recordings yet' })).toBeInTheDocument()
    expect(screen.getByText('Recordings you make will show up here.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make a recording' })).toBeInTheDocument()
  })
})

describe('ConfirmDialog', () => {
  it('asks the question as a modal dialog', () => {
    render(
      <ConfirmDialog open title="Delete this recording?" onConfirm={() => {}} onCancel={() => {}}>
        This cannot be undone.
      </ConfirmDialog>,
    )

    expect(screen.getByRole('dialog', { name: 'Delete this recording?' })).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
  })

  it('puts cancel before confirm, so the safe option is the one focus reaches first', () => {
    render(
      <ConfirmDialog open title="Delete?" destructive onConfirm={() => {}} onCancel={() => {}}>
        body
      </ConfirmDialog>,
    )

    const footerButtons = screen
      .getAllByRole('button')
      .filter((button) => button.textContent === t('action.cancel') || button.textContent === t('action.confirm'))
    expect(footerButtons[0]).toHaveTextContent(t('action.cancel'))
    expect(footerButtons[1]).toHaveTextContent(t('action.confirm'))
  })

  it('reports confirm and cancel separately', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Delete?"
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        body
      </ConfirmDialog>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not let a stray tap outside decide a destructive action', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog open title="Delete?" destructive onConfirm={() => {}} onCancel={onCancel}>
        body
      </ConfirmDialog>,
    )

    fireEvent.click(document.querySelector('[aria-hidden="true"]') as Element)

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('still closes a destructive dialog on Escape, so it is never a trap', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog open title="Delete?" destructive onConfirm={() => {}} onCancel={onCancel}>
        body
      </ConfirmDialog>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables both controls while the action is in flight', () => {
    render(
      <ConfirmDialog
        open
        title="Delete?"
        busy
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        body
      </ConfirmDialog>,
    )

    expect(screen.getByRole('button', { name: 'Keep' })).toBeDisabled()
    const confirm = screen.getByRole('button', { name: 'Delete' })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute('aria-busy', 'true')
  })

  it('renders nothing while closed', () => {
    const { container } = render(
      <ConfirmDialog open={false} title="Delete?" onConfirm={() => {}} onCancel={() => {}}>
        body
      </ConfirmDialog>,
    )

    expect(within(container).queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
