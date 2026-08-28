import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import {
  EMPTY_OVERVIEW,
  patientRepository as defaultRepository,
  type PatientOverview,
  type PatientRepository,
} from './patientRepository'

/**
 * The signed-in patient's whole record, loaded once per screen.
 *
 * One hook rather than a query per screen: a patient's record is a handful of
 * visits and at most a few dozen recordings, so loading all of it is cheaper
 * than the coordination needed to load parts of it, and it means every screen
 * shows the same thing at the same moment. Each screen calls this itself rather
 * than sharing a context, so a screen can be rendered — and tested — on its own.
 */

export interface UsePatientOverviewResult {
  overview: PatientOverview
  isLoading: boolean
  /** Set when the database could not be read at all. */
  error: Error | null
  reload: () => void
}

export interface UsePatientOverviewOptions {
  /** Injectable for tests; the default is bound to the real database. */
  repository?: PatientRepository
}

export function usePatientOverview(
  options: UsePatientOverviewOptions = {},
): UsePatientOverviewResult {
  const { repository = defaultRepository } = options
  const { user, isLoading: authLoading } = useAuth()
  const userId = user?.id ?? null

  const [overview, setOverview] = useState<PatientOverview>(EMPTY_OVERVIEW)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    setIsLoading(true)
    setError(null)

    repository
      .loadOverview(userId ?? '')
      .then((loaded) => {
        if (!cancelled) setOverview(loaded)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setOverview(EMPTY_OVERVIEW)
        setError(cause instanceof Error ? cause : new Error(String(cause)))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [repository, userId, authLoading, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { overview, isLoading: isLoading || authLoading, error, reload }
}
