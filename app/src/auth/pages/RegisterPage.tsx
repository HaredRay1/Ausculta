import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ROLES, USER_STATUSES, type Role } from '../../db/codes'
import { useAuth } from '../AuthContext'
import { SELF_REGISTRABLE_ROLES, initialStatusForRole } from '../authService'
import { AuthScreen, Banner, PasswordField, PrimaryButton, TextField } from '../components/ui'
import { authErrorKey } from '../errorMessage'
import { useAuthTranslation } from '../i18n'

/** One glyph per role, so the choice can be recognised before it is read. */
function RoleIcon({ role }: { role: Role }) {
  const paths: Record<Role, string> = {
    [ROLES.PATIENT]: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5Z',
    [ROLES.PRACTITIONER]:
      'M9 2v6a5 5 0 0 0 4 4.9V16a3 3 0 1 0 2 0v-3.1A5 5 0 0 0 19 8V2h-2v6a3 3 0 0 1-6 0V2H9Zm5 17a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z',
    [ROLES.HEALTH_WORKER]:
      'M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6l-9-4Zm1 6v3h3v2h-3v3h-2v-3H8v-2h3V8h2Z',
    [ROLES.RESEARCHER]:
      'M10 2v7.2L4.3 19a2 2 0 0 0 1.7 3h12a2 2 0 0 0 1.7-3L14 9.2V2h-4Zm2 2v5.8l1.9 3.2h-3.8L12 9.8V4Z',
    [ROLES.ADMIN]: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z',
  }

  return (
    <svg viewBox="0 0 24 24" className="size-8 shrink-0" aria-hidden="true" fill="currentColor">
      <path d={paths[role]} />
    </svg>
  )
}

export function RegisterPage() {
  const { t } = useAuthTranslation()
  const { service } = useAuth()

  const [role, setRole] = useState<Role>(ROLES.PATIENT)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [designation, setDesignation] = useState('')
  const [organization, setOrganization] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdStatus, setCreatedStatus] = useState<string | null>(null)

  /** Only professional roles are asked for a job title and organisation. */
  const isProfessional = role !== ROLES.PATIENT

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
      const created = await service.register({
        username,
        password,
        role,
        name,
        ...(isProfessional && designation.trim() !== ''
          ? { professionalDesignation: designation.trim() }
          : {}),
        ...(isProfessional && organization.trim() !== ''
          ? { organization: organization.trim() }
          : {}),
      })
      setCreatedStatus(created.status)
    } catch (error) {
      setErrorKey(authErrorKey(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (createdStatus !== null) {
    const isPending = createdStatus === USER_STATUSES.PENDING_VERIFICATION
    return (
      <AuthScreen title={t(isPending ? 'register.pendingTitle' : 'register.activeTitle')}>
        <Banner tone={isPending ? 'info' : 'success'}>
          {t(isPending ? 'register.pendingBody' : 'register.activeBody')}
        </Banner>
        <Link
          to="/login"
          className="flex min-h-14 w-full items-center justify-center rounded-xl bg-teal-700 px-6 py-4 text-lg font-semibold text-white"
        >
          {t('action.signIn')}
        </Link>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      footer={
        <p className="text-base text-slate-700">
          {t('register.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-teal-700 underline">
            {t('register.loginLink')}
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {errorKey !== null && <Banner tone="error">{t(errorKey)}</Banner>}

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 text-base font-medium text-slate-900">{t('field.role')}</legend>
          <p className="pb-1 text-sm text-slate-600">{t('register.roleHelp')}</p>

          {SELF_REGISTRABLE_ROLES.map((option) => {
            const selected = option === role
            return (
              <label
                key={option}
                className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 ${
                  selected
                    ? 'border-teal-700 bg-teal-50 text-teal-900'
                    : 'border-slate-300 bg-white text-slate-900'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={option}
                  checked={selected}
                  onChange={() => setRole(option)}
                  disabled={isSubmitting}
                  className="size-6 accent-teal-700"
                />
                <RoleIcon role={option} />
                <span className="flex flex-col">
                  <span className="text-lg font-semibold">{t(`codes:role.${option}`)}</span>
                  <span className="text-sm text-slate-600">
                    {t(`register.roleDescription.${option}`)}
                  </span>
                </span>
              </label>
            )
          })}

          {initialStatusForRole(role) === USER_STATUSES.PENDING_VERIFICATION && (
            <Banner tone="info">{t('register.pendingBody')}</Banner>
          )}
        </fieldset>

        <TextField
          label={t('field.fullName')}
          value={name}
          onChange={setName}
          autoComplete="name"
          required
          disabled={isSubmitting}
        />
        <TextField
          label={t('field.username')}
          hint={t('field.usernameHint')}
          value={username}
          onChange={setUsername}
          autoComplete="username"
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

        {isProfessional && (
          <>
            <TextField
              label={t('field.professionalDesignation')}
              hint={t('field.professionalDesignationHint')}
              value={designation}
              onChange={setDesignation}
              disabled={isSubmitting}
            />
            <TextField
              label={t('field.organization')}
              hint={t('field.organizationHint')}
              value={organization}
              onChange={setOrganization}
              disabled={isSubmitting}
            />
          </>
        )}

        <PrimaryButton disabled={isSubmitting}>
          {isSubmitting ? t('action.registering') : t('action.register')}
        </PrimaryButton>
      </form>
    </AuthScreen>
  )
}
