import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassifierClient } from '../classifier/client'
import type { WorkerRequest, WorkerResponse } from '../classifier/protocol'

/**
 * A scripted stand-in for the browser's Worker. It records what the client
 * posted (including the transfer list) and replies only when the test says so,
 * which is what makes the queueing and correlation behaviour observable.
 */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  readonly posted: { request: WorkerRequest; transfer: Transferable[] }[] = []
  terminated = false

  constructor(readonly url: string) {
    FakeWorker.instances.push(this)
  }

  postMessage(request: WorkerRequest, transfer: Transferable[] = []): void {
    this.posted.push({ request, transfer })
  }

  terminate(): void {
    this.terminated = true
  }

  reply(response: WorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>)
  }

  /** Reply to the Nth request the client sent, reusing its id. */
  replyTo(index: number, response: Omit<WorkerResponse, 'id'>): void {
    this.reply({ ...response, id: this.posted[index].request.id } as WorkerResponse)
  }
}

const loadedPayload = {
  type: 'loaded' as const,
  projectInfo: {
    project_id: 1,
    project_owner: 'Ausculta',
    project_name: 'SmartStethoscope',
    impulse_id: 1,
    impulse_name: 'impulse',
    deploy_version: 5,
  },
  properties: {
    frequency: 16000,
    input_features_count: 16000,
    label_count: 4,
    slice_size: 4000,
    interval_ms: 0.0625,
    model_type: 'classification',
    has_anomaly: 0,
  },
  labels: ['Asthma', 'Bronchiolitis', 'Healthy', 'Pneumonia'],
}

let client: ClassifierClient

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  client = new ClassifierClient('/audio/classifier.worker.js')
})

afterEach(() => {
  client.dispose()
  vi.unstubAllGlobals()
})

const worker = () => FakeWorker.instances[0]

/**
 * Requests are posted from the client's serialising queue, i.e. on a
 * microtask, so tests have to let the queue run before inspecting the worker.
 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Swallow the rejection dispose() delivers to work left in flight. */
const ignoreRejection = (promise: Promise<unknown>) => {
  promise.catch(() => undefined)
  return promise
}

describe('ClassifierClient', () => {
  it('does not spawn a worker until the first request', async () => {
    expect(FakeWorker.instances).toHaveLength(0)
    ignoreRejection(client.load('/models/ei-disease-v5/'))
    await flush()
    expect(FakeWorker.instances).toHaveLength(1)
    expect(worker().url).toBe('/audio/classifier.worker.js')
  })

  it('resolves load with what the worker reported', async () => {
    const promise = client.load('/models/ei-disease-v5/')
    await flush()
    expect(worker().posted[0].request).toMatchObject({
      type: 'load',
      baseUrl: '/models/ei-disease-v5/',
    })
    worker().replyTo(0, loadedPayload)
    await expect(promise).resolves.toMatchObject({ labels: loadedPayload.labels })
  })

  it('turns classification results into a probability record', async () => {
    const promise = client.classify(new Float32Array([1, 2, 3]))
    await flush()
    worker().replyTo(0, {
      type: 'classified',
      results: [
        { label: 'Asthma', value: 0.1 },
        { label: 'Healthy', value: 0.9 },
      ],
      anomaly: 0,
    })
    await expect(promise).resolves.toEqual({ Asthma: 0.1, Healthy: 0.9 })
  })

  it('transfers the sample buffer instead of copying it', async () => {
    const pcm = new Float32Array([1, 2, 3])
    const buffer = pcm.buffer
    const promise = client.classify(pcm)
    await flush()
    expect(worker().posted[0].transfer).toEqual([buffer])
    worker().replyTo(0, { type: 'classified', results: [], anomaly: 0 })
    await promise
  })

  it('serialises requests: the second is not posted until the first replies', async () => {
    const first = client.classify(new Float32Array([1]))
    const second = client.classify(new Float32Array([2]))
    await flush()

    expect(worker().posted).toHaveLength(1)
    worker().replyTo(0, { type: 'classified', results: [{ label: 'Healthy', value: 1 }], anomaly: 0 })
    await first
    await flush()

    expect(worker().posted).toHaveLength(2)
    worker().replyTo(1, { type: 'classified', results: [{ label: 'Asthma', value: 1 }], anomaly: 0 })
    await expect(second).resolves.toEqual({ Asthma: 1 })
  })

  it('keeps draining the queue after a request fails', async () => {
    const first = client.classify(new Float32Array([1]))
    const second = client.classify(new Float32Array([2]))
    await flush()

    worker().replyTo(0, { type: 'error', message: 'Classification failed (err code: -6)' })
    await expect(first).rejects.toThrow('Classification failed (err code: -6)')
    await flush()

    expect(worker().posted).toHaveLength(2)
    worker().replyTo(1, { type: 'classified', results: [{ label: 'Healthy', value: 1 }], anomaly: 0 })
    await expect(second).resolves.toEqual({ Healthy: 1 })
  })

  it('correlates replies by id rather than by arrival order', async () => {
    const first = client.load('/models/ei-disease-v5/')
    await flush()
    worker().replyTo(0, loadedPayload)
    await first

    const second = client.classify(new Float32Array([1]))
    await flush()
    // A late duplicate of the first reply must not resolve the second request.
    worker().replyTo(0, loadedPayload)
    worker().replyTo(1, { type: 'classified', results: [{ label: 'Healthy', value: 1 }], anomaly: 0 })
    await expect(second).resolves.toEqual({ Healthy: 1 })
  })

  it('fails in-flight requests when the worker itself errors', async () => {
    const promise = client.classify(new Float32Array([1]))
    await flush()
    worker().onerror?.({ message: 'importScripts failed' } as ErrorEvent)
    await expect(promise).rejects.toThrow('importScripts failed')
  })

  it('fails in-flight requests on an undeserialisable message', async () => {
    const promise = client.classify(new Float32Array([1]))
    await flush()
    worker().onmessageerror?.()
    await expect(promise).rejects.toThrow(/deserialised/)
  })

  it('terminates the worker and rejects pending work on dispose', async () => {
    const promise = client.classify(new Float32Array([1]))
    await flush()
    client.dispose()
    await expect(promise).rejects.toThrow('Classifier was disposed')
    expect(worker().terminated).toBe(true)
  })

  it('refuses further requests once disposed', async () => {
    client.dispose()
    await expect(client.classify(new Float32Array([1]))).rejects.toThrow('has been disposed')
  })

  it('ignores replies for requests it never made', async () => {
    const promise = client.classify(new Float32Array([1]))
    await flush()
    worker().reply({ type: 'error', id: 9999, message: 'stray' })
    worker().replyTo(0, { type: 'classified', results: [{ label: 'Healthy', value: 1 }], anomaly: 0 })
    await expect(promise).resolves.toEqual({ Healthy: 1 })
  })
})
