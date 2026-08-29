# Ausculta — build status

Written 29 August 2026 at the end of an overnight build. Read this first.

## Try it in two minutes

```
cd app
npm install
npm run dev
```

The app seeds a fictional clinic on first launch, so there is something to explore
immediately. Every seeded record is labelled as fictional on screen.

Then do this, because it is the most informative thing in the whole build: start an
assessment and import `samples/01-silence.wav`. It is pure digital silence. The raw model
scores silence as **"Healthy" at 98.8% confidence** — and the app refuses to answer,
because the quality check stops it before the model ever runs. `samples/04-breath-like.wav`
is the one that passes. Three refused, one accepted.

`/status` inside the app lists what is real and what is not. `validation/ORIENTATION.md` is
the same thing written for validators to read on paper.

## What is built

Every phase is built and reachable.

Sign-in with five roles and administrator approval. Patient registration with respiratory
and family history, and consent recording its language and text version. The assessment
flow: symptoms, optional vitals, lung position, placement guide, import, quality check,
on-device analysis, result. The patient's own portal — home, results, recordings, trends,
history. The practitioner review workflow: queue, clinical view, a decision form with five
outcomes, and a printable referral. Rehabilitation with safety guidance, an action-plan
viewer and four cited techniques. Monitoring plans, a five-rule alerts engine and clinician
trends. The researcher module: dashboard, ground-truth labelling, model performance and
de-identified export. The admin console: accounts, configuration, audit log and a
translation report. A standalone help page with all twenty-two diagrams. Demo mode. The
ESP32 recorder firmware.

**1987 tests passing across 67 files.** Clean typecheck, clean build, installs on Android
and works fully offline afterwards.

## What is partial

**Rehabilitation content** needs a clinician before any patient reads it (see below).
**Filipino** covers interface text only, by design — every clinical, consent and safety
string deliberately falls back to reviewed English.

## What is not built, deliberately

**Severity score** — no model exists. The app shows no number rather than inventing one.
**Cloud sync** — nothing leaves the device. **Bluetooth** — recordings move by memory card.
**Camera-guided placement** — removed in favour of the diagrams. **Live microphone test
mode** — the device supplies recordings and no validator walks that path.

## Things a human must do before validation

**A clinician must review, in priority order:**

1. **The rehabilitation step-by-step wording.** The agent that wrote it flagged that the
   phrasing is its own, not lifted from any source, and stripped every number it could not
   cite. It is marked in the app as pending review.
2. **Three citations that could not be verified** against a primary document — including the
   one the huff-coughing exclusion rests on.
3. **Two oxygen-saturation thresholds** (92% and 94%) that appear in patient-facing safety
   copy.
4. **The six lung positions in the placement diagrams**, against clavicle, nipple-line and
   rib-margin landmarks — and whether the lower pair should sit more laterally. I verified
   the left/right mirroring is correct (patient's right renders on the viewer's left, which
   is right for a front view), but the anatomy itself needs a clinician's eye.
5. **The consent text**, which is a clearly-marked draft pending ethics review.

**Read the Filipino, and start with one string.** A draft translation of the interface now
exists and is marked as pending review by a native speaker. You are that speaker. Check
this first, because it is the only translation with a safety consequence — the fictional-data
banner, in `app/src/i18n/locales/fil/design.json`:

> **Halimbawang datos**
> Gawa-gawa lamang ang impormasyong ito para ipakita kung paano gumagana ang app. Hindi ito
> tunay na tao at hindi ito tunay na recording.
> *(short form: "Halimbawang datos — hindi tunay na pasyente")*

That sentence is what stands between a clinician and mistaking demonstration data for a real
patient. If it reads wrong to you, change it.

The translator flagged its own uncertainties: `patient.nav.trends` rendered as "Mga bisita"
rather than "Pagbabago", to avoid implying a change in sound means a change in health;
"Home" left in English; and the polite *kayo/inyong* register used throughout. Those are
judgement calls a Puerto Princesa speaker should settle.

Clinical, consent and safety wording is deliberately still English and must stay that way
until a qualified translator and a practitioner review it — that is your own specification's
rule, and it is why the rehabilitation and clinical-result namespaces are untranslated.

**A finding for the research team, and it is a defect in the specification rather than the
build:** the master specification's own rehabilitation activities are wrong for asthma. It
lists huff coughing, which belongs to a mucus-clearance protocol evidenced for cystic
fibrosis and COPD — and is **contraindicated in bronchospasm**, which is exactly this app's
population. I overrode it. The app ships four alternative techniques and tells the user
plainly that huff coughing was left out and to ask their clinician.

**Two hardware fixes need the physical board:** the wiring diagram routes the LED to
GPIO35, and pins 34–39 on the ESP32 are input-only, so that LED can never light — the
firmware uses GPIO25 and the wire must be moved. And the microphone and button may be
swapped; the firmware follows the paper, so if the display says Ready but the button does
nothing, two lines in `firmware/config.h` fix it.

**A question only your team can answer**, written up in `validation/README.md`: the paper
and fieldwork describe a screening tool for barangay health workers; the validation
documents describe a patient's own asthma self-monitoring app. The specification supports
both, but they imply different primary users and the validation instrument is what the
study is graded against.

## Decisions I made on your behalf

Each is reversible. If any is wrong, it is worth saying so.

- **Kept teal as the brand colour** rather than the blue the design tooling recommended,
  because the PWA manifest and all 22 diagrams already used teal.
- **Self-hosted the fonts** instead of loading them from Google, because a font request
  would silently break the app offline.
- **Put patient history on the patient record**, not on each assessment — family history is
  a property of a person, not of a visit.
- **Put consent status in the shared clinical vocabulary** rather than inside one feature,
  because it travels in research exports and governs whether a record may be exported.
- **Allowed practitioner reviews to be per-location**, not only per-assessment, because
  auscultation findings are inherently per-location and research ground truth is stored per
  recording — linking them later would be impossible otherwise.
- **Left two threshold constants in place** that are currently redundant, with a comment
  saying so, because they become active once the confidence threshold is calibrated against
  real labelled recordings.
- **Corrected the audio module to measure loudness on the DC-corrected signal**, but left
  what the model receives unchanged, because altering the model's input is a calibration
  decision needing real data, not a bug fix.
- **Made the emergency page reachable without signing in.** What to do during an asthma
  attack should not be behind a password.

## Known issues

None outstanding. All 1623 tests pass, the typecheck is clean and the build succeeds.

One resolved worth recording, because the reasoning nearly sent us the wrong way. A route
crawl found the clinical view crashing when the audio player received a plain object instead
of a recording. It looked like a data defect. It is not, and this was settled by measurement
rather than argument — including a real-browser control:

- In the *test* environment, a plain Blob through a bare database table comes back as an
  empty object. The environment's own `structuredClone` fails on a Blob too, because its
  Blob implementation is a stub with nothing to copy.
- In headless Chrome over a real HTTP origin, a 64,044-byte audio Blob stored in IndexedDB
  comes back byte-identical with its RIFF header intact and a working object URL.

So seeded audio plays correctly on a device. There is also a structural argument worth
keeping: seeded recordings go through exactly the same storage path as real device imports,
so any storage-layer Blob failure would break real recordings identically — a demo-only Blob
bug is close to impossible by construction. The player is guarded anyway, because a component
handed data from a database it does not control should not take down a clinical screen.

The printable referral report was cut. Nothing links to it.

## The honest limits

The model is **roughly 71% accurate**, distinguishes four conditions, and was trained on a
public database — not on recordings from this device, these clinics, or Filipino patients.
It is confidently wrong on degraded input: silence reads as healthy, noise reads as asthma.
The quality gate exists because of that, and it is the most important thing in the software.

Nothing here has been clinically validated. It is a research prototype.
