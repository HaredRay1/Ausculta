import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { ADMIN_USERNAME } from '../authService'
import { roleHomePath } from '../guards'
import { AuthScreen, Banner, PasswordField, PrimaryButton, TextField } from '../components/ui'
import { authErrorKey } from '../errorMessage'
import { useAuthTranslation } from '../i18n'

/**
 * First run: the very first screen anyone ever sees.
 *
 * Written for someone who has just installed a health app, has nobody to ask,
 * and has no reason to know what "administrator" means here. The first version
 * demanded they "create the administrator account" with no explanation and then
 * sent them to a sign-in screen — and the owner's reaction on a real install was
 * the correct one: he did not believe he had created an account at all, and did
 * not know what the administrator was supposed to be.
 *
 * So it says what is happening before asking for anything, frames the role as a
 * consequence of being first rather than as a prerequisite, and signs them in on
 * success. They proved they know the password by typing it twice thirty seconds
 * ago; asking for it again only creates doubt about whether it worked.
 *
 * The account cannot be created twice, the password is chosen here and nowhere
 * else, and because everything is offline nobody can recover it — hence the
 * warning that it must be one they will remember.
 */
export function SetupAdminPage() {
  const { t } = useAuthTranslation()
  const { service, login } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** Only reached if the account was created but signing in then failed. */
  const [created, setCreated] = useState(false)
  /** null while the first-run check is still in flight. */
  const [bootstrapped, setBootstrapped] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    service
      .isAdminBootstrapped()
      .then((value) => {
        if (!cancelled) setBootstrapped(value)
      })
      .catch(() => {
        if (!cancelled) setBootstrapped(false)
      })
    return () => {
      cancelled = true
    }
  }, [service])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (isSubmitting) return

    if (password !== confirmation) {
      setErrorKey('error.PASSWORDS_DO_NOT_MATCH')
      return
    }

    setErrorKey(null)
    setIsSubmitting(true)

    try {
      await service.bootstrapAdmin({ password, name })
    } catch (error) {
      setErrorKey(authErrorKey(error))
      setIsSubmitting(false)
      return
    }

    /*
     * Straight in, with no second password prompt.
     *
     * If signing in somehow fails the account still exists, so falling back to
     * the sign-in screen is right — but it has to say the account was created,
     * because reading "sign in" after creating an account is exactly what made
     * the old flow feel like it had not worked.
     */
    try {
      const user = await login(ADMIN_USERNAME, password)
      navigate(roleHomePath(user.role), { replace: true })
    } catch {
      setCreated(true)
    } finally {
      setIsSubmitting(false)
      setPassword('')
      setConfirmation('')
    }
  }

  if (bootstrapped === null) {
    return (
      <AuthScreen title={t('setupAdmin.title')}>
        <p className="text-base text-muted">{t('login.loading')}</p>
      </AuthScreen>
    )
  }

  if (created) {
    return (
      <AuthScreen title={t('setupAdmin.successTitle')}>
        <Banner tone="success">{t('setupAdmin.successBody')}</Banner>
        <Link
          to="/login"
          className="flex min-h-14 w-full items-center justify-center rounded-control bg-primary-strong px-6 py-4 text-lg font-semibold text-on-primary"
        >
          {t('action.signIn')}
        </Link>
      </AuthScreen>
    )
  }

  // Someone reached this on a phone that is already set up — most likely a
  // bookmark. Send them where they actually meant to go.
  if (bootstrapped) return <Navigate to="/login" replace />

  return (
    <AuthScreen title={t('setupAdmin.title')} subtitle={t('setupAdmin.subtitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {errorKey !== null && <Banner tone="error">{t(errorKey)}</Banner>}

        {/* What this account is, before anything is asked of them. */}
        <Banner tone="info">{t('setupAdmin.whatIsAdmin')}</Banner>
        <Banner tone="info">{t('setupAdmin.usernameNotice')}</Banner>
        <Banner tone="warning">{t('setupAdmin.warning')}</Banner>

        <TextField
          label={t('field.fullName')}
          value={name}
          onChange={setName}
          autoComplete="name"
          required
          disabled={isSubmitting}
        />
        <PasswordField
          label={t('field.password')}
          hint={t('field.passwordHint')}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          disabled={isSubmitting}
        />
        <PasswordField
          label={t('field.confirmPassword')}
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
          required
          disabled={isSubmitting}
        />

        {/* Says where they are about to land, so arriving there is expected. */}
        <p className="text-sm text-muted">{t('setupAdmin.nextStep')}</p>

        <PrimaryButton disabled={isSubmitting}>
          {isSubmitting ? t('action.creatingAdmin') : t('action.createAdmin')}
        </PrimaryButton>
      </form>
    </AuthScreen>
  )
}
