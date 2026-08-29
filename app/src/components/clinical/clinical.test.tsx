import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n as appI18n } from '../../i18n'
import { registerDesignResources } from '../../design/i18n'
import { ConfidenceBar } from './ConfidenceBar'
import { FictionalDataBanner } from './FictionalDataBanner'
import { NotConnectedPanel } from './NotConnectedPanel'
import { ResultCard } from './ResultCard'
import { SourceBadge } from './SourceBadge'
import { StatusPill } from './StatusPill'
import { RESULT_VERDICTS, type ResultVerdict } from './verdict'

registerDesignResources(appI18n)
afterEach(cleanup)

const t = (key: string, options?: Record<string, unknown>) => appI18n.t(`design:${key}`, options)
/** SourceBadge reads clinical vocabulary from the code registry, not `design`. */
const tCodes = (key: string) => appI18n.t(`codes:${key}`)
const ALL_VERDICTS = Object.values(RESULT_VERDICTS) as ResultVerdict[]

describe('ResultCard', () => {
  it.each(ALL_VERDICTS)('renders %s with both an icon and words, never colour alone', (verdict) => {
    const { container } = render(<ResultCard verdict={verdict} />)

    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      t(`result.${verdict}.title`),
    )
  })

  it.each(ALL_VERDICTS)('always states the fixed explanation for %s', (verdict) => {
    render(<ResultCard verdict={verdict} />)

    expect(screen.getByText(t(`result.${verdict}.body`))).toBeInTheDocument()
  })

  it('gives each verdict a distinct icon', () => {
    const shapes = ALL_VERDICTS.map((verdict) => {
      const { container, unmount } = render(<ResultCard verdict={verdict} />)
      const glyph = container.querySelector('svg')?.innerHTML ?? ''
      unmount()
      return glyph
    })

    expect(new Set(shapes).size).toBe(ALL_VERDICTS.length)
  })

  // The single most important assertion in this file. A screen that shows
  // "nothing unusual detected" without this sentence is unsafe, and the
  // component is built so no caller can drop it.
  it('never says nothing-was-found without saying it does not rule out illness', () => {
    render(<ResultCard verdict={RESULT_VERDICTS.NO_ABNORMALITY_DETECTED} />)

    expect(screen.getByText(/does not rule out illness/i)).toBeInTheDocument()
  })

  it('states that a possible finding is not a diagnosis', () => {
    render(<ResultCard verdict={RESULT_VERDICTS.SUGGESTIVE} />)

    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument()
  })

  it('says a poor recording decided nothing about the person', () => {
    render(<ResultCard verdict={RESULT_VERDICTS.INSUFFICIENT_QUALITY} />)

    expect(screen.getByText(/nothing has been decided/i)).toBeInTheDocument()
  })

  it('says an uncertain result means neither well nor unwell', () => {
    render(<ResultCard verdict={RESULT_VERDICTS.UNCERTAIN} />)

    const body = screen.getByText(t(`result.${RESULT_VERDICTS.UNCERTAIN}.body`)).textContent ?? ''
    expect(body).toMatch(/does not mean you are well/i)
    expect(body).toMatch(/does not mean you are unwell/i)
  })

  it('presents a possible finding as a caution, not an emergency', () => {
    const { container } = render(<ResultCard verdict={RESULT_VERDICTS.SUGGESTIVE} />)

    // Amber, never red: this is a screening flag on a research prototype, and
    // red would overstate it into an emergency.
    const card = container.querySelector('section')
    expect(card?.className).toContain('warning')
    expect(card?.className).not.toContain('destructive')
  })

  it.each(ALL_VERDICTS)('carries the prototype disclaimer on %s', (verdict) => {
    render(<ResultCard verdict={verdict} />)

    expect(screen.getByText(t('disclaimer.short'))).toBeInTheDocument()
  })

  it('shows a confidence figure only when one is given', () => {
    const { unmount } = render(<ResultCard verdict={RESULT_VERDICTS.SUGGESTIVE} />)
    expect(screen.queryByText(t('confidence.label'))).not.toBeInTheDocument()
    unmount()

    render(<ResultCard verdict={RESULT_VERDICTS.SUGGESTIVE} confidencePercent={72} />)
    expect(screen.getByText(t('confidence.value', { percent: 72 }))).toBeInTheDocument()
  })

  it('offers a record-again action when asked', () => {
    const onRecordAgain = vi.fn()
    render(
      <ResultCard
        verdict={RESULT_VERDICTS.INSUFFICIENT_QUALITY}
        onRecordAgain={onRecordAgain}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('action.recordAgain')) }))

    expect(onRecordAgain).toHaveBeenCalledTimes(1)
  })

  it('shows where and when the recording was taken', () => {
    render(
      <ResultCard verdict={RESULT_VERDICTS.UNCERTAIN} meta="Right upper lung · 12 Aug 2026" />,
    )

    expect(screen.getByText('Right upper lung · 12 Aug 2026')).toBeInTheDocument()
  })
})

describe('StatusPill', () => {
  it.each(ALL_VERDICTS)('shows %s as an icon plus a word, never a bare dot', (verdict) => {
    const { container } = render(<StatusPill verdict={verdict} />)

    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByText(t(`result.${verdict}.title`))).toBeInTheDocument()
  })

  it('keeps the word in the compact size too', () => {
    render(<StatusPill verdict={RESULT_VERDICTS.SUGGESTIVE} size="sm" />)

    expect(
      screen.getByText(t(`result.${RESULT_VERDICTS.SUGGESTIVE}.title`)),
    ).toBeInTheDocument()
  })
})

describe('ConfidenceBar', () => {
  it('shows the value as a numeral, not only as a bar length', () => {
    render(<ConfidenceBar percent={72} />)

    expect(screen.getByText(t('confidence.value', { percent: 72 }))).toBeInTheDocument()
  })

  it('warns that confidence is not a probability of illness', () => {
    render(<ConfidenceBar percent={72} />)

    expect(screen.getByText(t('confidence.explanation'))).toBeInTheDocument()
    expect(screen.getByText(/not the chance that you have an illness/i)).toBeInTheDocument()
  })

  it('can drop the explanation only when explicitly told to', () => {
    render(<ConfidenceBar percent={72} hideExplanation />)

    expect(screen.queryByText(t('confidence.explanation'))).not.toBeInTheDocument()
  })

  it.each([
    [-20, 0],
    [0, 0],
    [49.6, 50],
    [100, 100],
    [140, 100],
  ])('clamps and rounds %s to %s', (input, expected) => {
    render(<ConfidenceBar percent={input} />)

    expect(screen.getByText(t('confidence.value', { percent: expected }))).toBeInTheDocument()
  })

  it('hides the decorative bar from assistive technology, since the numeral carries it', () => {
    const { container } = render(<ConfidenceBar percent={72} />)

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })
})

describe('NotConnectedPanel', () => {
  it('names the capability and says plainly it is unavailable', () => {
    render(<NotConnectedPanel title="Severity score" />)

    expect(screen.getByRole('heading', { name: 'Severity score' })).toBeInTheDocument()
    expect(screen.getByText(t('notConnected.label'))).toBeInTheDocument()
  })

  it('says nothing is being measured or calculated', () => {
    render(<NotConnectedPanel title="Severity score" />)

    expect(screen.getByText(/nothing is being measured or calculated/i)).toBeInTheDocument()
  })

  // The hard project rule: Ausculta must never fabricate a clinical value.
  it('prints an explicit "no value" instead of a number', () => {
    render(<NotConnectedPanel title="Severity score" />)

    expect(screen.getByText(t('notConnected.noValue'))).toBeInTheDocument()
  })

  it('shows no digit anywhere, so nothing can be misread as a reading', () => {
    const { container } = render(<NotConnectedPanel title="Severity score" />)

    expect(container.textContent ?? '').not.toMatch(/\d/)
  })

  it('contains nothing interactive, so it cannot look merely disabled', () => {
    render(<NotConnectedPanel title="Cloud sync" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('is a standing note rather than an interrupting status', () => {
    render(<NotConnectedPanel title="Cloud sync" />)

    expect(screen.getByRole('note')).toBeInTheDocument()
  })
})

describe('SourceBadge', () => {
  it.each(['MANUAL_ENTRY', 'AUSCULTATION_DERIVED'] as const)(
    'labels %s in words as well as an icon',
    (source) => {
      const { container } = render(<SourceBadge source={source} />)

      expect(screen.getByText(tCodes(`measurementSource.${source}`))).toBeInTheDocument()
      expect(container.querySelector('svg')).toBeInTheDocument()
    },
  )

  it('tells a measured value apart from a derived one', () => {
    const { unmount } = render(<SourceBadge source="MANUAL_ENTRY" />)
    expect(screen.getByText(/measured by a person/i)).toBeInTheDocument()
    unmount()

    render(<SourceBadge source="AUSCULTATION_DERIVED" />)
    // Not "measured by the device": nothing measured it. It was computed from
    // a recording, and saying otherwise is a false provenance claim on the one
    // control whose whole purpose is stating provenance.
    expect(screen.getByText(/worked out from the recording/i)).toBeInTheDocument()
    expect(screen.queryByText(/measured by the device/i)).not.toBeInTheDocument()
  })

  it('reads its wording from the clinical code registry, not a private copy', () => {
    render(<SourceBadge source="AUSCULTATION_DERIVED" />)

    // A second home for clinical vocabulary is what let this drift into a
    // false claim in the first place.
    expect(
      screen.getByText(tCodes('measurementSource.AUSCULTATION_DERIVED')),
    ).toBeInTheDocument()
  })
})

describe('FictionalDataBanner', () => {
  it('says in plain words that this is not a real person', () => {
    render(<FictionalDataBanner />)

    expect(screen.getByText(/not a real person/i)).toBeInTheDocument()
  })

  it('is a note that assistive technology can find by name', () => {
    render(<FictionalDataBanner />)

    expect(screen.getByRole('note', { name: t('fictional.title') })).toBeInTheDocument()
  })

  it('uses a solid fill, so it stays legible over any surface it sits on', () => {
    const { container } = render(<FictionalDataBanner />)

    // A translucent wash would take on whatever is behind it and lose its
    // force on exactly the busiest screen.
    const banner = container.querySelector('[role="note"]')
    expect(banner?.className).toContain('bg-warning')
    expect(banner?.className).not.toContain('bg-warning-surface')
  })

  it('still names itself sample data in the compact form', () => {
    render(<FictionalDataBanner compact />)

    expect(screen.getByText(t('fictional.shortLabel'))).toBeInTheDocument()
    expect(screen.getByText(/not a real patient/i)).toBeInTheDocument()
  })

  it('carries an icon in both forms', () => {
    const { container, unmount } = render(<FictionalDataBanner />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    unmount()

    const compact = render(<FictionalDataBanner compact />)
    expect(compact.container.querySelector('svg')).toBeInTheDocument()
  })
})
