# Ausculta

An intelligent respiratory auscultation, monitoring and rehabilitation-support system.

Ausculta pairs a low-cost smart stethoscope with a phone app that screens lung sounds using
an on-device machine-learning model, then routes the result to a practitioner for review.
It is built for barangay health workers and patients in rural Palawan, Philippines, where
clinics commonly have a stethoscope and little else — no x-ray, no laboratory, and often no
mobile signal.

**This is a research prototype. It is not a medical device, it does not diagnose, and it is
not a substitute for professional medical consultation.**

## What is here

| Path | Contents |
|---|---|
| `app/` | The application — an installable, offline-first progressive web app |
| `firmware/` | ESP32 recorder firmware for the stethoscope device |
| `model/` | The Edge Impulse WebAssembly model export (generated; do not hand-edit) |
| `docs/` | [Architecture](docs/ARCHITECTURE.md), hardware wiring diagram |
| `research-paper/` | The 68-section master specification driving the build |
| `competition/` | As-submitted competition documents — records, do not modify |
| `fieldwork/` | Clinic interviews and documentation behind the research |
| `validation/` | Evaluation-phase instruments and [what they require](validation/README.md) |

## Running the app

```
cd app
npm install
npm run dev
```

Then open the printed URL. `npm run build` produces the production bundle, `npm run
preview` serves it, and `npm test` runs the suite.

To install it on an Android phone, serve the built app over HTTPS, open it in Chrome, and
use "Add to Home screen". After the first load everything — including the 8 MB model — is
cached on the device and the app works with no network at all.

## Running the standalone model demo

The original Edge Impulse browser demo still works and is useful for sanity-checking the
model in isolation:

```
cd "model/smartstethoscope-wasm-browser-simd-v5-impulse-#1/browser"
python server.py
```

Open http://localhost:8082 and paste a comma-separated list of raw feature values. It must
be served over HTTP; opening the file directly fails because the browser cannot fetch the
WebAssembly module that way.

## How it works, briefly

The device records lung sounds at six standard chest positions and writes them to an SD
card as 16 kHz mono WAV files. The app imports a recording, checks it is actually usable,
splits it into overlapping one-second windows, classifies each window with the model, and
requires the windows to agree before it will say anything definite. The result is phrased
as an early warning — "sound pattern suggestive of asthma, please consult a physician" —
never as a diagnosis, and a practitioner confirms or disagrees before the patient sees a
conclusion.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the design in full, including the
parts that are deliberately not built and why.

## Honest limitations

- The model is roughly 71% accurate, classifies four conditions, and was trained on a
  public respiratory sound database — not on recordings from this device, these clinics, or
  these patients.
- It is fragile on degraded input: silence alone scores as "healthy" with high confidence.
  A quality gate rejects unusable recordings before the model ever sees them, which is the
  single most important safety mechanism in the app.
- Severity scoring, cloud sync, and Bluetooth streaming are not implemented. The app labels
  them as unavailable rather than simulating them.
- Nothing here has been clinically validated.

## Credits

Research by senior high school students at Puerto Princesa City National Science High
School, MIMAROPA Region, Philippines, with fieldwork conducted at barangay health clinics
around Puerto Princesa City.
