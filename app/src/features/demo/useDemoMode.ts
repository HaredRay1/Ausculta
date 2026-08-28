import { liveQuery } from 'dexie'
import { useCallback, useEffect, useState } from 'react'
import { db as defaultDb, type AuscultaDB } from '../../db/db'
import { readDemoMode, setDemoMode } from './demoMode'
import { readDemoSeedMarker, type DemoSeedMarker } from './seed'

/**
 * React bindings for demo mode.
 *
 * Backed by Dexie's `liveQuery`, so every screen reacts to the switch at once.
 * That matters more than it sounds: demo mode changes which patients exist as
 * far as the UI is concerned, and a list still showing fictional records after
 * the switch was thrown is exactly the confusion the flag exists to prevent.
 *
 * `dexie-react-hooks` is not a dependency here, so this subscribes to the
 * observable directly rather than reaching for `useLiveQuery`.
 */

export interface DemoModeState {
  /** Whether seeded records are currently visible. `false` until the first read resolves. */
  enabled: boolean
  /** `false` while the initial read is in flight — render skeletons, not "no data". */
  ready: boolean
  setEnabled: (next: boolean) => Promise<void>
}

export function useDemoMode(database: AuscultaDB = defaultDb): DemoModeState {
  const [enabled, setEnabledState] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const subscription = liveQuery(() => readDemoMode(database)).subscribe({
      next: (value) => {
        setEnabledState(value)
        setReady(true)
      },
      // A database we cannot read is a database we do not show demo rows from.
      error: () => {
        setEnabledState(false)
        setReady(true)
      },
    })
    return () => subscription.unsubscribe()
  }, [database])

  const setEnabled = useCallback(
    async (next: boolean) => {
      await setDemoMode(next, database)
    },
    [database],
  )

  return { enabled, ready, setEnabled }
}

export interface DemoSeedState {
  marker: DemoSeedMarker | null
  ready: boolean
}

/** Live view of whether this device holds seeded data, and how much. */
export function useDemoSeedStatus(database: AuscultaDB = defaultDb): DemoSeedState {
  const [marker, setMarker] = useState<DemoSeedMarker | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const subscription = liveQuery(() => readDemoSeedMarker(database)).subscribe({
      next: (value) => {
        setMarker(value)
        setReady(true)
      },
      error: () => {
        setMarker(null)
        setReady(true)
      },
    })
    return () => subscription.unsubscribe()
  }, [database])

  return { marker, ready }
}
