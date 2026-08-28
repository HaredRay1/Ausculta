import { CLASSIFIER_TIMEOUTS, CLASSIFIER_WORKER_URL } from '../constants'
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

  constructor(
    private readonly workerUrl: string = CLASSIFIER_WORKER_URL,
    private readonly timeouts: { loadMs: number; requestMs: number } = CLASSIFIER_TIMEOUTS,
  ) {}

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
      this.discardWorker(worker, new Error(event.message || 'Classifier worker failed to start'))
    }
    worker.onmessageerror = () => {
      this.discardWorker(
        worker,
        new Error('Classifier worker sent a message that could not be deserialised'),
      )
    }
    this.worker = worker
    return worker
  }

  /**
   * Fail everything in flight AND throw the worker away, so the next request
   * spawns a fresh one.
   *
   * Keeping a dead worker around is what turns a recoverable failure into a
   * permanent one: analyze.ts clears its cached init promise so the next call
   * can retry, and that retry would otherwise get this same corpse back and
   * post into the void.
   */
  private discardWorker(worker: Worker | null, error: Error): void {
    if (worker && this.worker === worker) {
      this.worker = null
      worker.terminate()
    }
    this.rejectAll(error)
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  private send<T extends WorkerRequestType>(
    request: Omit<Extract<WorkerRequest, { type: T }>, 'id'>,
    timeoutMs: number,
    transfer: Transferable[] = [],
  ): Promise<ResponseFor<T>> {
    const run = async (): Promise<ResponseFor<T>> => {
      const worker = this.ensureWorker()
      const id = this.nextId++
      return new Promise<ResponseFor<T>>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id)
          // A worker that missed its deadline is presumed wedged: bin it so the
          // next request starts clean rather than queueing behind a corpse.
          this.discardWorker(worker, new Error('Classifier worker was restarted after a timeout'))
          reject(
            new Error(
              `Classifier did not answer "${request.type}" within ${timeoutMs} ms and was restarted`,
            ),
          )
        }, timeoutMs)

        this.pending.set(id, {
          resolve: (response) => {
            clearTimeout(timer)
            resolve(response as ResponseFor<T>)
          },
          reject: (error) => {
            clearTimeout(timer)
            reject(error)
          },
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
    return this.send<'load'>({ type: 'load', baseUrl }, this.timeouts.loadMs)
  }

  /**
   * Classify one window. `pcm`'s underlying buffer is TRANSFERRED, so the
   * caller must not reuse the array afterwards — analyze.ts hands over a
   * freshly sliced window each time.
   */
  async classify(pcm: Float32Array): Promise<Record<string, number>> {
    const response = await this.send<'classify'>({ type: 'classify', pcm }, this.timeouts.requestMs, [
      pcm.buffer,
    ])
    const probabilities: Record<string, number> = {}
    for (const result of response.results) probabilities[result.label] = result.value
    return probabilities
  }

  /** Clear continuous-inference state. Unused until live mic mode lands. */
  reset(): Promise<ResponseFor<'reset'>> {
    return this.send<'reset'>({ type: 'reset' }, this.timeouts.requestMs)
  }

  dispose(): void {
    this.disposed = true
    this.discardWorker(this.worker, new Error('Classifier was disposed'))
  }
}
