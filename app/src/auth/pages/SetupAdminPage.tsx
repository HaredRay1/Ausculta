import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { AuthScreen, Banner, PasswordField, PrimaryButton, TextField } from '../components/ui'
import { authErrorKey } from '../errorMessage'
import { useAuthTranslation } from '../i18n'

/**
 * First-run setup: creates the single administrator account for this device.
 *
 * Deliberately a dead end once used. The account cannot be created twice, the
 * password is chosen here and nowhere else (there is no default to leak), and
 * because everything is offline there is nobody who can recover it — hence the
 * warning that the operator must write it down.
 */
export function SetupAdminPage() {
  const { t } = useAuthTranslation()
  const { service } = useAuth()

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
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
      setCreated(true)
      setPassword('')
      setConfirmation('')
    } catch (error) {
      setErrorKey(authErrorKey(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (bootstrapped === null) {
    return (
      <AuthScreen title={t('setupAdmin.title')}>
        <p className="text-base text-slate-700">{t('login.loading')}</p>
      </AuthScreen>
    )
  }

  if (created) {
    return (
      <AuthScreen title={t('setupAdmin.successTitle')}>
        <Banner tone="success">{t('setupAdmin.successBody')}</Banner>
        <Link
          to="/login"
          className="flex min-h-14 w-full items-center justify-center rounded-xl bg-teal-700 px-6 py-4 text-lg font-semibold text-white"
        >
          {t('action.signIn')}
        </Link>
      </AuthScreen>
    )
  }

  // Someone reached /setup-admin on a device that is already set up — most
  // likely a bookmark. Send them where they actually meant to go.
  if (bootstrapped) return <Navigate to="/login" replace />

  return (
    <AuthScreen title={t('setupAdmin.title')} subtitle={t('setupAdmin.subtitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {errorKey !== null && <Banner tone="error">{t(errorKey)}</Banner>}

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

        <PrimaryButton disabled={isSubmitting}>
          {isSubmitting ? t('action.creatingAdmin') : t('action.createAdmin')}
        </PrimaryButton>
      </form>
    </AuthScreen>
  )
}
