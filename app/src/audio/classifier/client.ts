import { CLASSIFIER_WORKER_URL } from '../constants'
import type { ResponseFor, WorkerRequest, WorkerRequestType, WorkerResponse } from './protocol'

interface Pending {
  resolve: (response: WorkerResponse) => void
  reject: (error: Error) => void
}

/**
 * Typed promise RPC over the classifier worker.
 *
 * Requests are serialised through a single in-flight queue: the WASM module
 * holds one classifier instance with one heap, so overlapping `classify` calls
 * would interleave `_malloc`/`_free` against it. Serialising here is simpler
 * and safer than locking inside the worker.
 *
 * The worker is spawned from a plain URL string, never `new Worker(new
 * URL(...), import.meta.url)`: routing it through Vite would turn it into a
 * module worker in dev, and `importScripts` throws in module workers.
 */
export class ClassifierClient {
  private worker: Worker | null = null
  private readonly pending = new Map<number, Pending>()
  private queue: Promise<unknown> = Promise.resolve()
  private nextId = 1
  private disposed = false

  constructor(private readonly workerUrl: string = CLASSIFIER_WORKER_URL) {}

  private ensureWorker(): Worker {
    if (this.disposed) throw new Error('ClassifierClient has been disposed')
    if (this.worker) return this.worker

    const worker = new Worker(this.workerUrl)
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      if (response.type === 'error') pending.reject(new Error(response.message))
      else pending.resolve(response)
    }
    // A worker-level error (bad URL, syntax error, failed importScripts) never
    // reaches onmessage, so every in-flight request has to be failed by hand
    // or the pipeline hangs forever.
    worker.onerror = (event: ErrorEvent) => {
      this.rejectAll(new Error(event.message || 'Classifier worker failed to start'))
    }
    worker.onmessageerror = () => {
      this.rejectAll(new Error('Classifier worker sent a message that could not be deserialised'))
    }
    this.worker = worker
    return worker
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  private send<T extends WorkerRequestType>(
    request: Omit<Extract<WorkerRequest, { type: T }>, 'id'>,
    transfer: Transferable[] = [],
  ): Promise<ResponseFor<T>> {
    const run = async (): Promise<ResponseFor<T>> => {
      const worker = this.ensureWorker()
      const id = this.nextId++
      return new Promise<ResponseFor<T>>((resolve, reject) => {
        this.pending.set(id, {
          resolve: (response) => resolve(response as ResponseFor<T>),
          reject,
        })
        worker.postMessage({ ...request, id }, transfer)
      })
    }
    // Chain regardless of how the previous request ended, but never let a
    // previous rejection become an unhandled one.
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => undefined)
    return result
  }

  /** Spawn the worker (if needed), load the model, report what it says it is. */
  load(baseUrl: string): Promise<ResponseFor<'load'>> {
    return this.send<'load'>({ type: 'load', baseUrl })
  }

  /**
   * Classify one window. `pcm`'s underlying buffer is TRANSFERRED, so the
   * caller must not reuse the array afterwards — analyze.ts hands over a
   * freshly sliced window each time.
   */
  async classify(pcm: Float32Array): Promise<Record<string, number>> {
    const response = await this.send<'classify'>({ type: 'classify', pcm }, [pcm.buffer])
    const probabilities: Record<string, number> = {}
    for (const result of response.results) probabilities[result.label] = result.value
    return probabilities
  }

  /** Clear continuous-inference state. Unused until live mic mode lands. */
  reset(): Promise<ResponseFor<'reset'>> {
    return this.send<'reset'>({ type: 'reset' })
  }

  dispose(): void {
    this.disposed = true
    this.rejectAll(new Error('Classifier was disposed'))
    this.worker?.terminate()
    this.worker = null
  }
}
