# Ausculta app

An offline-first progressive web app for smart-stethoscope respiratory screening. React 18,
TypeScript, Vite, IndexedDB via Dexie. No backend — everything runs on the device.

## Running it

```
npm install
npm run dev
```

Open the printed URL. On first launch the app seeds a fictional clinic — seven patients
with assessments and recordings — so it is explorable immediately. Nothing is seeded on a
device that already holds a real patient.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run dev -- --host` | Same, reachable from a phone on the same network |
| `npm run build` | Production build (typechecks first) |
| `npm run preview` | Serve the production build |
| `npm test` | Full test suite |
| `npm run sync-model` | Re-copy the Edge Impulse model from `../model/` after a re-export |

## Trying it on an Android phone

Serve the built app over HTTPS, open it in Chrome, and choose "Add to Home screen". It
installs like a native app, and after the first load everything — including the 8 MB model —
is cached on the device and works with no network.

`npm run dev -- --host` is enough for testing on a phone on the same Wi-Fi, though a
service worker needs a secure context, so full offline behaviour needs HTTPS or localhost.

## Exercising it without the hardware

`../samples/` holds five recordings in the device's exact format. Three of them — silence, a
pure tone, white noise — must be **rejected** by the quality check. One passes and reaches
the model. Importing the silent one is the single most informative thing you can do: the
raw model scores silence as "healthy" at 98.8% confidence, and watching the app refuse to
answer is the behaviour the whole design rests on.

## Layout

```
src/
  audio/       Decode, quality gate, windowing, the model in a Web Worker. index.ts is
               the only import surface — nothing above it touches the classifier.
  db/          Dexie schema, record types, and codes.ts — the clinical vocabulary.
  auth/        Offline accounts, roles, route guards, PBKDF2 hashing.
  design/      Tokens and the component gallery.
  components/  The shared component library, including the clinical ones.
  features/    One folder per area, each exporting its routes as data.
  i18n/        English and Filipino bundles.
public/
  models/      The Edge Impulse export. Generated — never hand-edit.
  audio/       The classifier worker and capture worklet, served as plain scripts.
  guides/      Instructional diagrams.
```

## Things that will bite you

**Clinical values are stored as codes, never as display text.** A wheeze is `WHEEZE` in the
database and becomes readable text only at render. The app is bilingual and research data
leaves the clinic; storing translated strings would corrupt both. `codes.ts` is the registry
and a test asserts every code has an English display string.

**Features do not edit the router.** Each exports a `routes.tsx` with a route array, and
`src/router.tsx` mounts it. This is what let several people build simultaneously without
collisions. Two ordering traps live there: `/patients/new` must precede `/patients/:id`, and
`/review/:id/decide` must precede `/review/:id`, or the parameterised route swallows them.

**Never use Tailwind palette classes or raw hex in feature code.** Use the semantic tokens
(`bg-surface`, `text-on-surface`, `text-muted`, `border-border`, and the status families).
Tailwind bakes palette values in at build time, so a palette class silently ignores the dark
theme. Elevation is `elevation-1/2/3`, never `shadow-*`, for the same reason.

**The model files must stay unbundled in `public/models/`.** The Emscripten output is a
classic script expecting a global, and the worker must set `Module.locateFile` before
importing it or the `.wasm` is looked for in the wrong directory.

**The app must never fabricate a clinical value.** Missing capabilities render a
"not connected" panel; uncertain and poor-quality results render no number at all. There are
tests asserting exactly this, and they are not negotiable — see `/status` in the running app
for what is and is not built.

## Testing notes

Run the suite with agents or editors idle: concurrent file writes produce failures that are
not real. Signal-processing logic is tested against synthetic signals with known properties,
and the model's real behaviour is pinned by fixtures captured from the actual WebAssembly
build, which runs headlessly under Node in about 70 milliseconds. A model re-export that
changes behaviour therefore fails the suite instead of shipping quietly.
