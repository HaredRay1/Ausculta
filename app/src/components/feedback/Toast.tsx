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
import { useDesignTranslation } from '../../design/i18n'
import { CheckCircleIcon, DangerIcon, InfoIcon, WarningIcon, type IconComponent } from '../icons'
import type { BannerTone } from './Banner'

export interface Toast {
  id: string
  tone: BannerTone
  message: string
}

export interface ToastContextValue {
  /** Queues a toast. Returns its id so a caller can dismiss it early. */
  show: (message: string, tone?: BannerTone) => string
  dismiss: (id: string) => void
  toasts: readonly Toast[]
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Long enough to read a sentence twice without hurrying. */
export const DEFAULT_TOAST_DURATION_MS = 6000

const TONE_ICONS: Record<BannerTone, IconComponent> = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: WarningIcon,
  danger: DangerIcon,
}

const TONE_CLASSES: Record<BannerTone, string> = {
  info: 'bg-info-surface text-on-info-surface border-info',
  success: 'bg-success-surface text-on-success-surface border-success',
  warning: 'bg-warning-surface text-on-warning-surface border-warning',
  danger: 'bg-destructive-surface text-on-destructive-surface border-destructive',
}

export interface ToastProviderProps {
  children: ReactNode
  durationMs?: number
}

/**
 * Transient confirmations ("Saved", "Recording deleted").
 *
 * Deliberately weak on purpose. A toast never takes focus, never blocks, and
 * disappears on its own, so it is only ever suitable for information the user
 * can afford to miss. Anything that must be seen — a failed save, a clinical
 * warning — belongs in a Banner that stays on screen, or a ConfirmDialog.
 */
export function ToastProvider({
  children,
  durationMs = DEFAULT_TOAST_DURATION_MS,
}: ToastProviderProps) {
  const { t } = useDesignTranslation()
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: BannerTone = 'info') => {
      const id = crypto.randomUUID()
      setToasts((current) => [...current, { id, tone, message }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      )
      return id
    },
    [dismiss, durationMs],
  )

  // Nothing should be left running after the provider goes away.
  const timersRef = timers
  useEffect(() => {
    const map = timersRef.current
    return () => {
      for (const timer of map.values()) clearTimeout(timer)
      map.clear()
    }
  }, [timersRef])

  const value = useMemo<ToastContextValue>(() => ({ show, dismiss, toasts }), [
    show,
    dismiss,
    toasts,
  ])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
       * The live region is always mounted, empty or not: a region added to the
       * DOM at the same moment as its message is unreliably announced, because
       * assistive technology has nothing to have been watching.
       *
       * `polite` waits for a pause rather than cutting the user off, and no
       * part of this steals focus.
       */}
      <div
        role="status"
        aria-live="polite"
        aria-label={t('toast.region')}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-toast) flex flex-col items-center gap-2 p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {toasts.map((toast) => {
          const Icon = TONE_ICONS[toast.tone]
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border-l-4 p-4 text-base elevation-2 ${TONE_CLASSES[toast.tone]}`}
            >
              <Icon className="mt-0.5 size-6 shrink-0" />
              <span className="flex-1">{toast.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (value === null) throw new Error('useToast must be used inside a <ToastProvider>')
  return value
}
