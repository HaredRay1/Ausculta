import type { ReactNode } from 'react'
import {
  Banner as DesignBanner,
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
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-bold text-on-surface">{title}</h1>
          {subtitle !== undefined && <p className="text-base text-muted">{subtitle}</p>}
        </header>
        {children}
        {footer !== undefined && <footer className="pt-2 text-center">{footer}</footer>}
      </div>
    </main>
  )
}
