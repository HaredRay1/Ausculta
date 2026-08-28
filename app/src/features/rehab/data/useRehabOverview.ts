import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import {
  EMPTY_OVERVIEW,
  createRehabRepository,
  rehabRepository as defaultRepository,
  type RehabOverview,
  type RehabRepository,
} from './rehabRepository'

export interface UseRehabOverviewResult {
  overview: RehabOverview
  isLoading: boolean
  /** Re-reads after a write, so a logged activity appears without a reload. */
  reload: () => void
}

/**
 * Loads the signed-in patient's rehabilitation state.
 *
 * The repository is a prop rather than a module import at the call site so a
 * test can drive a screen from a throwaway database; `createRehabRepository`
 * is re-exported here for that.
 *
 * Starts in a loading state and stays there until the read settles. That
 * matters more here than on most screens: the difference between "loading" and
 * "your practitioner has not assigned a plan yet" is the difference between a
 * blank moment and a false statement about a person's care, and flashing the
 * second one while the first is true is not acceptable.
 */
export function useRehabOverview(
  repository: RehabRepository = defaultRepository,
): UseRehabOverviewResult {
  const { user, isLoading: authLoading } = useAuth()
  const [overview, setOverview] = useState<RehabOverview>(EMPTY_OVERVIEW)
  const [isLoading, setIsLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  /**
   * `isLoading` covers the *first* read only.
   *
   * A reload after logging an activity must not blank the list: replacing the
   * cards with a skeleton unmounts them, throws away the "logged, well done"
   * confirmation the person just earned, and makes their own plan flicker.
   * Later reads swap the data in underneath what is already on screen.
   */
  const hasSettled = useRef(false)

  const reload = useCallback(() => {
    setNonce((value) => value + 1)
  }, [])

  const userId = user?.id ?? ''

  useEffect(() => {
    if (authLoading) return

    let cancelled = false
    if (!hasSettled.current) setIsLoading(true)

    void repository
      .loadForUser(userId)
      .then((result) => {
        if (!cancelled) setOverview(result)
      })
      .catch(() => {
        // A failed read must not leave a stale plan on screen. Falling back to
        // the empty overview shows the honest "not assigned yet" state.
        if (!cancelled) setOverview(EMPTY_OVERVIEW)
      })
      .finally(() => {
        if (cancelled) return
        hasSettled.current = true
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [repository, userId, authLoading, nonce])

  return { overview, isLoading, reload }
}

export { createRehabRepository }
