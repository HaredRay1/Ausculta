import { useCallback, useEffect, useState, type FormEvent } from "react";
import { USER_STATUSES, type UserStatus } from "../../db/codes";
import type { User } from "../../db/types";
import { useAuth } from "../../auth/AuthContext";
import { Avatar, Button, Chip, Section, type ChipTone } from "../../components";
import { Banner, PasswordField, PrimaryButton } from "../../auth/components/ui";
import { StaffShell } from "../staff/StaffShell";
import { authErrorKey } from "../../auth/errorMessage";
import { useAuthTranslation } from "../../auth/i18n";

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
];

const SECTION_TITLE_KEYS: Record<UserStatus, string> = {
  [USER_STATUSES.PENDING_VERIFICATION]: "users.pendingSection",
  [USER_STATUSES.ACTIVE]: "users.activeSection",
  [USER_STATUSES.DISABLED]: "users.disabledSection",
};

/**
 * Status as a chip tone. Amber for the queue that needs a decision, teal for
 * settled, grey for switched off — and the word is always beside the colour,
 * because "pending" and "disabled" differ by more than a hue to a reader who
 * cannot see the hue.
 */
const STATUS_TONES: Record<UserStatus, ChipTone> = {
  [USER_STATUSES.PENDING_VERIFICATION]: "warning",
  [USER_STATUSES.ACTIVE]: "accent",
  [USER_STATUSES.DISABLED]: "neutral",
};

type PendingPrompt = { kind: "disable" | "reset"; user: User } | null;

export function UsersPage() {
  const { t } = useAuthTranslation();
  const { user: admin, service } = useAuth();

  const [users, setUsers] = useState<User[] | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PendingPrompt>(null);

  const adminId = admin?.id ?? null;

  const reload = useCallback(async () => {
    if (adminId === null) return;
    try {
      setUsers(await service.listUsers(adminId));
    } catch (error) {
      setErrorKey(authErrorKey(error));
      setUsers([]);
    }
  }, [adminId, service]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Runs one admin action, then re-reads the list so the UI cannot drift. */
  async function run(
    target: User,
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    if (adminId === null || busyUserId !== null) return;
    setErrorKey(null);
    setNotice(null);
    setBusyUserId(target.id);
    try {
      await action();
      setNotice(successMessage);
      setPrompt(null);
      await reload();
    } catch (error) {
      setErrorKey(authErrorKey(error));
    } finally {
      setBusyUserId(null);
    }
  }

  if (adminId === null) return null;

  if (users === null) {
    return (
      <StaffShell activeId="accounts" title={t("users.title")}>
        <p className="text-base text-muted">{t("users.loading")}</p>
      </StaffShell>
    );
  }

  const pendingCount = users.filter(
    (candidate) => candidate.status === USER_STATUSES.PENDING_VERIFICATION,
  ).length;

  return (
    <StaffShell
      activeId="accounts"
      title={t("users.title")}
      subtitle={t("users.subtitle")}
    >
      {errorKey !== null && <Banner tone="error">{t(errorKey)}</Banner>}
      {notice !== null && <Banner tone="success">{notice}</Banner>}
      {pendingCount > 0 && (
        <Banner tone="warning">
          {t("users.pendingCount", { count: pendingCount })}
        </Banner>
      )}

      {SECTION_ORDER.map((status) => {
        const inSection = users.filter(
          (candidate) => candidate.status === status,
        );
        return (
          <Section key={status} title={t(SECTION_TITLE_KEYS[status])}>
            {inSection.length === 0 ? (
              <p className="text-base text-muted">{t("users.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {inSection.map((row) => {
                  const isSelf = row.id === adminId;
                  const isBusy = busyUserId === row.id;
                  return (
                    <li
                      key={row.id}
                      className="flex flex-col gap-3 rounded-card border border-card-border bg-surface-raised p-4 elevation-1"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar name={row.name} />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 break-words font-heading text-lg font-bold text-on-surface">
                              {row.name}
                            </span>
                            <Chip
                              tone={STATUS_TONES[row.status]}
                              className="shrink-0"
                            >
                              {t(`codes:userStatus.${row.status}`)}
                            </Chip>
                          </div>
                          <span className="text-base text-muted">
                            {t(`codes:role.${row.role}`)}
                            {isSelf ? ` · ${t("users.you")}` : ""}
                          </span>
                          <span className="text-sm text-muted">
                            {row.username}
                          </span>
                          {row.professionalDesignation !== undefined && (
                            <span className="text-sm text-muted">
                              {row.professionalDesignation}
                            </span>
                          )}
                          {row.organization !== undefined && (
                            <span className="text-sm text-muted">
                              {row.organization}
                            </span>
                          )}
                        </div>
                      </div>

                      {/*
                        Three pills at the 48px floor, each taking an equal
                        share of the row. Disable is `secondary` rather than
                        the filled destructive: it sits in a LIST, and a column
                        of red buttons reads as an alarm about the people on
                        the screen rather than about the action. The weight
                        belongs on the confirm step below, which is where the
                        decision actually gets made — and it is reversible
                        anyway, since Activate brings an account back.
                      */}
                      <div className="flex flex-wrap gap-2">
                        {row.status !== USER_STATUSES.ACTIVE && (
                          <span className="flex-1">
                            <Button
                              size="sm"
                              variant="primary"
                              fullWidth
                              disabled={isBusy}
                              onClick={() =>
                                void run(
                                  row,
                                  () =>
                                    service.activateUser({
                                      actingUserId: adminId,
                                      targetUserId: row.id,
                                    }),
                                  t("users.activated", { name: row.name }),
                                )
                              }
                            >
                              {t("action.activate")}
                            </Button>
                          </span>
                        )}

                        {row.status === USER_STATUSES.ACTIVE && !isSelf && (
                          <span className="flex-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              fullWidth
                              disabled={isBusy}
                              onClick={() =>
                                setPrompt({ kind: "disable", user: row })
                              }
                            >
                              {t("action.disable")}
                            </Button>
                          </span>
                        )}

                        <span className="flex-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            fullWidth
                            disabled={isBusy}
                            onClick={() =>
                              setPrompt({ kind: "reset", user: row })
                            }
                          >
                            {t("action.resetPassword")}
                          </Button>
                        </span>
                      </div>

                      {prompt?.user.id === row.id &&
                        prompt.kind === "disable" && (
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
                                t("users.disabled", { name: row.name }),
                              )
                            }
                          />
                        )}

                      {prompt?.user.id === row.id &&
                        prompt.kind === "reset" && (
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
                                t("users.resetPasswordDone", {
                                  name: row.name,
                                }),
                              )
                            }
                          />
                        )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        );
      })}
    </StaffShell>
  );
}

function ConfirmDisable({
  name,
  busy,
  onConfirm,
  onCancel,
}: {
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useAuthTranslation();
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-destructive-surface p-4">
      <p className="text-base font-medium text-on-destructive-surface">
        {t("users.confirmDisable", { name })}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-12 flex-1 rounded-xl border-2 border-border-strong px-4 py-2 text-base font-semibold text-on-surface"
        >
          {t("action.cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-12 flex-1 rounded-xl bg-destructive px-4 py-2 text-base font-semibold text-on-primary active:opacity-90 disabled:bg-border-strong"
        >
          {t("action.confirm")}
        </button>
      </div>
    </div>
  );
}

function ResetPasswordForm({
  name,
  busy,
  onSubmit,
  onCancel,
}: {
  name: string;
  busy: boolean;
  onSubmit: (newPassword: string) => void;
  onCancel: () => void;
}) {
  const { t } = useAuthTranslation();
  const [newPassword, setNewPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(newPassword);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl bg-surface-sunken p-4"
      noValidate
    >
      <PasswordField
        label={t("users.resetPasswordFor", { name })}
        hint={t("field.passwordHint")}
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
          {t("action.cancel")}
        </button>
        <div className="flex-1">
          <PrimaryButton disabled={busy}>
            {t("action.resetPassword")}
          </PrimaryButton>
        </div>
      </div>
    </form>
  );
}
