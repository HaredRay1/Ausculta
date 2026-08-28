/**
 * Message contract between the app and public/audio/classifier.worker.js.
 * Every request carries a numeric `id`; exactly one response comes back
 * carrying the same `id`.
 */

/** Shape of `EdgeImpulseClassifier.getProjectInfo()`. */
export interface RuntimeProjectInfo {
  project_id: number
  project_owner: string
  project_name: string
  impulse_id: number
  impulse_name: string
  deploy_version: number
}

/** Shape of `EdgeImpulseClassifier.getProperties()`. */
export interface RuntimeProperties {
  frequency: number
  input_features_count: number
  label_count: number
  slice_size: number
  interval_ms: number
  model_type: string
  has_anomaly: number | boolean
}

export interface LabelScore {
  label: string
  value: number
}

export type WorkerRequest =
  | { type: 'load'; id: number; baseUrl: string }
  | { type: 'classify'; id: number; pcm: Float32Array }
  | { type: 'reset'; id: number }
  | { type: 'dispose'; id: number }

export type WorkerResponse =
  | {
      type: 'loaded'
      id: number
      projectInfo: RuntimeProjectInfo
      properties: RuntimeProperties
      /** Label order read back from the model, or null if the probe failed. */
      labels: string[] | null
    }
  | { type: 'classified'; id: number; results: LabelScore[]; anomaly: number }
  | { type: 'ok'; id: number }
  | { type: 'error'; id: number; message: string }

export type WorkerRequestType = WorkerRequest['type']

/** Response type expected for each request type. */
export type ResponseFor<T extends WorkerRequestType> = T extends 'load'
  ? Extract<WorkerResponse, { type: 'loaded' }>
  : T extends 'classify'
    ? Extract<WorkerResponse, { type: 'classified' }>
    : Extract<WorkerResponse, { type: 'ok' }>
