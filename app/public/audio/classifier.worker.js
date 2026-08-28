// @ts-check
'use strict'
/**
 * Edge Impulse classifier worker.
 *
 * This file is a PLAIN PUBLIC ASSET, not a Vite-bundled worker, and it is
 * loaded as a CLASSIC worker (`new Worker(url)` with no `type: 'module'`).
 * Both of those are load-bearing: the Emscripten glue is a classic script that
 * needs `importScripts`, which throws inside a module worker — and Vite's dev
 * server serves bundled workers as module workers.
 *
 * Protocol: see src/audio/classifier/protocol.ts. Every request carries a
 * numeric `id` and gets exactly one reply carrying the same `id`.
 */

/** The worker global, untyped so @ts-check tolerates the Emscripten globals. */
var scope = /** @type {any} */ (self)

/** @type {any} */
var classifier = null
/** @type {any} */
var cachedProjectInfo = null
/** @type {any} */
var cachedProperties = null
/** @type {string[] | null} */
var cachedLabels = null
var loaded = false

/** @param {any} message */
function post(message) {
  scope.postMessage(message)
}

/**
 * @param {number} id
 * @param {unknown} error
 */
function fail(id, error) {
  var message =
    error && typeof error === 'object' && 'message' in error
      ? String(/** @type {{ message: unknown }} */ (error).message)
      : String(error)
  post({ type: 'error', id: id, message: message })
}

/**
 * Ask the model for its own label ordering by classifying a zero vector. The
 * WASM properties struct reports only `label_count`, never the names, so this
 * is the only way to cross-check that a re-exported model still emits
 * Asthma/Bronchiolitis/Healthy/Pneumonia in that order. It doubles as a
 * warm-up of the DSP block.
 * @returns {string[] | null} null if the probe itself fails — the client then
 * falls back to checking the label count alone rather than refusing to load.
 */
function probeLabels() {
  try {
    var probe = new Float32Array(cachedProperties.input_features_count)
    var out = classifier.classify(probe)
    /** @type {string[]} */
    var labels = []
    for (var i = 0; i < out.results.length; i++) labels.push(out.results[i].label)
    return labels
  } catch (error) {
    return null
  }
}

/** @param {{ id: number, baseUrl: string }} message */
function handleLoad(message) {
  if (loaded) {
    post({
      type: 'loaded',
      id: message.id,
      projectInfo: cachedProjectInfo,
      properties: cachedProperties,
      labels: cachedLabels,
    })
    return
  }

  var baseUrl = message.baseUrl

  // MUST happen before importScripts. The glue resolves the .wasm relative to
  // the *worker's* own URL (/audio/) unless Module.locateFile is already set,
  // and it reads Module exactly once, as it is imported.
  scope.Module = {
    locateFile: function (path) {
      return baseUrl + path
    },
  }

  scope.importScripts(baseUrl + 'edge-impulse-standalone.js')
  scope.importScripts(baseUrl + 'run-impulse.js')

  // `class EdgeImpulseClassifier {}` at the top level of a classic script
  // creates a binding in the GLOBAL LEXICAL environment, NOT a property of the
  // global object, so it has to be referenced as a bare identifier —
  // `self.EdgeImpulseClassifier` is undefined. Do not "tidy" this into
  // `scope.EdgeImpulseClassifier`; there is a test that fails if you do.
  // @ts-ignore -- declared by the run-impulse.js imported immediately above.
  classifier = new EdgeImpulseClassifier()
  classifier
    .init()
    .then(function () {
      cachedProperties = classifier.getProperties()
      cachedProjectInfo = classifier.getProjectInfo()
      cachedLabels = probeLabels()
      loaded = true
      post({
        type: 'loaded',
        id: message.id,
        projectInfo: cachedProjectInfo,
        properties: cachedProperties,
        labels: cachedLabels,
      })
    })
    .catch(function (/** @type {unknown} */ error) {
      fail(message.id, error)
    })
}

/** @param {{ id: number, pcm: Float32Array }} message */
function handleClassify(message) {
  if (!loaded || !classifier) {
    fail(message.id, new Error('Classify requested before the model finished loading'))
    return
  }
  var out = classifier.classify(message.pcm)
  /** @type {{ label: string, value: number }[]} */
  var results = []
  for (var i = 0; i < out.results.length; i++) {
    results.push({ label: out.results[i].label, value: out.results[i].value })
  }
  post({ type: 'classified', id: message.id, results: results, anomaly: out.anomaly })
}

/** @param {{ id: number }} message */
function handleDispose(message) {
  classifier = null
  cachedProjectInfo = null
  cachedProperties = null
  cachedLabels = null
  loaded = false
  post({ type: 'ok', id: message.id })
}

scope.onmessage = function (/** @type {MessageEvent} */ event) {
  var message = event.data
  if (!message || typeof message.id !== 'number') return
  try {
    switch (message.type) {
      case 'load':
        handleLoad(message)
        break
      case 'classify':
        handleClassify(message)
        break
      case 'reset':
        // No continuous-inference state to clear yet; accepted so the live
        // microphone mode can use it without a protocol change.
        post({ type: 'ok', id: message.id })
        break
      case 'dispose':
        handleDispose(message)
        break
      default:
        fail(message.id, new Error('Unknown request type: ' + message.type))
    }
  } catch (error) {
    fail(message.id, error)
  }
}
