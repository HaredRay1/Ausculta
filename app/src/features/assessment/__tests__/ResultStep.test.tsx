import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LOCATION_CODES } from '../../../db/codes'
import { ResultStep } from '../steps/ResultStep'
import '../i18n'
import {
  analysisResult,
  insufficientQualityResult,
  noAbnormalityResult,
  notConnectedResult,
  suggestiveResult,
  uncertainResult,
} from './fixtures'

// This project does not run vitest with `globals`, so Testing Library's own
// auto-cleanup is never registered and one test's DOM would leak into the
// next — which would quietly defeat every "no number anywhere" assertion here.
afterEach(cleanup)

function renderResult(analysis = suggestiveResult()) {
  return render(
    <ResultStep
      analysis={analysis}
      locationCode={LOCATION_CODES.R_UPPER}
      audioBlob={null}
      onRecordAgain={() => {}}
      onContinue={() => {}}
    />,
  )
}

/**
 * Every digit on screen that a reader could take for a measurement.
 *
 * Deliberately blunt: the rule is not "no confidence bar", it is that a
 * clinician must not be able to read a number off a result the model could not
 * support, wherever it leaked in from. The position number is stripped first —
 * "Position 1" is navigation, not a value.
 */
function clinicalDigits(): string[] {
  const text = (document.body.textContent ?? '').replace(/Position \d/g, 'Position')
  return text.match(/\d+/g) ?? []
}

describe('the result screen', () => {
  // 'Pneumonia' is the raw model label; the screen must show the acoustic
  // pattern it maps to, never the disease name the class was trained under.
  it('names the sound pattern and shows the confidence as a number for a finding', () => {
    renderResult(suggestiveResult('Pneumonia', 0.82))

    expect(screen.getByText(/Sound pattern suggestive of Crackles/)).toBeInTheDocument()
    expect(screen.getByText(/please consult a physician/)).toBeInTheDocument()
    expect(screen.getByText('82%')).toBeInTheDocument()
  })

  it('only ever uses the word "diagnosis" to deny making one', () => {
    renderResult(suggestiveResult())
    const text = document.body.textContent ?? ''

    const uses = text.match(/diagnosis/gi) ?? []
    const denials = text.match(/not a diagnosis/gi) ?? []
    expect(uses.length).toBeGreaterThan(0)
    expect(denials.length).toBe(uses.length)
  })

  it('always follows "no abnormality" with "this does not rule out illness"', () => {
    renderResult(noAbnormalityResult())

    expect(screen.getByText(/did not hear anything unusual/)).toBeInTheDocument()
    expect(screen.getByText(/does not rule out illness/)).toBeInTheDocument()
  })

  it('shows no percentage and no confidence at all for a negative result', () => {
    renderResult(noAbnormalityResult(0.74))

    expect(document.body.textContent).not.toMatch(/\d+%/)
    expect(screen.queryByText(/How sure the app is/)).not.toBeInTheDocument()
  })

  it('explains an uncertain result and offers Record again, with no number', () => {
    renderResult(uncertainResult('verdict.tooFewWindows'))

    expect(screen.getByText(/Too little of this recording was loud enough/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /record again/i })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d+%/)
    expect(screen.queryByText(/How sure the app is/)).not.toBeInTheDocument()
  })

  it('renders NO NUMBER ANYWHERE for an unusable recording', () => {
    renderResult(insufficientQualityResult())

    expect(screen.getByText(/could not be used/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /record again/i })).toBeInTheDocument()
    // The hard project rule. Not "no percentage" — no measurable digit at all.
    expect(clinicalDigits()).toEqual([])
  })

  it('renders NO NUMBER ANYWHERE when there is no model, and says so', () => {
    renderResult(notConnectedResult())

    expect(screen.getByText(/analysis model is not installed/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Nothing about this patient's lungs has been assessed/),
    ).toBeInTheDocument()
    expect(clinicalDigits()).toEqual([])
  })

  it('says which model ran', () => {
    renderResult(suggestiveResult())
    expect(screen.getByText('ei-disease-v5@5')).toBeInTheDocument()
  })

  it('says no model ran when none did, rather than naming one that did not', () => {
    renderResult(notConnectedResult())

    expect(screen.getByText(/No model ran/)).toBeInTheDocument()
    expect(screen.queryByText(/ei-disease-v5/)).not.toBeInTheDocument()
  })

  it('claims nothing at all when the finding cannot be coded', () => {
    renderResult(
      analysisResult({
        verdict: { kind: 'suggestive', label: 'Crackles', confidence: 0.99, messageKey: 'x' },
      }),
    )

    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/99/)
    expect(document.body.textContent).not.toMatch(/Crackles/)
  })

  it('carries the research-prototype disclaimer on every state', () => {
    for (const result of [
      suggestiveResult(),
      noAbnormalityResult(),
      uncertainResult(),
      insufficientQualityResult(),
      notConnectedResult(),
    ]) {
      const view = renderResult(result)
      // The design system's full-weight prototype disclaimer, which the
      // validation protocol requires the interface to carry.
      expect(screen.getAllByText(/research prototype/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/does not replace a doctor or health worker/i)).toBeInTheDocument()
      view.unmount()
    }
  })
})
