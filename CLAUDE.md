# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Ausculta is a smart-stethoscope research project: an ESP32-based auscultation recording device (mic sensor, 16x2 I2C LCD, SD card module, Li-ion battery — see `docs/hardware-wiring-diagram-fritzing.jpg`) paired with an Edge Impulse machine-learning model that classifies stethoscope audio. Most of the repository is research documents; the only runnable code is the browser inference demo for the model.

## Running the model demo

```
cd "model/smartstethoscope-wasm-browser-simd-v5-impulse-#1/browser"
python server.py
```

Then open http://localhost:8082, paste a comma-separated list of raw feature values (an audio window matching the impulse's input frame), and click "Run inference". The port (8082) is hardcoded in `server.py`. The page must be served over HTTP — opening `index.html` via `file://` fails because the browser cannot fetch the `.wasm` module that way.

## Model architecture

The `model/.../browser/` folder is a WebAssembly deployment exported from Edge Impulse Studio (SIMD build, deploy version 5):

- `edge-impulse-standalone.js` + `edge-impulse-standalone.wasm` — the generated Emscripten module containing the full impulse (DSP + classifier). **Generated code: do not hand-edit.** To update the model, re-export the WASM deployment from Edge Impulse Studio and replace these files.
- `run-impulse.js` — hand-written wrapper class `EdgeImpulseClassifier` around the Emscripten module: `init()`, `classify(rawData)`, `classifyContinuous(rawData)`, `getProjectInfo()`, `getProperties()`, `setThreshold()`. It handles copying JS arrays into WASM heap memory and converting embind result structs back into plain JS objects. This is the integration point if the classifier is embedded into another app.
- `index.html` — minimal paste-features-and-classify demo page.

## Repository layout (non-code)

- `research-paper/` — the main Ausculta platform paper.
- `competition/rstf/` — the complete SEI-T-RSTF7 submission set (PDFs are the as-submitted versions).
- `competition/final-submission/` — ISEF 2026 / PPSci 2025 / TUKLAS submission documents and approval forms.
- `competition/drafts/` — working drafts; these are different versions from the files in `rstf/`, not copies.
- `fieldwork/` — interview recordings (Dr. Ricardo, Macarascas Clinic) and clinic documentation backing the research.

Treat the files under `competition/` as records of what was submitted — do not modify them in place; new document work belongs in `competition/drafts/` or a new folder.
