# Test recordings

Synthetic WAV files for exercising the app's import and analysis path without the physical
device. All are 16 kHz, 16-bit, mono — the exact format the ESP32 firmware writes.

**These are not lung sounds.** They are generated signals with known properties, made to
prove the app behaves correctly on each kind of input. Do not use them to judge the model's
clinical accuracy, and never show them to a validator as if they were real recordings.

| File | What it is | What the app should do |
|---|---|---|
| `01-silence.wav` | Digital silence | **Reject — too quiet.** This is the important one: the raw model scores silence as "Healthy" at 0.988 confidence. The quality gate must stop it before the model ever sees it. |
| `02-pure-tone.wav` | 440 Hz sine wave | **Reject — tonal.** Nothing in a chest sounds like a pure tone. |
| `03-white-noise.wav` | White noise | **Reject — noise-like.** The raw model scores this as Asthma at 0.996. |
| `04-breath-like.wav` | Low-passed noise modulated at ~0.25 Hz, roughly a four-second breath cycle, peak −11 dBFS | **Pass the gate and reach the model.** The verdict it produces is not meaningful clinically — the point is that the pipeline runs end to end, and that something gets through. |
| `05-clipped.wav` | A square wave at full scale | **Flag clipping.** Simulates the microphone gain set too high. |

The first three are the app's safety behaviour made visible: on garbage input it refuses to
answer rather than answering confidently and wrongly. That refusal is the single most
important thing this software does.

## Regenerating

These were produced by a short script using only the Python standard library; the
generation parameters are recorded in the repository history for the commit that added this
folder. Any 16 kHz mono 16-bit WAV will work as an import test.
