/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_MODEL_ID, INT16_FULL_SCALE, MODEL_REGISTRY } from '../constants'
import type { WorkerResponse } from '../classifier/protocol'
import { sineWave } from './signals'

/**
 * Runs public/audio/classifier.worker.js — the actual shipped file, unmodified
 * — against the actual WASM deployment.
 *
 * The worker is evaluated inside a `vm` context standing in for the worker
 * global scope, with `importScripts` wired to evaluate scripts in that same
 * context. That is precisely how a real classic worker behaves, so the thing
 * this exercises is the thing the brief warns about: `Module.locateFile` has to
 * be assigned BEFORE importScripts, or the glue resolves the 8 MB .wasm against
 * the worker's own URL and the load fails. Here `baseUrl` is a filesystem
 * directory that shares no prefix with the worker's location, so a broken
 * locateFile cannot accidentally succeed.
 */

const WORKER_FILE = path.resolve(__dirname, '..', '..', '..', 'public', 'audio', 'classifier.worker.js')
const MODEL_DIR = path.resolve(__dirname, '..', '..', '..', 'public', 'models', 'ei-disease-v5')
const BASE_URL = MODEL_DIR + path.sep
const ENTRY = MODEL_REGISTRY[DEFAULT_MODEL_ID]

const assetsPresent =
  existsSync(WORKER_FILE) && existsSync(path.join(MODEL_DIR, 'edge-impulse-standalone.wasm'))

interface WorkerHarness {
  send(request: Record<string, unknown>): Promise<WorkerResponse>
  /** Scripts importScripts() was asked for, in order. */
  imported: string[]
  /** Whether Module was already configured when the first import happened. */
  moduleConfiguredBeforeFirstImport: boolean
}

function startWorker(): WorkerHarness {
  const replies: WorkerResponse[] = []
  const waiters = new Map<number, (response: WorkerResponse) => void>()
  const imported: string[] = []
  let moduleConfiguredBeforeFirstImport = false

  const context: Record<string, unknown> = {
    console,
    process,
    TextDecoder,
    TextEncoder,
    performance,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    WebAssembly,
    // The glue's Node branch resolves 'fs' and 'path' through require().
    require: createRequire(import.meta.url),
  }
  context.__dirname = MODEL_DIR
  context.importScripts = (url: string) => {
    if (imported.length === 0) {
      const configured = context.Module as { locateFile?: unknown } | undefined
      moduleConfiguredBeforeFirstImport = typeof configured?.locateFile === 'function'
    }
    imported.push(url)
    vm.runInContext(readFileSync(url, 'utf8'), context, { filename: url })
  }
  context.postMessage = (message: WorkerResponse) => {
    replies.push(message)
    waiters.get(message.id)?.(message)
  }
  context.self = context
  context.globalThis = context
  context.global = context

  vm.createContext(context)
  vm.runInContext(readFileSync(WORKER_FILE, 'utf8'), context, { filename: WORKER_FILE })

  return {
    imported,
    get moduleConfiguredBeforeFirstImport() {
      return moduleConfiguredBeforeFirstImport
    },
    send(request) {
      const promise = new Promise<WorkerResponse>((resolve) => {
        const existing = replies.find((reply) => reply.id === request.id)
        if (existing) resolve(existing)
        else waiters.set(request.id as number, resolve)
      })
      ;(context.onmessage as (event: { data: unknown }) => void)({ data: request })
      return promise
    },
  }
}

/**
 * Guard against the Tier-2 safety layer disappearing green. The suites below
 * are skipIf-guarded because they cannot run without the deployment, but a
 * missing model must FAIL here, loudly, rather than silently taking the
 * silence/sine/noise safety assertions out of the run with it.
 */
describe('the Edge Impulse deployment files', () => {
  it('are committed, so the real-WASM suites cannot silently skip', () => {
    expect(assetsPresent).toBe(true)
  })
})

describe.skipIf(!assetsPresent)('classifier.worker.js against the real WASM', () => {
  let worker: WorkerHarness
  let loaded: Extract<WorkerResponse, { type: 'loaded' }>

  beforeAll(async () => {
    worker = startWorker()
    const response = await worker.send({ type: 'load', id: 1, baseUrl: BASE_URL })
    if (response.type === 'error') throw new Error('worker load failed: ' + response.message)
    expect(response.type).toBe('loaded')
    loaded = response as Extract<WorkerResponse, { type: 'loaded' }>
  }, 60_000)

  it('configures Module.locateFile before it imports the Emscripten glue', () => {
    expect(worker.moduleConfiguredBeforeFirstImport).toBe(true)
    expect(worker.imported).toEqual([
      BASE_URL + 'edge-impulse-standalone.js',
      BASE_URL + 'run-impulse.js',
    ])
  })

  it('reports the model the registry expects, including the label order', () => {
    expect(loaded.labels).toEqual([...ENTRY.labels])
    expect(loaded.properties.frequency).toBe(ENTRY.frequencyHz)
    expect(loaded.properties.input_features_count).toBe(ENTRY.windowSamples)
    expect(loaded.properties.slice_size).toBe(ENTRY.sliceSamples)
    expect(loaded.projectInfo.deploy_version).toBe(ENTRY.deployVersion)
  })

  it('classifies a window and answers on the request id', async () => {
    const pcm = sineWave(440, 0.5 * INT16_FULL_SCALE, ENTRY.windowSamples)
    const response = await worker.send({ type: 'classify', id: 2, pcm })
    expect(response.type).toBe('classified')
    const classified = response as Extract<WorkerResponse, { type: 'classified' }>
    expect(classified.id).toBe(2)
    expect(classified.results.map((r) => r.label)).toEqual([...ENTRY.labels])
    const total = classified.results.reduce((sum, r) => sum + r.value, 0)
    expect(total).toBeCloseTo(1, 2)
  })

  it('answers a repeat load from cache without importing anything again', async () => {
    const response = await worker.send({ type: 'load', id: 3, baseUrl: BASE_URL })
    expect(response.type).toBe('loaded')
    expect(worker.imported).toHaveLength(2)
  })

  it('accepts reset as a no-op for the future live mode', async () => {
    await expect(worker.send({ type: 'reset', id: 4 })).resolves.toMatchObject({
      type: 'ok',
      id: 4,
    })
  })

  it('reports an unknown request type as an error rather than going silent', async () => {
    await expect(worker.send({ type: 'nonsense', id: 5 })).resolves.toMatchObject({
      type: 'error',
      id: 5,
      message: expect.stringContaining('Unknown request type'),
    })
  })

  it('refuses to classify before the model is loaded instead of crashing', async () => {
    const fresh = startWorker()
    await expect(fresh.send({ type: 'classify', id: 1, pcm: new Float32Array(16000) })).resolves.toMatchObject({
      type: 'error',
      message: expect.stringContaining('before the model finished loading'),
    })
  })
})
