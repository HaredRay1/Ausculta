import type { ReactNode } from 'react'
import {
  Banner as DesignBanner,
  BrandMark,
  Button,
  PasswordField as DesignPasswordField,
  TextField as DesignTextField,
  type BannerTone as DesignBannerTone,
  type PasswordFieldProps,
  type TextFieldProps,
} from '../../components'

/**
 * Adapters onto the design system.
 *
 * These screens were built before the design system existed and carried their
 * own button, field and banner implementations — with palette classes
 * (`bg-teal-700`, `text-slate-900`) baked in. Those classes do not follow a
 * theme swap, so the auth screens would have stayed stubbornly light while the
 * rest of the app went dark. They are also the first screens a validator sees.
 *
 * Rather than rewrite four screens hours before validation, this file keeps its
 * original export names and delegates to the real components. The screens
 * import the same things they always did; nothing below carries a colour of its
 * own any more.
 */

export type BannerTone = 'info' | 'error' | 'success' | 'warning'

/** `error` is this layer's older name for the design system's `danger`. */
const TONE_MAP: Record<BannerTone, DesignBannerTone> = {
  info: 'info',
  error: 'danger',
  success: 'success',
  warning: 'warning',
}

export function Banner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  return <DesignBanner tone={TONE_MAP[tone]}>{children}</DesignBanner>
}

export const TextField = DesignTextField
export type { TextFieldProps, PasswordFieldProps }
export const PasswordField = DesignPasswordField

/** The single action a screen exists for. Full width, unmissable. */
export function PrimaryButton({
  children,
  disabled,
  type = 'submit',
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  type?: 'submit' | 'button'
  onClick?: () => void
}) {
  return (
    <Button type={type} onClick={onClick} disabled={disabled} size="lg" fullWidth>
      {children}
    </Button>
  )
}

/**
 * Full-height screen shell with a title, optional subtitle, and body.
 *
 * Not the design system's `Page`: these screens are pre-authentication and
 * carry no app bar or bottom nav, so they centre a narrow column instead of
 * reserving space for chrome that is not there.
 *
 * The mark and the card were added after looking at the screens rather than the
 * code. Sign-in was a bare title on an empty canvas, which is a jarring drop
 * from a landing page that opens with a large mark and a wordmark — it reads as
 * a different application, and on a shared clinic phone this is the screen a
 * validator meets most often. The mark says which app is asking for the
 * password, and putting the fields on a raised card gives the form an edge, so
 * it is an object on the page rather than text floating on the background.
 */
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main
      className="min-h-dvh bg-surface px-5 py-8 text-on-surface"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 2rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)',
      }}
    >
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <BrandMark size="md" />
          <h1 className="text-balance font-heading text-2xl font-bold text-on-surface">
            {title}
          </h1>
          {subtitle !== undefined && (
            <p className="text-pretty text-base text-muted">{subtitle}</p>
          )}
        </header>
        <div className="rounded-card border border-card-border bg-surface-raised p-5 elevation-1">
          {children}
        </div>
        {footer !== undefined && <footer className="text-center">{footer}</footer>}
      </div>
    </main>
  )
}
