import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { AuthScreen, Banner, PasswordField, PrimaryButton, TextField } from '../components/ui'
import { authErrorKey } from '../errorMessage'
import { useAuthTranslation } from '../i18n'
import { roleHomePath } from '../guards'

export function LoginPage() {
  const { t } = useAuthTranslation()
  const { user, login, service } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** null while the first-run check is still in flight. */
  const [bootstrapped, setBootstrapped] = useState<boolean | null>(null)

  // A device with no administrator has no account to sign in to, so there is
  // nothing useful this screen can offer until setup has been done.
  useEffect(() => {
    let cancelled = false
    service
      .isAdminBootstrapped()
      .then((value) => {
        if (!cancelled) setBootstrapped(value)
      })
      .catch(() => {
        // If the check itself fails, show the form rather than trapping the
        // user on a spinner — a real account may well exist.
        if (!cancelled) setBootstrapped(true)
      })
    return () => {
      cancelled = true
    }
  }, [service])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (isSubmitting) return
    setErrorKey(null)
    setIsSubmitting(true)
    try {
      const authenticated = await login(username, password)
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      navigate(from ?? roleHomePath(authenticated.role), { replace: true })
    } catch (error) {
      setErrorKey(authErrorKey(error))
      setPassword('')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (user !== null) return <Navigate to={roleHomePath(user.role)} replace />
  if (bootstrapped === false) return <Navigate to="/setup-admin" replace />

  return (
    <AuthScreen
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      footer={
        <p className="text-base text-muted">
          {t('login.noAccount')}{' '}
          <Link to="/register" className="font-semibold text-primary underline">
            {t('login.registerLink')}
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {errorKey !== null && <Banner tone="error">{t(errorKey)}</Banner>}

        <TextField
          label={t('field.username')}
          value={username}
          onChange={setUsername}
          autoComplete="username"
          required
          disabled={isSubmitting}
        />
        <PasswordField
          label={t('field.password')}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
          disabled={isSubmitting}
        />

        <PrimaryButton disabled={isSubmitting}>
          {isSubmitting ? t('action.signingIn') : t('action.signIn')}
        </PrimaryButton>
      </form>
    </AuthScreen>
  )
}
