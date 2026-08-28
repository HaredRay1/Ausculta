/**
 * Loads the REAL Edge Impulse WASM deployment outside a browser and runs
 * fixed feature vectors through it.
 *
 * Why a `vm` context rather than `require()`: the Emscripten glue opens with
 * `var Module = typeof Module != 'undefined' ? Module : {}`, so the only way
 * to hand it a configured Module is to make `Module` a pre-existing global of
 * the scope the script is evaluated in — which is exactly what a browser
 * `<script>` tag and the worker's `importScripts` do. A `require()` would give
 * the glue its own module scope, where the hoisted `var Module` shadows
 * anything we set, and the .wasm location could not be overridden.
 *
 * CommonJS (.cjs) because app/package.json declares "type": "module".
 * Not a test file and not TypeScript, so neither vitest nor tsc collects it.
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

const MODEL_DIR = path.resolve(__dirname, '..', '..', '..', 'public', 'models', 'ei-disease-v5')
const GLUE = path.join(MODEL_DIR, 'edge-impulse-standalone.js')
const RUN_IMPULSE = path.join(MODEL_DIR, 'run-impulse.js')
const WASM = path.join(MODEL_DIR, 'edge-impulse-standalone.wasm')

/** True when the deployment files are present and can be loaded. */
function modelFilesPresent() {
  return [GLUE, RUN_IMPULSE, WASM].every((file) => fs.existsSync(file))
}

/**
 * Boot the WASM impulse and return a live `EdgeImpulseClassifier`.
 * @returns {Promise<{ classifier: any, properties: any, projectInfo: any }>}
 */
async function loadRealClassifier() {
  const wasmBinary = new Uint8Array(fs.readFileSync(WASM))

  const context = {
    // Pre-seeded so the glue adopts it instead of creating its own. Supplying
    // wasmBinary means no fetch/XHR/readAsync is attempted at all.
    Module: {
      wasmBinary,
      locateFile: (file) => path.join(MODEL_DIR, file),
    },
    // Node host objects the glue expects to find on the global.
    process,
    require: createRequire(GLUE),
    __dirname: MODEL_DIR,
    __filename: GLUE,
    console,
    TextDecoder,
    TextEncoder,
    performance,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    WebAssembly,
  }
  context.global = context
  context.globalThis = context
  vm.createContext(context)

  vm.runInContext(fs.readFileSync(GLUE, 'utf8'), context, { filename: GLUE })
  vm.runInContext(fs.readFileSync(RUN_IMPULSE, 'utf8'), context, { filename: RUN_IMPULSE })

  // `class EdgeImpulseClassifier {}` at a script's top level creates a global
  // *lexical* binding, which is not a property of the context object, so it
  // has to be read back by evaluating its name in the same context.
  const EdgeImpulseClassifier = vm.runInContext('EdgeImpulseClassifier', context)
  const classifier = new EdgeImpulseClassifier()
  await classifier.init()
  return {
    classifier,
    properties: classifier.getProperties(),
    projectInfo: classifier.getProjectInfo(),
  }
}

// --- The fixed feature vectors -------------------------------------------
// Kept to formulas that can be mirrored exactly by the TypeScript test
// helpers, and each fixture records a checksum so a drift between the two
// definitions fails loudly instead of silently comparing different audio.

const WINDOW = 16000
const SAMPLE_RATE = 16000
const FULL_SCALE = 32768

function zeros() {
  return new Float32Array(WINDOW)
}

function sine440() {
  const out = new Float32Array(WINDOW)
  for (let i = 0; i < WINDOW; i++) {
    out[i] = 0.5 * FULL_SCALE * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE)
  }
  return out
}

function seededNoise() {
  let state = 12345 >>> 0
  const out = new Float32Array(WINDOW)
  for (let i = 0; i < WINDOW; i++) {
    state = (state * 1664525 + 1013904223) >>> 0
    out[i] = 0.2 * FULL_SCALE * ((state / 4294967296) * 2 - 1)
  }
  return out
}

const VECTORS = {
  zeros: zeros,
  'sine-440hz': sine440,
  'seeded-noise': seededNoise,
}

/** Mean sample value — cheap, order-stable fingerprint of a vector. */
function checksum(vector) {
  let sum = 0
  for (let i = 0; i < vector.length; i++) sum += vector[i]
  return sum / vector.length
}

/**
 * Run every fixed vector through the real model.
 * @returns {Promise<object>} the fixture document.
 */
async function captureFixtures() {
  const { classifier, properties, projectInfo } = await loadRealClassifier()
  /** @type {Record<string, any>} */
  const vectors = {}
  for (const [name, build] of Object.entries(VECTORS)) {
    const input = build()
    const output = classifier.classify(input)
    /** @type {Record<string, number>} */
    const probabilities = {}
    for (const result of output.results) probabilities[result.label] = result.value
    vectors[name] = { checksum: checksum(input), probabilities }
  }
  return {
    capturedFrom: 'public/models/ei-disease-v5 (real WASM, run headless in Node)',
    windowSamples: WINDOW,
    sampleRate: SAMPLE_RATE,
    runtime: {
      frequency: properties.frequency,
      input_features_count: properties.input_features_count,
      label_count: properties.label_count,
      slice_size: properties.slice_size,
      model_type: properties.model_type,
      deploy_version: projectInfo.deploy_version,
    },
    vectors,
  }
}

module.exports = { VECTORS, captureFixtures, checksum, loadRealClassifier, modelFilesPresent }

// `node runRealModel.cjs --write` refreshes the checked-in fixture file.
if (require.main === module) {
  captureFixtures()
    .then((document) => {
      const target = path.join(__dirname, 'wasm-fixtures.json')
      const json = JSON.stringify(document, null, 2) + '\n'
      if (process.argv.includes('--write')) {
        fs.writeFileSync(target, json)
        console.log('wrote ' + target)
      } else {
        console.log(json)
      }
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
