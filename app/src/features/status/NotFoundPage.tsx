import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, Page, QuestionIcon, Section } from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { roleHomePath } from '../../auth/guards'

/**
 * Anything that matches no other route.
 *
 * Without this, React Router renders nothing at all and an unknown path is a
 * blank white screen. That is bad in a browser and much worse in the installed
 * app, which runs with no address bar and no back button — the only way out of
 * a blank screen there is to force-quit. So every typo, stale link and routing
 * bug used to end at an unrecoverable dead end.
 *
 * The way out is offered rather than described: signed in, it goes to your own
 * home; signed out, to the landing page.
 */
export function NotFoundPage() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { role } = useAuth()

  const destination = role ? roleHomePath(role) : '/landing'

  return (
    <Page>
      <Section>
        <EmptyState
          title={t('notFound.title')}
          body={t('notFound.body')}
          icon={<QuestionIcon className="size-10" />}
          action={
            <Button variant="primary" fullWidth onClick={() => navigate(destination, { replace: true })}>
              {role ? t('notFound.actionSignedIn') : t('notFound.actionSignedOut')}
            </Button>
          }
        />
      </Section>
    </Page>
  )
}
