import { useState } from 'react'
import {
  AppBar,
  Banner,
  BottomNav,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DisclaimerBanner,
  EmptyState,
  FictionalDataBanner,
  HomeIcon,
  NotConnectedPanel,
  PeopleIcon,
  RESULT_VERDICTS,
  RadioGroup,
  ResultCard,
  Section,
  Select,
  Sheet,
  Skeleton,
  SkeletonGroup,
  SourceBadge,
  Spinner,
  StatusPill,
  Switch,
  TextField,
  Textarea,
  ToastProvider,
  ALL_ICONS,
  SettingsIcon,
  useToast,
  type ResultVerdict,
} from '../components'

/**
 * Dev-only component gallery.
 *
 * Not routed by this module — mount it behind whatever dev-only path the app
 * router prefers. Its job is to put every component in every state on one
 * screen so the system can be eyeballed as a whole, in both themes, at the
 * 360x740 size the app is actually used at.
 *
 * The theme toggle writes `data-theme` on <html>, which is exactly how the
 * real app should switch: tokens.css follows the device by default and lets
 * that attribute override it in either direction.
 */

const VERDICTS = Object.values(RESULT_VERDICTS) as ResultVerdict[]

function Swatch({ token, label }: { token: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-12 rounded-control border border-border"
        style={{ background: `var(${token})` }}
      />
      <code className="text-sm text-muted">{label}</code>
    </div>
  )
}

function ToastDemo() {
  const { show } = useToast()
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => show('Saved to this device', 'success')}>
        Success toast
      </Button>
      <Button size="sm" variant="secondary" onClick={() => show('Could not save', 'danger')}>
        Danger toast
      </Button>
    </div>
  )
}

export function Gallery() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [text, setText] = useState('')
  const [errorText, setErrorText] = useState('taken')
  const [notes, setNotes] = useState('')
  const [choice, setChoice] = useState('PATIENT')
  const [location, setLocation] = useState('')
  const [checked, setChecked] = useState(true)
  const [switched, setSwitched] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [navId, setNavId] = useState('home')

  function applyTheme(next: 'light' | 'dark') {
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-surface text-on-surface">
        <AppBar
          title="Design system"
          subtitle={`${theme} theme · 360x740 target`}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => applyTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </Button>
          }
        />

        <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-4 py-6 pb-28">
          <Section title="Colour tokens" description="Every colour in the system, both themes.">
            <div className="grid grid-cols-3 gap-3">
              <Swatch token="--color-surface" label="surface" />
              <Swatch token="--color-surface-raised" label="surface-raised" />
              <Swatch token="--color-surface-sunken" label="surface-sunken" />
              <Swatch token="--color-on-surface" label="on-surface" />
              <Swatch token="--color-muted" label="muted" />
              <Swatch token="--color-border" label="border" />
              <Swatch token="--color-border-strong" label="border-strong" />
              <Swatch token="--color-primary" label="primary" />
              <Swatch token="--color-primary-strong" label="primary-strong" />
              <Swatch token="--color-accent" label="accent" />
              <Swatch token="--color-info" label="info" />
              <Swatch token="--color-success" label="success" />
              <Swatch token="--color-warning" label="warning" />
              <Swatch token="--color-destructive" label="destructive" />
              <Swatch token="--color-focus" label="focus" />
            </div>
          </Section>

          <Section title="Typography">
            <Card>
              <h1 className="font-heading text-3xl font-bold">Figtree heading</h1>
              <h2 className="font-heading text-xl font-bold">Figtree subheading</h2>
              <p className="text-base">
                Noto Sans body text at the 16px floor. Filipino: Ang paghinga ay mahalaga sa
                kalusugan ng baga. Iwasan ang usok at alikabok.
              </p>
              <p className="text-sm text-muted">Muted secondary text, 14px.</p>
            </Card>
          </Section>

          <Section title="Buttons" description="Every variant, size and state.">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button loading>Loading</Button>
                <Button disabled>Disabled</Button>
              </div>
              <Button fullWidth iconStart={<HomeIcon className="size-5" />}>
                Full width with icon
              </Button>
            </div>
          </Section>

          <Section title="Form controls" description="Clean, helper text, and error states.">
            <Card>
              <div className="flex flex-col gap-5">
                <TextField
                  label="Full name"
                  value={text}
                  onChange={setText}
                  hint="As written on the health record."
                />
                <TextField
                  label="Username"
                  value={errorText}
                  onChange={setErrorText}
                  hint="Letters and numbers only."
                  error="That username is already used."
                />
                <Select
                  label="Recording location"
                  value={location}
                  onChange={setLocation}
                  placeholder="Choose a location"
                  options={[
                    { value: 'R_UPPER', label: 'Right upper lung' },
                    { value: 'L_LOWER', label: 'Left lower lung' },
                  ]}
                />
                <Textarea
                  label="Notes"
                  value={notes}
                  onChange={setNotes}
                  optionalLabel="optional"
                  hint="Anything the clinician should know."
                />
                <RadioGroup
                  label="I am a"
                  value={choice}
                  onChange={setChoice}
                  options={[
                    {
                      value: 'PATIENT',
                      label: 'Patient',
                      description: 'I am here for my own check-up.',
                    },
                    {
                      value: 'HEALTH_WORKER',
                      label: 'Health Worker',
                      description: 'I am a community health worker.',
                    },
                  ]}
                />
                <Checkbox
                  label="I have a cough"
                  checked={checked}
                  onChange={setChecked}
                  hint="Tick if this has lasted more than a week."
                />
                <Switch label="Demo mode" checked={switched} onChange={setSwitched} />
              </div>
            </Card>
          </Section>

          <Section title="Clinical results" description="All four verdict states.">
            <div className="flex flex-wrap gap-2">
              {VERDICTS.map((verdict) => (
                <StatusPill key={verdict} verdict={verdict} />
              ))}
            </div>
            <ResultCard
              verdict={RESULT_VERDICTS.SUGGESTIVE}
              confidencePercent={72}
              meta="Right upper lung · 12 Aug 2026"
            />
            <ResultCard
              verdict={RESULT_VERDICTS.NO_ABNORMALITY_DETECTED}
              confidencePercent={88}
              meta="Left lower lung · 12 Aug 2026"
            />
            <ResultCard verdict={RESULT_VERDICTS.UNCERTAIN} confidencePercent={41} />
            <ResultCard
              verdict={RESULT_VERDICTS.INSUFFICIENT_QUALITY}
              onRecordAgain={() => undefined}
            />
          </Section>

          <Section title="Provenance and honesty">
            <div className="flex flex-wrap gap-2">
              <SourceBadge source="MANUAL_ENTRY" />
              <SourceBadge source="AUSCULTATION_DERIVED" />
            </div>
            <FictionalDataBanner />
            <FictionalDataBanner compact />
            <NotConnectedPanel title="Severity score" />
            <NotConnectedPanel title="Cloud sync" />
            <DisclaimerBanner />
          </Section>

          <Section title="Feedback">
            <Banner tone="info">An informational message.</Banner>
            <Banner tone="success" title="Saved">
              The recording is stored on this device.
            </Banner>
            <Banner tone="warning" onDismiss={() => undefined}>
              A dismissible warning.
            </Banner>
            <Banner tone="danger">Something went wrong.</Banner>
            <ToastDemo />
            <Card>
              <div className="flex items-center gap-3">
                <Spinner />
                <Spinner label="Loading results" />
                <span className="text-sm text-muted">decorative / labelled</span>
              </div>
            </Card>
            <SkeletonGroup label="Loading recordings">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton lines={3} />
            </SkeletonGroup>
            <EmptyState
              title="No recordings yet"
              body="Recordings you make will show up here."
              action={<Button fullWidth>Make a recording</Button>}
            />
          </Section>

          <Section title="Overlays">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setSheetOpen(true)}>
                Open sheet
              </Button>
              <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                Destructive confirm
              </Button>
            </div>
          </Section>

          <Section title="Icons" description="One stroke weight, 24x24 grid.">
            <Card>
              <div className="grid grid-cols-4 gap-4">
                {Object.entries(ALL_ICONS).map(([name, Icon]) => (
                  <div key={name} className="flex flex-col items-center gap-1 text-center">
                    <Icon className="size-7" />
                    <code className="text-[10px] leading-tight text-muted">
                      {name.replace('Icon', '')}
                    </code>
                  </div>
                ))}
              </div>
            </Card>
          </Section>
        </div>

        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="A bottom sheet"
          footer={<Button onClick={() => setSheetOpen(false)}>Done</Button>}
        >
          <p className="text-base">
            Focus is trapped here. Tab cycles inside, Escape closes, and focus returns to the
            button that opened it.
          </p>
        </Sheet>

        <ConfirmDialog
          open={confirmOpen}
          title="Delete this recording?"
          destructive
          confirmLabel="Delete"
          onConfirm={() => setConfirmOpen(false)}
          onCancel={() => setConfirmOpen(false)}
        >
          This cannot be undone. Tapping outside will not dismiss a destructive decision.
        </ConfirmDialog>

        <BottomNav
          label="Gallery"
          activeId={navId}
          onSelect={setNavId}
          items={[
            { id: 'home', label: 'Home', icon: <HomeIcon /> },
            { id: 'patients', label: 'Patients', icon: <PeopleIcon />, badge: 3 },
            { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
          ]}
        />
      </div>
    </ToastProvider>
  )
}
