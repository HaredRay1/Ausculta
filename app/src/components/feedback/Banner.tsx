import type { ReactNode } from 'react'
import { useDesignTranslation } from '../../design/i18n'
import {
  CheckCircleIcon,
  CloseIcon,
  DangerIcon,
  InfoIcon,
  WarningIcon,
  type IconComponent,
} from '../icons'

export type BannerTone = 'info' | 'success' | 'warning' | 'danger'

export interface BannerProps {
  tone: BannerTone
  children: ReactNode
  /** Bold first line. Use it when the message is longer than a sentence. */
  title?: string
  /** Shows a dismiss control. Omit for something the user must keep seeing. */
  onDismiss?: () => void
  /** A single control, e.g. "Record again". */
  action?: ReactNode
  className?: string
}

/**
 * Tone styling.
 *
 * `danger` maps to the `destructive` token family — the tone is named for what
 * the message is (bad news) rather than for what the colour does elsewhere
 * (delete buttons).
 *
 * Every tone brings its own icon. That is the point: a banner must still say
 * which kind of thing it is in greyscale, to a colour-blind reader, and to a
 * screen reader that never sees the colour at all.
 */
const TONES: Record<BannerTone, { icon: IconComponent; className: string; iconClass: string }> = {
  info: {
    icon: InfoIcon,
    className: 'bg-info-surface text-on-info-surface border-info',
    iconClass: 'text-info',
  },
  success: {
    icon: CheckCircleIcon,
    className: 'bg-success-surface text-on-success-surface border-success',
    iconClass: 'text-success',
  },
  warning: {
    icon: WarningIcon,
    className: 'bg-warning-surface text-on-warning-surface border-warning',
    iconClass: 'text-warning',
  },
  danger: {
    icon: DangerIcon,
    className: 'bg-destructive-surface text-on-destructive-surface border-destructive',
    iconClass: 'text-destructive',
  },
}

export function Banner({ tone, children, title, onDismiss, action, className = '' }: BannerProps) {
  const { t } = useDesignTranslation()
  const { icon: Icon, className: toneClass, iconClass } = TONES[tone]

  return (
    <div
      // Bad news interrupts; everything else is polite. A success message that
      // barges in over what the user is reading is worse than one that waits.
      role={tone === 'danger' ? 'alert' : 'status'}
      className={[
        'flex items-start gap-3 rounded-card border-l-4 p-4 text-base',
        toneClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon className={`mt-0.5 size-6 shrink-0 ${iconClass}`} />

      <div className="min-w-0 flex-1">
        {title !== undefined && <p className="font-semibold">{title}</p>}
        <div className={title !== undefined ? 'mt-0.5' : ''}>{children}</div>
        {action !== undefined && <div className="mt-3">{action}</div>}
      </div>

      {onDismiss !== undefined && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('action.dismiss')}
          className="-m-2 inline-flex size-12 shrink-0 items-center justify-center rounded-control"
        >
          <CloseIcon className="size-5" />
        </button>
      )}
    </div>
  )
}
