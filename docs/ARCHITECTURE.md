# Ausculta — system architecture

How the pieces fit together, and what each one honestly does. Written for whoever picks
this up next: a teammate, a validator's technical reviewer, or a future maintainer.

## The whole system in one line

A microphone in a stethoscope records lung sounds to an SD card; a phone app imports those
recordings, checks they are usable, runs a machine-learning model on the device itself, and
shows a health worker or patient an early-warning result that a practitioner then reviews.

```
  ESP32 device                     Android phone (PWA)                  Practitioner
  ┌────────────┐                   ┌──────────────────────────┐         ┌──────────┐
  │ mic in     │   16 kHz mono     │ import → quality gate →  │         │ reviews  │
  │ stethoscope│   16-bit WAV      │ windowing → classifier → │  local  │ confirms │
  │     ↓      │ ────────────────▶ │ verdict → IndexedDB      │ ──────▶ │ or       │
  │ SD card    │   (physical card  │                          │ same    │ disagrees│
  └────────────┘    or file copy)  │ all offline, on-device   │ device  └──────────┘
                                   └──────────────────────────┘
```

There is **no server**. Everything runs on the phone. This is deliberate: the target
clinics in rural Palawan often have no signal, and offline capability was the single most
repeated requirement in the team's fieldwork interviews.

## Repository layout

| Path | What it is |
|---|---|
| `app/` | The application. A React + TypeScript PWA built with Vite. |
| `firmware/` | ESP32 recorder sketch. Writes the WAV files the app imports. |
| `model/` | The Edge Impulse WebAssembly export, as downloaded from Edge Impulse Studio. Generated — never hand-edit. |
| `research-paper/` | The master specification (68 sections) driving what the app must do. |
| `competition/` | As-submitted competition documents. Records — do not modify in place. |
| `fieldwork/` | Clinic interviews and documentation behind the research. |
| `validation/` | The evaluation-phase instruments and what they demand of the build. |
| `docs/` | This file, the hardware wiring diagram, and the original prompt document. |

## The device

An ESP32 with an analog microphone mounted in an acoustic stethoscope, a push button, an
LED, a 16×2 character display, a microSD card and a lithium battery. The firmware samples
the microphone at a hardware-clocked 16 kHz — never `analogRead()` in a loop, which would
jitter — converts the 12-bit unsigned ADC readings to signed 16-bit centred on zero, and
streams them to the card as a standard WAV file.

The file format is a hard contract with the app: **16 000 Hz, 16-bit signed, mono, plain
PCM**. That matches the model's native sample rate exactly, so imported recordings need no
resampling and lose nothing to conversion. `firmware/WAV_FORMAT.md` documents the exact
bytes.

One firmware behaviour matters to the app: the file's size fields are rewritten once per
second, not only when recording stops. A recording interrupted by a flat battery therefore
declares *less* data than physically sits on the card, and the parser honours the declared
size and ignores the unflushed tail. The cost of a power failure is one second, not the
whole recording.

Known hardware issues are listed in `firmware/README.md`. The important one: the wiring
diagram routes the LED to GPIO35, and pins 34–39 on the ESP32 are input-only, so that LED
can never light. The firmware uses GPIO25 instead and the physical wire must be moved.

## The audio and inference module (`app/src/audio/`)

This is the part that decides what a clinician is told, so it is the most carefully built
and most heavily tested area of the codebase. `index.ts` is its only export surface;
nothing above it touches the model directly.

**Decode.** A hand-written RIFF/WAVE parser handles the device's files, walking chunks
properly rather than assuming a fixed header layout, and tolerating the size-field
irregularities real recorders produce. Other formats fall back to the browser's own audio
decoder. Everything is normalised to 16 kHz mono.

One detail worth knowing because it is the classic way this integration breaks: the model
expects samples in 16-bit integer range, roughly −32768 to 32767, while the browser's audio
API produces floats between −1 and 1. The conversion lives in exactly one place, with a
test asserting both paths produce bit-identical results.

**Quality gate.** Runs *before* the model ever sees the audio, and it exists because the
model is fragile. Measured against this deployment: white noise scores Asthma at 0.996,
silence scores **Healthy at 0.988**, and a pure tone scores Pneumonia at 0.551. The silence
case is the dangerous one — a silent recording confidently reported as healthy lungs is the
worst thing this app could say. So the gate checks duration, loudness floor, clipping, DC
offset, spectral flatness (rejects noise), tonality (rejects pure tones) and
high-frequency dominance (warns that the sensor may not be on the chest). A recording that
fails never reaches the classifier at all — there is a test asserting the model is not even
loaded for a rejected file.

**Windowing and aggregation.** The model judges one second at a time, but a real recording
is five seconds or more. The audio is cut into one-second windows overlapping by half a
second; each is classified independently; silent windows are classified but excluded from
voting. The verdict then requires three things to agree — a high enough mean probability, a
high enough proportion of windows agreeing, and enough separation from the runner-up.
Requiring agreement across windows is what stops a single strange second from producing a
confident finding.

**Verdicts.** Four outcomes, and only one of them names a condition:

| Verdict | Meaning |
|---|---|
| `suggestive` | A pattern consistent with a condition, offered for a clinician to consider |
| `no-abnormality` | Nothing abnormal detected — always paired with "this does not rule out illness" |
| `uncertain` | The model did not agree with itself enough to say anything |
| `insufficient-quality` | The recording was not usable; record again |

The model itself outputs four disease labels (Asthma, Bronchiolitis, Healthy, Pneumonia) at
roughly 71% accuracy. The app never presents these as a diagnosis. Every result carries the
model's identity and version, so if a future retrained model replaces this one, old and new
results remain distinguishable in the data.

**Where it runs.** The 8 MB WebAssembly model runs in a Web Worker, so a phone stays
responsive while classifying. The worker is a plain script served as a static file rather
than a bundled module, because the Emscripten output expects classic script loading. The
one non-obvious requirement: the worker must tell Emscripten where to find the `.wasm`
before importing it, or it looks in the wrong directory and fails.

## Data (`app/src/db/`)

IndexedDB via Dexie. Fifteen tables covering users, patients, assessments, recordings,
audio blobs, clinical reviews, monitoring and rehabilitation plans, alerts, research
labels, audit logs and a change journal.

Two rules shape everything:

**Clinical values are stored as language-neutral codes**, never as display text. A wheeze is
`WHEEZE` in the database and becomes "Wheeze" or its Filipino equivalent only at render
time. The app is bilingual and research data leaves the clinic; filtering or exporting on
translated strings would corrupt both.

**Provenance is structural.** Every measurement records where it came from, and manually
entered values can never overwrite device-derived ones. There is a field for a
respiration rate derived from auscultation, and it is permanently unavailable, because no
validated algorithm for it exists here. Recording that honestly is the point.

The change journal exists so that when a backend is eventually built, a sync adapter can
replay local history. Today there is no backend, and the app says so plainly rather than
showing a disconnected cloud icon that implies one.

## The application layer (`app/src/`)

- `auth/` — accounts, roles and route guards, entirely offline. Passwords are hashed with
  PBKDF2 at 210 000 iterations via the Web Crypto API. Practitioner, health worker and
  researcher accounts require an administrator to activate them before they can sign in.
- `design/` + `components/` — the design system: semantic colour tokens for light and dark,
  self-hosted fonts (no CDN, because a font request would fail offline), and the shared
  components including the clinical ones that carry the app's meaning.
- `features/` — one folder per area. Each exports its routes as data rather than editing
  the central router, which is what let several agents build in parallel without collisions.
- `i18n/` — English and Filipino. Missing translations fall back to English and are logged
  rather than rendering a raw key. Consent and safety text is version-tracked and gated on
  human approval: the project forbids machine-translating clinical text, so an unapproved
  translation shows the approved English with a visible notice instead.

## Deliberate limits

Stated plainly, because the project's own specification demands that unbuilt things be
labelled rather than faked:

- **The severity score has no model.** The interface and data structures exist; the app
  displays "not connected" and never a number.
- **There is no cloud sync.** The integration layer is designed and the journal is written,
  but nothing transmits.
- **Bluetooth was removed from scope.** Files move by SD card. Streaming 16 kHz audio over
  Bluetooth Low Energy from an ESP32 is genuinely difficult, and a configurable seam was
  the honest alternative to a half-working one.
- **Camera-guided stethoscope placement was removed** and replaced with instructional
  diagrams, because it required a second neural network that does not exist.
- **The model classifies diseases, not sound types.** The specification asks for sound
  classes — wheeze, crackle — which would need retraining. Until then the app presents
  disease labels as early warnings, never diagnoses.
- **Model accuracy is roughly 71%**, trained on a public respiratory sound database. It has
  not been validated on recordings from this device, in these clinics, on these patients.

## Testing

The suite covers the pure signal-processing logic against synthetic signals with known
properties, the database and role rules, and every rendered state of the clinical
components. Two tests matter more than the rest: one asserts a pure tone can never produce
a confident finding, and one asserts that degraded states render no number anywhere.

The model's real behaviour is pinned by regression fixtures captured from the actual
WebAssembly build, which runs headlessly under Node in about 70 milliseconds — so a model
re-export that silently changes behaviour fails the suite rather than shipping.
