import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section } from '../../components'
import { StaffShell } from '../staff/StaffShell'
import { useAdminTranslation } from './i18n'
import { ADMIN_NAV, type AdminNavId } from './navigation'

export interface AdminShellProps {
  activeId: AdminNavId
  title: string
  subtitle?: string
  children: ReactNode
}

/**
 * The frame every administration screen sits in.
 *
 * The console is four screens and nothing else links to three of them, so the
 * section row is the only way to discover that the activity log and the
 * translation worklist exist at all. It is a real `<nav>` with `aria-current`
 * rather than styled links: the current section is marked structurally, not by
 * the filled background alone.
 */
export function AdminShell({ activeId, title, subtitle, children }: AdminShellProps) {
  const { t } = useAdminTranslation()
  const navigate = useNavigate()

  return (
    <StaffShell activeId={activeId === 'translations' ? 'menu' : activeId} title={title}>
      <nav aria-label={t('admin:nav.label')}>
        <ul className="flex flex-wrap gap-2">
          {ADMIN_NAV.map((entry) => {
            const active = entry.id === activeId
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => navigate(entry.path)}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'inline-flex min-h-12 items-center rounded-control border-2 px-4 text-base',
                    active
                      ? 'border-primary-strong bg-accent font-bold text-on-accent'
                      : 'border-border-strong bg-surface-raised font-medium text-on-surface',
                  ].join(' ')}
                >
                  {t(entry.labelKey)}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* No title here: StaffShell's app bar already carries it, and repeating
          it as a body headline is what made these screens read as documents. */}
      <Section description={subtitle}>{children}</Section>
    </StaffShell>
  )
}
