import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Role } from '../db/codes'
import type { User } from '../db/types'
import { authService, type AuthService } from './authService'
import { ACTIVITY_WRITE_THROTTLE_MS } from './session'

/**
 * The signed-in user, shared across the app.
 *
 * Session *storage* lives in session.ts and session *rules* live in
 * authService.ts; this context is only the React-facing view of them, plus the
 * two timers that make idle auto-logout happen while the app is open.
 */

export interface AuthContextValue {
  user: User | null
  role: Role | null
  /** True until the persisted session has been checked on first mount. */
  isLoading: boolean
  login: (username: string, password: string) => Promise<User>
  logout: () => Promise<void>
  /** Re-reads the session and user row — call after changing your own account. */
  refresh: () => Promise<User | null>
  /**
   * The service this provider is driving.
   *
   * Screens need more of it than login/logout (the admin queue, the
   * first-run bootstrap check), and reaching for the module singleton from
   * inside a component would make those screens untestable. Taking it from
   * context means one injection point — the provider's `service` prop.
   */
  service: AuthService
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Events treated as "the user is still here".
 *
 * Deliberately coarse and passive: a tap, a key, a wheel, or the app coming
 * back to the foreground. Listening for mousemove would keep a session alive
 * on a device that is merely being carried around.
 */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/** How often the open app re-checks whether the session has gone idle. */
export const DEFAULT_IDLE_CHECK_INTERVAL_MS = 15 * 1000

export interface AuthProviderProps {
  children: ReactNode
  /** Injectable for tests; the default is bound to the real database. */
  service?: AuthService
  idleCheckIntervalMs?: number
}

export function AuthProvider({
  children,
  service = authService,
  idleCheckIntervalMs = DEFAULT_IDLE_CHECK_INTERVAL_MS,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const lastTouchRef = useRef(0)

  /**
   * Replaces the user only when the identity or status actually changed.
   *
   * The idle poll runs `getCurrentUser()` on a timer, which returns a freshly
   * read object every time. Storing it unconditionally would change the
   * context value on every tick and re-run every effect that depends on it —
   * including the poll itself.
   */
  const applyUser = useCallback((next: User | null) => {
    setUser((previous) => {
      if (next === null) return null
      if (previous !== null && previous.id === next.id && previous.status === next.status) {
        return previous
      }
      return next
    })
  }, [])

  // Restore the persisted session once, on mount.
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    service
      .getCurrentUser()
      .then((current) => {
        if (!cancelled) applyUser(current)
      })
      .catch(() => {
        if (!cancelled) applyUser(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [service, applyUser])

  const userId = user?.id ?? null

  // Keep the persisted session fresh while the user is doing things.
  useEffect(() => {
    if (userId === null) return

    const onActivity = () => {
      const now = Date.now()
      // Throttled: activity fires per tap and per keystroke, and an IndexedDB
      // write per keystroke would be absurd.
      if (now - lastTouchRef.current < ACTIVITY_WRITE_THROTTLE_MS) return
      lastTouchRef.current = now
      void service.sessions.touch(now)
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
    }
  }, [userId, service])

  /**
   * Idle auto-logout.
   *
   * `getCurrentUser()` is the single place that decides whether a session has
   * expired (and audits it), so the timer just asks it and accepts the answer.
   * That also catches an account disabled by an admin while it is signed in.
   */
  useEffect(() => {
    if (userId === null) return

    const id = window.setInterval(() => {
      void service
        .getCurrentUser()
        .then(applyUser)
        .catch(() => {
          /* A transient read failure must not sign anyone out. */
        })
    }, idleCheckIntervalMs)

    return () => window.clearInterval(id)
  }, [userId, service, idleCheckIntervalMs, applyUser])

  const login = useCallback(
    async (username: string, password: string) => {
      const authenticated = await service.login(username, password)
      lastTouchRef.current = Date.now()
      applyUser(authenticated)
      return authenticated
    },
    [service, applyUser],
  )

  const logout = useCallback(async () => {
    await service.logout()
    lastTouchRef.current = 0
    setUser(null)
  }, [service])

  const refresh = useCallback(async () => {
    const current = await service.getCurrentUser()
    applyUser(current)
    return current
  }, [service, applyUser])

  const value = useMemo<AuthContextValue>(
    () => ({ user, role: user?.role ?? null, isLoading, login, logout, refresh, service }),
    [user, isLoading, login, logout, refresh, service],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>')
  }
  return value
}
