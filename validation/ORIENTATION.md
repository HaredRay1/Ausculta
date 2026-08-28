# Ausculta — orientation for validators

Read this before evaluating the prototype. It takes two minutes and it will keep you from
drawing conclusions the software cannot support.

## What Ausculta is

A research prototype pairing a low-cost smart stethoscope with a phone app. The device
records lung sounds to a memory card; the app imports them, checks the recording is usable,
runs a machine-learning model **on the phone itself** with no internet connection, and
presents an early-warning result for a qualified practitioner to review.

It is built for barangay health workers and patients in rural Palawan, where clinics
commonly have a stethoscope and little else — no x-ray, no laboratory, and often no mobile
signal.

## What Ausculta is not

**It is not a medical device. It does not diagnose. It is not a substitute for
professional medical consultation.** Nothing it displays has been clinically validated.

Please do not use it to make any decision about a real patient, and please do not treat any
result you see during evaluation as information about anyone's actual health.

## Before you start

**The data in the app is invented.** Every patient, assessment and recording you will see
was generated for demonstration. They are labelled as such on screen — if you ever see
clinical data that is *not* labelled fictional, that is a defect and we would like to know.

**No real patient information has been entered into this prototype.**

## What is real, and what is a placeholder

Being straight about this is more useful to us than looking finished.

| Capability | Status |
|---|---|
| Recording import from the device, and the audio quality check | Real and working |
| The machine-learning classification | Real — runs on the device, offline |
| Signing in, roles, account approval | Real |
| Patient records, consent capture, history | Real |
| Practitioner review of AI results | Real |
| Instructional diagrams for device use and stethoscope placement | Real |
| Severity score (a 0–100 number) | **Not built.** No model exists. The app says so and shows no number. |
| Cloud sync between devices | **Not built.** Everything stays on one phone. |
| Bluetooth connection to the stethoscope | **Not built.** Files move by memory card. |
| Camera-guided stethoscope placement | **Removed** in favour of the printed-style diagrams |
| Filipino translation of consent and safety text | **Not done.** Requires a human translator and clinical review; the app shows approved English with a notice. |

## Honest limits of the model

The classifier is roughly **71% accurate**. It was trained on a public database of
respiratory sounds — not on recordings from this device, from these clinics, or from
Filipino patients. It distinguishes four categories and it can be wrong about any of them.

It is also fragile on poor input. Fed silence, it will confidently report "healthy". Fed
noise, it will confidently report asthma. This is why the app checks recording quality
*before* running the model and refuses to answer when the recording is unusable. **That
refusal is the most important behaviour in the software**, and it is worth deliberately
testing: try importing a recording made with the microphone off the chest.

Because of that fragility, the app never states a diagnosis. A finding is phrased as a
sound pattern that *may* suggest a condition, always accompanied by advice to consult a
physician. A clean result always carries "this does not rule out illness", because a
71%-accurate screening tool saying "healthy" must never be heard as "you are fine".

## What we would most like to learn from you

- Could you find what you were looking for without being told where it was?
- Was anything unclear, ambiguous, or easy to misread?
- Does anything overstate what the app knows, or read as more certain than it should?
- For clinicians: is anything here clinically inappropriate, misleading, or unsafe? Is the
  separation between what the machine produced and what a practitioner concluded clear
  enough on screen?
- What would you add or remove?

Negative findings are more useful to us than positive ones. If something is confusing,
that is a defect in the software, not a failing on your part.

## Known rough edges

Some parts are less finished than others, and some screens exist so that a path is not a
dead end rather than because the feature behind them is complete. Where you find one, say
so — but please read the table above first, so that time is not spent reporting things we
already know are absent.
