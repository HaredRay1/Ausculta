import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, ChevronRightIcon, Section } from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { roleHomePath } from '../../auth/guards'
import { StaffShell } from './StaffShell'
import { useStaffTranslation } from './i18n'
import { MENU_LINKS, isStaffRole } from './navigation'

/**
 * Who you are, how to leave, and everything that did not earn a tab.
 *
 * The guaranteed way out. Before this existed there was no sign-out anywhere
 * for an admin, practitioner, health worker or researcher — on a shared clinic
 * phone, where handing it to a colleague is the normal case, that meant the
 * first person to sign in owned the device.
 *
 * It also states who is signed in, which matters for the same reason: on a
 * shared phone the question "am I still logged in as the last person" is one
 * you should never have to guess at, and every clinical record is attributed to
 * whoever the app thinks you are.
 */
export function MenuPage() {
  const { t } = useStaffTranslation()
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  // A patient has their own portal with its own navigation and its own way
  // out. Rendering the staff menu for them produced a screen with no nav and
  // no back — a dead end reached only by typing the URL, but a dead end.
  if (!isStaffRole(role)) return <Navigate to={roleHomePath(role)} replace />

  const links = MENU_LINKS.filter(
    (link) => link.roles === undefined || (role !== null && link.roles.includes(role)),
  )

  async function onSignOut() {
    await logout()
    // Back to the front door rather than to a guard's redirect, so signing out
    // ends somewhere deliberate.
    navigate('/landing', { replace: true })
  }

  return (
    <StaffShell activeId="menu" title={t('staff:menu.title')}>
      <Card>
        <p className="text-sm text-muted">{t('staff:menu.signedInAs')}</p>
        <p className="font-heading text-lg font-bold text-on-surface">{user?.name ?? ''}</p>
        {role !== null && (
          <p className="mt-1 text-base text-muted">
            {t('staff:menu.roleLabel', { role: t(`codes:role.${role}`) })}
          </p>
        )}
      </Card>

      <Button variant="secondary" size="lg" fullWidth onClick={() => void onSignOut()}>
        {t('staff:menu.signOut')}
      </Button>
      <p className="text-sm text-muted">{t('staff:menu.signOutHint')}</p>

      <Section title={t('staff:menu.moreHeading')}>
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li key={link.path}>
              <button
                type="button"
                onClick={() => navigate(link.path)}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-control border-2 border-border bg-surface-raised px-4 py-2 text-left text-base font-medium text-on-surface"
              >
                {t(link.labelKey)}
                <ChevronRightIcon className="size-5 shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </StaffShell>
  )
}
