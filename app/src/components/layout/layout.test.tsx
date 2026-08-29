import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n as appI18n } from '../../i18n'
import { registerDesignResources } from '../../design/i18n'
import { HomeIcon, PeopleIcon, SettingsIcon } from '../icons'
import { AppBar } from './AppBar'
import { BOTTOM_NAV_MAX_ITEMS, BottomNav } from './BottomNav'
import { Page, Section } from './Page'
import { Sheet } from './Sheet'

registerDesignResources(appI18n)
afterEach(cleanup)

const t = (key: string) => appI18n.t(`design:${key}`)

describe('AppBar', () => {
  it('exposes the title as the screen heading', () => {
    render(<AppBar title="Assessment results" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Assessment results' })).toBeInTheDocument()
  })

  it('shows no back control on a top-level screen', () => {
    render(<AppBar title="Home" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('gives the icon-only back control an accessible name', () => {
    const onBack = vi.fn()
    render(<AppBar title="Details" onBack={onBack} />)

    const back = screen.getByRole('button', { name: t('action.back') })
    fireEvent.click(back)

    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('BottomNav', () => {
  const ITEMS = [
    { id: 'home', label: 'Home', icon: <HomeIcon /> },
    { id: 'patients', label: 'Patients', icon: <PeopleIcon />, badge: 3 },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  ]

  it('labels every destination in text, not by icon alone', () => {
    render(<BottomNav items={ITEMS} activeId="home" onSelect={() => {}} label="Main" />)

    for (const item of ITEMS) {
      expect(screen.getByRole('button', { name: new RegExp(item.label) })).toBeInTheDocument()
    }
  })

  it('marks the active destination with aria-current, not just colour', () => {
    render(<BottomNav items={ITEMS} activeId="patients" onSelect={() => {}} label="Main" />)

    expect(screen.getByRole('button', { name: /Patients/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /Home/ })).not.toHaveAttribute('aria-current')
  })

  it('names the navigation landmark', () => {
    render(<BottomNav items={ITEMS} activeId="home" onSelect={() => {}} label="Main" />)

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('reports the destination the user picked', () => {
    const onSelect = vi.fn()
    render(<BottomNav items={ITEMS} activeId="home" onSelect={onSelect} label="Main" />)

    fireEvent.click(screen.getByRole('button', { name: /Settings/ }))

    expect(onSelect).toHaveBeenCalledWith('settings')
  })

  it('renders a badge count next to its destination', () => {
    render(<BottomNav items={ITEMS} activeId="home" onSelect={() => {}} label="Main" />)

    expect(within(screen.getByRole('button', { name: /Patients/ })).getByText('3')).toBeInTheDocument()
  })

  it('never renders more than five destinations', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      id: `item-${index}`,
      label: `Item ${index}`,
      icon: <HomeIcon />,
    }))

    render(<BottomNav items={many} activeId="item-0" onSelect={() => {}} label="Main" />)

    expect(screen.getAllByRole('button')).toHaveLength(BOTTOM_NAV_MAX_ITEMS)
  })
})

describe('Page and Section', () => {
  it('renders its children', () => {
    render(
      <Page>
        <Section title="Recent recordings">
          <p>content</p>
        </Section>
      </Page>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Recent recordings' })).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('reserves space for a bottom nav so content cannot hide behind it', () => {
    const { container } = render(
      <Page hasBottomNav>
        <p>content</p>
      </Page>,
    )

    const main = container.querySelector('main')
    // One token, read by both the bar's own maximum height and the space Page
    // leaves for it, so the two cannot drift apart.
    expect(main?.style.paddingBottom).toContain('--size-bottom-nav')
    expect(main?.style.paddingBottom).toContain('safe-area-inset-bottom')
  })
})

describe('Sheet', () => {
  it('renders nothing while closed', () => {
    render(
      <Sheet open={false} onClose={() => {}} title="Confirm">
        <p>body</p>
      </Sheet>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a modal dialog named by its title', () => {
    render(
      <Sheet open onClose={() => {}} title="Turn off this account?">
        <p>body</p>
      </Sheet>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Turn off this account?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Confirm">
        <p>body</p>
      </Sheet>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('offers a visible close control, not only a gesture', () => {
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Confirm">
        <p>body</p>
      </Sheet>,
    )

    fireEvent.click(screen.getByRole('button', { name: t('action.close') }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the dialog when it opens', () => {
    render(
      <Sheet open onClose={() => {}} title="Confirm">
        <button type="button">Inside</button>
      </Sheet>,
    )

    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })

  it('returns focus to whatever opened it', () => {
    function Harness() {
      return (
        <>
          <button type="button" data-testid="opener">
            Open
          </button>
        </>
      )
    }
    const { rerender } = render(
      <>
        <Harness />
        <Sheet open={false} onClose={() => {}} title="Confirm">
          <button type="button">Inside</button>
        </Sheet>
      </>,
    )

    const opener = screen.getByTestId('opener')
    opener.focus()
    expect(document.activeElement).toBe(opener)

    rerender(
      <>
        <Harness />
        <Sheet open onClose={() => {}} title="Confirm">
          <button type="button">Inside</button>
        </Sheet>
      </>,
    )
    expect(document.activeElement).not.toBe(opener)

    rerender(
      <>
        <Harness />
        <Sheet open={false} onClose={() => {}} title="Confirm">
          <button type="button">Inside</button>
        </Sheet>
      </>,
    )
    expect(document.activeElement).toBe(opener)
  })

  it('wraps Tab from the last control back to the first', () => {
    render(
      <Sheet open onClose={() => {}} title="Confirm">
        <button type="button">First inside</button>
        <button type="button">Last inside</button>
      </Sheet>,
    )

    const last = screen.getByRole('button', { name: 'Last inside' })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })

    expect(document.activeElement).toBe(screen.getByRole('button', { name: t('action.close') }))
  })

  it('wraps Shift+Tab from the first control to the last', () => {
    render(
      <Sheet open onClose={() => {}} title="Confirm">
        <button type="button">Only inside</button>
      </Sheet>,
    )

    const close = screen.getByRole('button', { name: t('action.close') })
    close.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Only inside' }))
  })

  it('locks the page behind it from scrolling, and releases it on close', () => {
    const { rerender } = render(
      <Sheet open onClose={() => {}} title="Confirm">
        <p>body</p>
      </Sheet>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <Sheet open={false} onClose={() => {}} title="Confirm">
        <p>body</p>
      </Sheet>,
    )
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('keeps a mandatory decision open when the scrim is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Sheet open onClose={onClose} title="Confirm" dismissOnScrimClick={false}>
        <p>body</p>
      </Sheet>,
    )

    const scrim = document.querySelector('[aria-hidden="true"]')
    expect(scrim).not.toBeNull()
    fireEvent.click(scrim as Element)

    expect(onClose).not.toHaveBeenCalled()
    expect(container).toBeDefined()
  })

  it('renders a footer when one is given', () => {
    render(
      <Sheet open onClose={() => {}} title="Confirm" footer={<button type="button">Yes</button>}>
        <p>body</p>
      </Sheet>,
    )

    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument()
  })
})
