import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { RadioGroup } from './RadioGroup'
import { Select } from './Select'
import { Switch } from './Switch'
import { Textarea } from './Textarea'
import { TextField } from './TextField'

// This project's vitest config does not enable `globals`, so Testing Library's
// automatic per-test cleanup never registers itself.
afterEach(cleanup)

describe('Button', () => {
  it('is disabled and announced busy while loading', () => {
    render(<Button loading>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps its label visible while loading, so the button does not change meaning', () => {
    render(<Button loading>Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('does not fire onClick while loading', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('is not busy when it is merely disabled', () => {
    render(<Button disabled>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).not.toHaveAttribute('aria-busy')
  })

  it('fires onClick normally when idle', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('defaults to type="button" so it cannot submit a form by accident', () => {
    render(<Button>Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it.each(['primary', 'secondary', 'ghost', 'destructive'] as const)(
    'renders the %s variant with its label reachable by name',
    (variant) => {
      render(<Button variant={variant}>Confirm</Button>)

      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    },
  )
})

describe('TextField', () => {
  it('associates the visible label with the input', () => {
    render(<TextField label="Full name" value="" onChange={() => {}} />)

    expect(screen.getByLabelText('Full name')).toBeInstanceOf(HTMLInputElement)
  })

  it('describes the input with its helper text', () => {
    render(
      <TextField label="Username" hint="Letters and numbers only." value="" onChange={() => {}} />,
    )

    const input = screen.getByLabelText('Username')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      'Letters and numbers only.',
    )
  })

  it('associates an error with the input and announces it', () => {
    render(
      <TextField label="Username" error="That name is already used." value="" onChange={() => {}} />,
    )

    const input = screen.getByLabelText('Username')
    expect(input).toHaveAttribute('aria-invalid', 'true')

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('That name is already used.')
    expect(input.getAttribute('aria-describedby')).toContain(alert.id)
  })

  it('describes the input with the hint and the error together', () => {
    render(
      <TextField
        label="Username"
        hint="Letters and numbers only."
        error="That name is already used."
        value=""
        onChange={() => {}}
      />,
    )

    const ids = screen.getByLabelText('Username').getAttribute('aria-describedby')?.split(' ') ?? []
    expect(ids).toHaveLength(2)
    const text = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
    expect(text).toContain('Letters and numbers only.')
    expect(text).toContain('That name is already used.')
  })

  it('is neither invalid nor described when it is clean', () => {
    render(<TextField label="Username" value="" onChange={() => {}} />)

    const input = screen.getByLabelText('Username')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('reports what the user typed', () => {
    const onChange = vi.fn()
    render(<TextField label="Username" value="" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'juan' } })

    expect(onChange).toHaveBeenCalledWith('juan')
  })
})

describe('Textarea', () => {
  it('associates label, helper and error the same way a TextField does', () => {
    render(
      <Textarea
        label="Notes"
        hint="Anything the clinician should know."
        error="Please shorten this."
        value=""
        onChange={() => {}}
      />,
    )

    const field = screen.getByLabelText('Notes')
    expect(field).toBeInstanceOf(HTMLTextAreaElement)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Please shorten this.')
    expect(field.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id)
  })
})

describe('Select', () => {
  const OPTIONS = [
    { value: 'r_upper', label: 'Right upper lung' },
    { value: 'l_lower', label: 'Left lower lung' },
  ]

  it('is labelled and reports the chosen value', () => {
    const onChange = vi.fn()
    render(<Select label="Location" value="r_upper" options={OPTIONS} onChange={onChange} />)

    const select = screen.getByLabelText('Location')
    fireEvent.change(select, { target: { value: 'l_lower' } })

    expect(onChange).toHaveBeenCalledWith('l_lower')
  })

  it('offers a disabled placeholder rather than a silently valid empty choice', () => {
    render(
      <Select
        label="Location"
        value=""
        placeholder="Choose a location"
        options={OPTIONS}
        onChange={() => {}}
      />,
    )

    expect(screen.getByRole('option', { name: 'Choose a location' })).toBeDisabled()
  })

  it('associates an error with the control', () => {
    render(
      <Select label="Location" value="" error="Choose one." options={OPTIONS} onChange={() => {}} />,
    )

    const select = screen.getByLabelText('Location')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id)
  })
})

describe('Checkbox', () => {
  it('toggles and reports the new state', () => {
    const onChange = vi.fn()
    render(<Checkbox label="I have a cough" checked={false} onChange={onChange} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'I have a cough' }))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('reflects the checked state to assistive technology', () => {
    render(<Checkbox label="I have a cough" checked onChange={() => {}} />)

    expect(screen.getByRole('checkbox', { name: 'I have a cough' })).toBeChecked()
  })

  it('announces its error', () => {
    render(
      <Checkbox
        label="I agree"
        checked={false}
        error="You must agree to continue."
        onChange={() => {}}
      />,
    )

    const box = screen.getByRole('checkbox', { name: 'I agree' })
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('You must agree to continue.')
  })
})

describe('RadioGroup', () => {
  const ROLES = [
    { value: 'PATIENT', label: 'Patient', description: 'I am here for my own check-up.' },
    { value: 'HEALTH_WORKER', label: 'Health Worker', description: 'I am a community health worker.' },
  ]

  it('exposes each option as a radio named by its label', () => {
    render(<RadioGroup label="I am a" value="PATIENT" options={ROLES} onChange={() => {}} />)

    expect(screen.getByRole('radio', { name: /Patient/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Health Worker/ })).not.toBeChecked()
  })

  it('reports the option the user picked', () => {
    const onChange = vi.fn()
    render(<RadioGroup label="I am a" value="PATIENT" options={ROLES} onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio', { name: /Health Worker/ }))

    expect(onChange).toHaveBeenCalledWith('HEALTH_WORKER')
  })

  it('shows each option a plain-language description, for unaided navigation', () => {
    render(<RadioGroup label="I am a" value="PATIENT" options={ROLES} onChange={() => {}} />)

    expect(screen.getByText('I am here for my own check-up.')).toBeInTheDocument()
  })

  it('groups the radios under the visible group label', () => {
    render(<RadioGroup label="I am a" value="PATIENT" options={ROLES} onChange={() => {}} />)

    expect(screen.getByRole('group', { name: /I am a/ })).toBeInTheDocument()
  })

  it('keeps two groups on one page independent', () => {
    render(
      <>
        <RadioGroup label="First" value="PATIENT" options={ROLES} onChange={() => {}} />
        <RadioGroup label="Second" value="HEALTH_WORKER" options={ROLES} onChange={() => {}} />
      </>,
    )

    const groups = screen.getAllByRole('group')
    const names = groups.map((group) => group.querySelector('input')?.getAttribute('name'))
    expect(names[0]).not.toBe(names[1])
  })
})

describe('Switch', () => {
  it('is a switch, not a checkbox, and reports on/off', () => {
    render(<Switch label="Demo mode" checked={false} onChange={() => {}} />)

    const control = screen.getByRole('switch', { name: 'Demo mode' })
    expect(control).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles to the opposite state when pressed', () => {
    const onChange = vi.fn()
    render(<Switch label="Demo mode" checked onChange={onChange} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Demo mode' }))

    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('does not toggle while disabled', () => {
    const onChange = vi.fn()
    render(<Switch label="Demo mode" checked={false} disabled onChange={onChange} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Demo mode' }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
