import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { USER_STATUSES, type UserStatus } from '../../db/codes'
import type { User } from '../../db/types'
import { useAuth } from '../../auth/AuthContext'
import { AuthScreen, Banner, PasswordField, PrimaryButton } from '../../auth/components/ui'
import { authErrorKey } from '../../auth/errorMessage'
import { useAuthTranslation } from '../../auth/i18n'

/**
 * The administrator's account queue.
 *
 * On an offline device this screen is the *only* thing standing between a
 * self-declared "practitioner" and other people's clinical records — there is
 * no central registry to check a licence against, just an administrator who
 * knows who actually works at the clinic. So the pending queue is the first
 * thing on screen, each row says plainly what the person claims to be, and the
 * two decisions are one tap each.
 */

const SECTION_ORDER: readonly UserStatus[] = [
  USER_STATUSES.PENDING_VERIFICATION,
  USER_STATUSES.ACTIVE,
  USER_STATUSES.DISABLED,
]

const SECTION_TITLE_KEYS: Record<UserStatus, string> = {
  [USER_STATUSES.PENDING_VERIFICATION]: 'users.pendingSection',
  [USER_STATUSES.ACTIVE]: 'users.activeSection',
  [USER_STATUSES.DISABLED]: 'users.disabledSection',
}

const STATUS_BADGE_CLASSES: Record<UserStatus, string> = {
  [USER_STATUSES.PENDING_VERIFICATION]: 'bg-warning-surface text-on-warning-surface',
  [USER_STATUSES.ACTIVE]: 'bg-accent text-on-accent',
  [USER_STATUSES.DISABLED]: 'bg-surface-sunken text-on-surface',
}

type PendingPrompt = { kind: 'disable' | 'reset'; user: User } | null

export function UsersPage() {
  const { t } = useAuthTranslation()
  const { user: admin, service } = useAuth()

  const [users, setUsers] = useState<User[] | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<PendingPrompt>(null)

  const adminId = admin?.id ?? null

  const reload = useCallback(async () => {
    if (adminId === null) return
    try {
      setUsers(await service.listUsers(adminId))
    } catch (error) {
      setErrorKey(authErrorKey(error))
      setUsers([])
    }
  }, [adminId, service])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Runs one admin action, then re-reads the list so the UI cannot drift. */
  async function run(target: User, action: () => Promise<unknown>, successMessage: string) {
    if (adminId === null || busyUserId !== null) return
    setErrorKey(null)
    setNotice(null)
    setBusyUserId(target.id)
    try {
      await action()
      setNotice(successMessage)
      setPrompt(null)
      await reload()
    } catch (error) {
      setErrorKey(authErrorKey(error))
    } finally {
      setBusyUserId(null)
    }
  }

  if (adminId === null) return null

  if (users === null) {
    return (
      <AuthScreen title={t('users.title')}>
        <p className="text-base text-muted">{t('users.loading')}</p>
      </AuthScreen>
    )
  }

  const pendingCount = users.filter(
    (candidate) => candidate.status === USER_STATUSES.PENDING_VERIFICATION,
  ).length

  return (
    <AuthScreen title={t('users.title')} subtitle={t('users.subtitle')}>
      {errorKey !== null && <Banner tone="error">{t(errorKey)}</Banner>}
      {notice !== null && <Banner tone="success">{notice}</Banner>}
      {pendingCount > 0 && <Banner tone="warning">{t('users.pendingCount', { count: pendingCount })}</Banner>}

      {SECTION_ORDER.map((status) => {
        const inSection = users.filter((candidate) => candidate.status === status)
        return (
          <section key={status} className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-on-surface">{t(SECTION_TITLE_KEYS[status])}</h2>

            {inSection.length === 0 ? (
              <p className="text-base text-muted">{t('users.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {inSection.map((row) => {
                  const isSelf = row.id === adminId
                  const isBusy = busyUserId === row.id
                  return (
                    <li
                      key={row.id}
                      className="flex flex-col gap-3 rounded-xl border-2 border-border-strong p-4"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-lg font-semibold text-on-surface">{row.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-sm font-medium ${STATUS_BADGE_CLASSES[row.status]}`}
                          >
                            {t(`codes:userStatus.${row.status}`)}
                          </span>
                        </div>
                        <span className="text-base text-muted">
                          {t(`codes:role.${row.role}`)}
                          {isSelf ? ` · ${t('users.you')}` : ''}
                        </span>
                        <span className="text-sm text-muted">{row.username}</span>
                        {row.professionalDesignation !== undefined && (
                          <span className="text-sm text-muted">
                            {row.professionalDesignation}
                          </span>
                        )}
                        {row.organization !== undefined && (
                          <span className="text-sm text-muted">{row.organization}</span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {row.status !== USER_STATUSES.ACTIVE && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void run(
                                row,
                                () =>
                                  service.activateUser({
                                    actingUserId: adminId,
                                    targetUserId: row.id,
                                  }),
                                t('users.activated', { name: row.name }),
                              )
                            }
                            className="min-h-12 flex-1 rounded-xl bg-primary-strong px-4 py-2 text-base font-semibold text-on-primary active:opacity-90 disabled:bg-border-strong"
                          >
                            {t('action.activate')}
                          </button>
                        )}

                        {row.status === USER_STATUSES.ACTIVE && !isSelf && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setPrompt({ kind: 'disable', user: row })}
                            className="min-h-12 flex-1 rounded-xl border-2 border-destructive px-4 py-2 text-base font-semibold text-destructive disabled:border-border-strong disabled:text-muted"
                          >
                            {t('action.disable')}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setPrompt({ kind: 'reset', user: row })}
                          className="min-h-12 flex-1 rounded-xl border-2 border-primary-strong px-4 py-2 text-base font-semibold text-primary disabled:border-border-strong disabled:text-muted"
                        >
                          {t('action.resetPassword')}
                        </button>
                      </div>

                      {prompt?.user.id === row.id && prompt.kind === 'disable' && (
                        <ConfirmDisable
                          name={row.name}
                          busy={isBusy}
                          onCancel={() => setPrompt(null)}
                          onConfirm={() =>
                            void run(
                              row,
                              () =>
                                service.disableUser({
                                  actingUserId: adminId,
                                  targetUserId: row.id,
                                }),
                              t('users.disabled', { name: row.name }),
                            )
                          }
                        />
                      )}

                      {prompt?.user.id === row.id && prompt.kind === 'reset' && (
                        <ResetPasswordForm
                          name={row.name}
                          busy={isBusy}
                          onCancel={() => setPrompt(null)}
                          onSubmit={(newPassword) =>
                            void run(
                              row,
                              () =>
                                service.resetPassword({
                                  actingUserId: adminId,
                                  targetUserId: row.id,
                                  newPassword,
                                }),
                              t('users.resetPasswordDone', { name: row.name }),
                            )
                          }
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </AuthScreen>
  )
}

function ConfirmDisable({
  name,
  busy,
  onConfirm,
  onCancel,
}: {
  name: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useAuthTranslation()
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-destructive-surface p-4">
      <p className="text-base font-medium text-on-destructive-surface">{t('users.confirmDisable', { name })}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-12 flex-1 rounded-xl border-2 border-border-strong px-4 py-2 text-base font-semibold text-on-surface"
        >
          {t('action.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-12 flex-1 rounded-xl bg-destructive px-4 py-2 text-base font-semibold text-on-primary active:opacity-90 disabled:bg-border-strong"
        >
          {t('action.confirm')}
        </button>
      </div>
    </div>
  )
}

function ResetPasswordForm({
  name,
  busy,
  onSubmit,
  onCancel,
}: {
  name: string
  busy: boolean
  onSubmit: (newPassword: string) => void
  onCancel: () => void
}) {
  const { t } = useAuthTranslation()
  const [newPassword, setNewPassword] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit(newPassword)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl bg-surface-sunken p-4" noValidate>
      <PasswordField
        label={t('users.resetPasswordFor', { name })}
        hint={t('field.passwordHint')}
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        disabled={busy}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-12 flex-1 rounded-xl border-2 border-border-strong px-4 py-2 text-base font-semibold text-on-surface"
        >
          {t('action.cancel')}
        </button>
        <div className="flex-1">
          <PrimaryButton disabled={busy}>{t('action.resetPassword')}</PrimaryButton>
        </div>
      </div>
    </form>
  )
}
