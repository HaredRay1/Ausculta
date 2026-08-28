# Instructional guide diagrams

Text-free instructional SVGs for the Ausculta PWA. Fieldwork found that older
clinic staff often will not read instructions, and that everyone asked for a
simple, icon-based interface with built-in training support. So **the picture
carries the meaning on its own** — the app renders a translated caption beneath
it, and the diagram must still be understandable if nobody reads that caption.

This README is documentation, not shipped UI, so prose is fine here. The SVGs
themselves contain no words.

---

## Lung auscultation placement — one position per file

A front (anterior) view of the same figure at the same scale and angle in all
six, so a health worker flipping between them sees only the chestpiece move.
The five positions not in use are drawn as faint dashed circles for context.

| File | Depicts | Caption to display |
| --- | --- | --- |
| `placement-R_UPPER.svg` | Chestpiece on the patient's right upper lung zone — 2nd intercostal space, midclavicular line, just below the collarbone. | Position 1 — patient's right upper chest, just below the collarbone. |
| `placement-L_UPPER.svg` | Chestpiece on the patient's left upper lung zone — 2nd intercostal space, midclavicular line. | Position 2 — patient's left upper chest, just below the collarbone. |
| `placement-R_MIDDLE.svg` | Chestpiece on the patient's right middle lung zone — 4th intercostal space, midclavicular line. | Position 3 — patient's right middle chest, level with the nipple line. |
| `placement-L_MIDDLE.svg` | Chestpiece on the patient's left middle lung zone — 4th intercostal space, midclavicular line. | Position 4 — patient's left middle chest, level with the nipple line. |
| `placement-R_LOWER.svg` | Chestpiece on the patient's right lower lung zone — 6th intercostal space, drifting slightly lateral, above the rib margin. | Position 5 — patient's right lower chest, just above the bottom of the ribs. |
| `placement-L_LOWER.svg` | Chestpiece on the patient's left lower lung zone — 6th intercostal space, drifting slightly lateral, above the rib margin. | Position 6 — patient's left lower chest, just above the bottom of the ribs. |

## Position picker

| File | Depicts | Caption to display |
| --- | --- | --- |
| `lung-map-overview.svg` | The same figure with all six positions at once as large numbered targets, numbered in listening order (right/left pairs, top to bottom). | Tap a position to record it. Work through 1 to 6 in order. |

## Device usage sequence — one file per step

Each carries its step number as a badge in the top-left corner.

| File | Depicts | Caption to display |
| --- | --- | --- |
| `device-01-power-on.svg` | A finger flicking the side power switch up; the display wakes. A power symbol marks the switch. | Slide the power switch up. The screen lights up. |
| `device-02-insert-sd.svg` | The microSD card sliding into the slot in the side of the recorder, contacts first. | Push the memory card into the slot until it stops. |
| `device-03-place-chest.svg` | The chestpiece held flat against the skin of the chest, tubing running to the recorder. | Hold the round chestpiece flat against the patient's bare skin. |
| `device-04-press-record.svg` | A finger pressing the single push button once; a tap ripple marks the press. | Press the button once to start recording. |
| `device-05-recording.svg` | The indicator light lit and a waveform on the display; beside it, a patient breathing in and out through an open mouth, and a stay-quiet gesture. | Recording. Keep still and quiet. The patient breathes normally through an open mouth. |
| `device-06-stop-save.svg` | A second press of the same button; a tick on the display and the recording dropping onto the memory card. | Press the button again to stop. The recording is saved to the card. |
| `device-07-remove-sd.svg` | The recorder dark and switched off, then the card sliding out; a dashed arc runs from the switch to the card to show that order. | Switch the recorder off first, then take the card out. |
| `device-08-import-to-app.svg` | The memory card, an arrow, and the phone showing the transferred recordings in the app. | Copy the recordings from the card into the app. |
| `device-09-clean.svg` | A cloth wiping the chestpiece with a disinfectant drop and a circular wiping motion, between one patient and the next. | Wipe and disinfect the chestpiece before the next patient. |
| `device-10-charge-battery.svg` | A USB lead plugged into the socket on the recorder, with a battery filling and a charging bolt. | Charge the battery by plugging in the USB lead. |

> **`device-10` is unverified.** The wiring diagram shows the battery running
> through a boost converter to the power switch and draws no charging module, so
> the diagram assumes charging happens through the micro-USB port on the ESP32
> board itself. That port certainly exists, but that it is the intended charging
> path has **not** been confirmed against the physical device. Check it before
> this diagram is shown to any health worker, and redraw it if the real hardware
> charges some other way.

## Mistakes that ruin a recording

The app runs an automatic quality check before analysis and rejects recordings
that are too quiet, too noisy or clipped. Each of these four mistakes produces
exactly such a rejection, and nothing else tells the health worker why. Each
file shows the wrong way and the right way side by side — wrong on the left
under a cross, right on the right under a tick.

Captions state the correct action rather than scolding: a working nurse reads
"Place the chestpiece directly on bare skin" better than "Do not place it over
clothing."

| File | Depicts | Caption to display |
| --- | --- | --- |
| `mistake-01-over-clothing.svg` | Left: the chestpiece pressed on a layer of clothing, the fabric scraping against it. Right: the clothing folded back and the chestpiece flat on bare skin. | Place the chestpiece directly on bare skin. Move clothing out of the way first. |
| `mistake-02-loose-contact.svg` | Left: the chestpiece tilted so only one edge touches, with a gap under it and room noise getting in. Right: the whole rim flat on the chest with light, even pressure. | Hold the whole rim flat against the chest with light, even pressure. |
| `mistake-03-talking-moving.svg` | Left: the patient talking and shifting about. Right: the patient sitting still, breathing through an open mouth. | Ask the patient to sit still and breathe deeply through an open mouth. |
| `mistake-04-noisy-room.svg` | Left: a fan running and someone talking nearby. Right: the same recording with the fan off and nobody talking. | Record in a quiet room. Switch off fans and ask others not to talk. |

---

## Naming convention

Keep new files consistent with these four shapes.

**`placement-<SIDE>_<LEVEL>.svg`** — one auscultation site per file.
`SIDE` is `R` or `L` and always means the **patient's own** right or left, never
the viewer's. `LEVEL` is `UPPER`, `MIDDLE` or `LOWER`. The `<SIDE>_<LEVEL>` part
is the position key the app uses, so filename and key stay in step. A new site
extends the same shape — posterior zones would be
`placement-R_POSTERIOR_LOWER.svg`, a lateral zone `placement-L_LATERAL.svg`.

**`<subject>-map-overview.svg`** — the picker showing every position of one set
at once, e.g. `lung-map-overview.svg`. A heart-sound set would add
`heart-map-overview.svg` alongside `placement-*` files of its own.

**`device-<NN>-<kebab-slug>.svg`** — one step of a procedure. `NN` is a
zero-padded two-digit number giving the order the steps are performed in, so the
files sort into sequence. Inserting a step means renumbering the ones after it
**and** redrawing their number badges — the badge is baked into the artwork.
Leaving gaps (`10`, `20`, `30`) is the easier option if more steps are expected.

**`mistake-<NN>-<kebab-slug>.svg`** — one wrong/right comparison per file, in a
`0 0 320 200` frame split into two panels: the mistake on the left under a
cross, the correct action on the right under a tick. `NN` orders them but they
are independent, so numbers can be added at the end without renumbering. The
slug names the mistake, not the fix, so the file is findable from the quality
check that rejected the recording.

## Drawing rules

Any new diagram must follow these, or it will not match the set.

- **No text inside the image.** The app is bilingual (English and Filipino) and
  its spec forbids baking translatable text into graphics. Only digits for
  ordering and universally understood symbols (arrow, tick, power symbol,
  droplet) are allowed. Digits are drawn as vector paths, not as `<text>`, so
  nothing depends on a font being installed.
- **Hand-authored SVG.** No external references, no embedded raster images, no
  fonts, no stylesheets. Every file parses as standalone XML.
- **`viewBox`, no fixed size.** `0 0 320 340` for the figure diagrams, `0 0 320
  260` for the device steps, `0 0 320 200` for the wrong/right comparisons.
  Designed to be legible at 320 px wide on a phone.
- **Transparent background.** They render on white cards; no background rect.
- **Palette.** Dark ink `#0f172a` for line work, teal `#0d9488` for the thing the
  viewer must look at, `#94a3b8` for background anatomy and inactive markers,
  `#ffffff` only as an opaque fill inside a shape. Nothing else.
- **Never colour alone.** Every meaning is also carried by shape, position or
  outline. The active chestpiece is a filled disc *and* has concentric
  diaphragm rings *and* a dashed target halo *and* a stem; inactive positions
  are empty dashed circles. The set has been checked in greyscale and under a
  deuteranopia simulation.
- **A `<title>` element** as the first child, in English, for screen readers.

A shared visual vocabulary runs through the set, so a mark means the same thing
everywhere. Teal marks what to do or where to look; ink marks what is happening
to you. Concentric arcs are unwanted sound — leaking through a gap, coming off
a fan, coming out of someone's mouth. Short radiating strokes are friction.
Solid arrows are movement or an instruction. A cross is the wrong way, a tick
the right way.

## Orientation convention — read this before editing the figure

The figure is drawn **anterior (from the front)**: the viewer is facing the
patient. That means the **patient's right lung appears on the viewer's LEFT**,
at a smaller `x`. Getting this backwards would cause real mis-recorded data, so
three independent, text-free cues encode it and no single one has to carry it:

1. A forward-facing face, which fixes the view as anterior rather than posterior.
2. Lung asymmetry — the right lung has three lobes (two fissures), the left lung
   two lobes (one fissure) with a cardiac notch bitten out of its medial border.
3. A heart glyph sitting to the patient's left of the midline.

The figure is generated by drawing only the left half of the body and arms and
mirroring it about `x = 160`, so the silhouette is exactly symmetrical and the
midline is unambiguous. The lungs and heart are deliberately *not* mirrored —
that asymmetry is the orientation cue. If you redraw them, keep the three-lobed
lung on the viewer's left.
