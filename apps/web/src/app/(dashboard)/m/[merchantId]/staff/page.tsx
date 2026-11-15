"use client";
import { KeyRound, Languages, Link2, MailPlus, MoreHorizontal, UserMinus, UserPlus, Wallet } from "lucide-react";
import { useRef, useState } from "react";
import { LOCALE_LIST, type merchantApi } from "@ll/shared";
import { StaffScheduleSheet } from "@/components/dashboard/calendar/StaffScheduleSheet";
import { PaySheet } from "@/components/dashboard/queue/PaySheet";
import { EmptyState, PageHeader, SkeletonRows, Tag } from "@/components/dashboard/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/primitives/dropdown-menu";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Avatar } from "@/components/ui/Avatar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { isApiError } from "@/lib/api/errors";
import { focusFirstInvalid, useErrorText } from "@/lib/api/useErrorText";
import { cn } from "@/lib/cn";
import { maskPhone } from "@/lib/dashboard/customers";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

const ROLE_VALUES: merchantApi.StaffRole[] = ["staff", "instructor", "manager", "owner"];
const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** A dialog that confirms one action: Cancel and the action, Enter saves, a failure stays inside the dialog. The words are the page's own, in its language. */
function Confirm({ open, onClose, title, body, confirmLabel, danger, onConfirm, children, disabled }: { open: boolean; onClose: () => void; title: string; body?: string; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<unknown>; children?: React.ReactNode; disabled?: boolean }) {
  const { t } = useLocaleOrEnglish();
  const text = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setError(null);
    onClose();
  };
  async function go() {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      close();
    } catch (e) {
      setError(text(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={body}
      actions={
        <>
          <Button variant="secondary" onClick={close}>{t("own.staff.cancel")}</Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} disabled={disabled} onClick={() => void go()}>{confirmLabel}</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void go(); }} className="flex flex-col gap-4">
        {children}
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {/* Enter in a field saves; the visible button is in the dialog's footer. */}
        <button type="submit" hidden tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  );
}

export default function StaffPage() {
  const { api, role, me, enabled, detail } = useMerchant();
  const toast = useToast();
  const state = useApi(() => api.team(), [api]);
  const owner = role === "owner";
  const [invite, setInvite] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<merchantApi.StaffRole>("staff");
  // The invite has its own action state, so its error shows once, inside its sheet, and never on the page behind it.
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string }>({});
  const [triedInvite, setTriedInvite] = useState(false);
  const inviteForm = useRef<HTMLFormElement>(null);
  const resetInvite = () => {
    setName("");
    setEmail("");
    setPhone(null);
    setPhoneDigits("");
    setNewRole("staff");
    setFieldErr({});
    setTriedInvite(false);
    setInviteError(null);
  };
  const closeInvite = () => {
    setInvite(false);
    resetInvite();
  };
  const [pinFor, setPinFor] = useState<merchantApi.StaffMember | null>(null);
  const [pin, setPin] = useState("");
  const [remove, setRemove] = useState<merchantApi.StaffMember | null>(null);
  const [edit, setEdit] = useState<merchantApi.StaffMember | null>(null);
  const [schedule, setSchedule] = useState<merchantApi.StaffMember | null>(null);
  const [pay, setPay] = useState<merchantApi.StaffMember | null>(null);
  const [locale, setLocale] = useState<merchantApi.StaffMember["locale"]>("en");
  const [station, setStation] = useState("");
  const act = useAction();
  const { t, date: dateL } = useLocaleOrEnglish();
  const errText = useErrorText();
  const menuItem = "min-h-11 gap-2.5 text-body md:min-h-9";
  const roleLabel = (r: merchantApi.StaffRole) => t(`own.staff.role.${r}` as "own.staff.role.staff");
  const copyLink = async (userId: string) => {
    await navigator.clipboard?.writeText(`${window.location.origin}/shops/${detail.merchant.slug}/book?staff=${userId}`).catch(() => undefined);
    toast({ message: t("people.linkCopied"), tone: "success" });
  };
  // Instructors only make sense where the studio runs classes.
  const showSolo = owner && !!state.data && state.data.items.length <= 1;
  const roles = ROLE_VALUES.filter((r) => r !== "instructor" || enabled("booking.classes"));

  async function sendInvite() {
    if (inviteBusy) return;
    setTriedInvite(true);
    setInviteError(null);
    const em = email.trim();
    const errs: { email?: string } = {};
    // A mobile number typed but not whole is the phone field's own problem (it shows its message); otherwise one contact is enough.
    const phoneBad = phoneDigits.length > 0 && !phone;
    if (em && !EMAIL_RE.test(em)) errs.email = t("own.staff.err.email");
    else if (!phone && !em && !phoneBad) errs.email = t("own.staff.err.contact");
    setFieldErr(errs);
    if (errs.email || phoneBad) return focusFirstInvalid(inviteForm.current);
    setInviteBusy(true);
    try {
      await api.invite({ name: name.trim() || undefined, phone: phone ?? undefined, email: em || undefined, role: newRole });
      toast({ message: name.trim() ? t("own.staff.inviteSent", { name: name.trim() }) : t("own.staff.inviteSentNoName"), tone: "success" });
      closeInvite();
      await state.reload();
    } catch (e) {
      // Said once, in the sheet, in our words: an existing member is named; anything else is the shared sentence for that kind of failure.
      setInviteError(isApiError(e) && e.status === 409 ? (name.trim() ? t("own.staff.err.exists", { name: name.trim() }) : t("own.staff.err.existsNoName")) : errText(e));
    } finally {
      setInviteBusy(false);
    }
  }

  async function resendInvite(s: merchantApi.StaffMember) {
    try {
      await api.resendInvite(s.userId);
      toast({ message: t("own.staff.resent", { name: s.name ?? s.email ?? s.phone ?? t("own.staff.someone") }), tone: "success" });
    } catch (e) {
      toast({ message: errText(e), tone: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* One primary "Invite staff" per view: the header's is the primary one; the empty card's repeats it as a secondary button. */}
      <PageHeader flush title={t("own.staff.title")} description={t("own.staff.desc")} actions={owner ? <Button size="sm" iconStart={UserPlus} className="max-sm:min-h-11" onClick={() => setInvite(true)}>{t("own.staff.invite")}</Button> : undefined} />
      <Async state={state} skeleton={<SkeletonRows rows={3} />}>
        {(d) => (
          <>
            {/* Square-style team list: who they are on the left, one main action and a "more" menu on the right (was six buttons a row). */}
            <ul aria-label={t("own.staff.listLabel")} className="staff-list divide-y divide-line overflow-hidden rounded-card bg-card shadow-card">
              {d.items.map((s) => {
                const self = s.userId === me.user.id;
                const display = s.name ?? s.email ?? t("own.staff.invited");
                const first = (s.name ?? s.email ?? "").split(" ")[0] ?? "";
                const booking = enabled("booking.appointments");
                const canPin = owner || self;
                const lang = s.locale !== "en" ? LOCALE_LIST.find((l) => l.code === s.locale)?.englishName ?? s.locale : null;
                return (
                  <li key={s.userId} className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                    <Avatar name={display} id={s.userId} size={40} />
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-strong text-fg">
                        <span className="min-w-0 break-words">{display}</span>
                        {self ? <span className="text-meta font-normal text-fg-muted">({t("own.staff.you")})</span> : null}
                        {!owner || self ? <Tag>{roleLabel(s.role)}</Tag> : null}
                        {!s.signedIn ? <Tag>{t("own.staff.notSignedIn")}</Tag> : null}
                      </p>
                      <p className="break-words text-meta text-fg-muted">{s.phone ? maskPhone(s.phone) : s.email}</p>
                      <p className="text-meta text-fg-muted tabular">
                        {[t("own.staff.added", { date: dateL(s.createdAt, { month: "short", day: "numeric" }, "America/Toronto") }), s.hasPin ? t("own.staff.pinSet") : t("own.staff.noPin"), lang, s.station ? t("own.staff.station", { station: s.station }) : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex w-full items-center justify-end gap-2 ps-[52px] sm:w-auto sm:ps-0">
                      {owner && !self ? (
                        <label className="min-w-0 max-sm:flex-1">
                          <span className="sr-only">{t("own.staff.roleFor", { name: s.name ?? t("own.staff.someone") })}</span>
                          <select value={s.role} onChange={async (e) => {
                            const r = await act.run(() => api.setRole(s.userId, e.target.value as merchantApi.StaffRole));
                            if (r) await state.reload();
                          }} className="h-11 w-full rounded-input border border-line bg-bg px-2.5 text-meta text-fg hover:bg-bg-subtle sm:h-9 sm:w-auto">
                            {roles.map((r) => (
                              <option key={r} value={r}>
                                {roleLabel(r)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {booking && role !== "staff" ? (
                        <Button variant="secondary" size="sm" className="max-sm:min-h-11 max-sm:flex-1" onClick={() => setSchedule(s)}>
                          {t("own.staff.hours")}
                        </Button>
                      ) : canPin ? (
                        <Button variant="secondary" size="sm" className="max-sm:min-h-11 max-sm:flex-1" onClick={() => setPinFor(s)}>
                          {s.hasPin ? t("own.staff.resetPin") : t("own.staff.setPin")}
                        </Button>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger aria-label={t("own.staff.more", { name: first || display })} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg hover:bg-bg-subtle focus-visible:focus-ring sm:size-9">
                          <MoreHorizontal aria-hidden className="size-5" strokeWidth={1.75} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          {booking ? (
                            <DropdownMenuItem className={menuItem} data-testid="staff-link" onClick={() => copyLink(s.userId)}>
                              <Link2 aria-hidden />
                              {t("people.staffLink", { name: first || t("people.copyLink") })}
                            </DropdownMenuItem>
                          ) : null}
                          {booking && canPin ? (
                            <DropdownMenuItem className={menuItem} onClick={() => setPinFor(s)}>
                              <KeyRound aria-hidden />
                              {s.hasPin ? t("own.staff.resetPin") : t("own.staff.setPin")}
                            </DropdownMenuItem>
                          ) : null}
                          {enabled("staff.payouts") && role !== "staff" ? (
                            <DropdownMenuItem className={menuItem} onClick={() => setPay(s)}>
                              <Wallet aria-hidden />
                              {t("own.staff.pay")}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem className={menuItem} onClick={() => { setEdit(s); setLocale(s.locale); setStation(s.station ?? ""); }}>
                            <Languages aria-hidden />
                            {t("own.staff.langStation")}
                          </DropdownMenuItem>
                          {owner && !self && !s.signedIn && (s.email || s.phone) ? (
                            <DropdownMenuItem className={menuItem} onClick={() => void resendInvite(s)}>
                              <MailPlus aria-hidden />
                              {t("own.staff.resend")}
                            </DropdownMenuItem>
                          ) : null}
                          {owner && !self ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" className={menuItem} onClick={() => setRemove(s)}>
                                <UserMinus aria-hidden />
                                {t("own.staff.remove")}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
            {showSolo ? (
              <EmptyState
                icon={UserPlus}
                title={t("own.staff.soloTitle")}
                description={enabled("booking.appointments") ? t("own.staff.soloBodyBooking") : t("own.staff.soloBody")}
                action={<Button size="sm" variant="secondary" iconStart={UserPlus} className="max-sm:min-h-11" onClick={() => setInvite(true)}>{t("own.staff.invite")}</Button>}
              />
            ) : null}
          </>
        )}
      </Async>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <StaffScheduleSheet open={!!schedule} onClose={() => setSchedule(null)} member={schedule} />
      <PaySheet open={!!pay} onClose={() => setPay(null)} member={pay} />

      <Modal
        open={invite}
        onClose={closeInvite}
        title={t("own.staff.invite")}
        actions={
          <>
            <Button variant="secondary" onClick={closeInvite}>
              {t("own.staff.cancel")}
            </Button>
            <Button loading={inviteBusy} onClick={() => void sendInvite()}>
              {t("own.staff.inviteSend")}
            </Button>
          </>
        }
      >
        <form ref={inviteForm} noValidate onSubmit={(e) => { e.preventDefault(); void sendInvite(); }} className="flex flex-col gap-4">
          <TextField label={t("own.staff.inviteName")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <div role="group" aria-labelledby="invite-contact" className="flex flex-col gap-4">
            <div>
              <p id="invite-contact" className="text-meta-strong text-fg">{t("own.staff.contactLegend")}</p>
              <p className="mt-0.5 text-meta text-fg-muted">{t("own.staff.contactHint")}</p>
            </div>
            <PhoneField label={t("own.staff.phone")} onChangeE164={setPhone} onChangeDigits={setPhoneDigits} forceValidate={triedInvite && phoneDigits.length > 0} />
            <TextField type="email" label={t("own.staff.email")} autoComplete="off" autoCapitalize="none" value={email} onChange={(e) => { setEmail(e.target.value); setFieldErr((f) => ({ ...f, email: undefined })); }} error={fieldErr.email} />
          </div>
          <div role="radiogroup" aria-labelledby="invite-role">
            <p id="invite-role" className="mb-2 text-meta-strong text-fg">{t("own.staff.roleLegend")}</p>
            <div className="flex flex-col divide-y divide-line overflow-hidden rounded-input border border-line">
              {roles.map((r) => (
                <label key={r} className={cn("flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5", newRole === r && "bg-bg-subtle")}>
                  <input type="radio" name="role" checked={newRole === r} onChange={() => setNewRole(r)} className="mt-0.5 size-4 shrink-0 accent-[var(--ll-color-fg)]" />
                  <span className="min-w-0">
                    <span className="block text-meta-strong text-fg">{roleLabel(r)}</span>
                    <span className="block text-meta text-fg-muted">{t(`own.staff.role.${r}.desc` as "own.staff.role.staff.desc")}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <p className="text-caption text-fg-muted">{t("own.staff.free")}</p>
          {inviteError ? <Banner tone="danger">{inviteError}</Banner> : null}
          <button type="submit" hidden tabIndex={-1} aria-hidden />
        </form>
      </Modal>

      <Confirm
        open={!!edit}
        onClose={() => setEdit(null)}
        title={t("own.staff.langTitle", { name: edit?.name ?? t("own.staff.someone") })}
        body={t("own.staff.langBody")}
        confirmLabel={t("own.staff.save")}
        onConfirm={async () => {
          await api.setStaffProfile(edit!.userId, { locale, station: station.trim() || null });
          toast({ message: t("own.staff.saved"), tone: "success" });
          await state.reload();
        }}
      >
        <Select label={t("own.staff.language")} value={locale} onChange={(e) => setLocale(e.target.value as merchantApi.StaffMember["locale"])} options={LOCALE_LIST.map((l) => ({ value: l.code, label: `${l.englishName} (${l.name})` }))} />
        <TextField label={t("own.staff.kitchenStation")} optionalLabel hint={t("own.staff.stationHint")} maxLength={60} value={station} onChange={(e) => setStation(e.target.value)} />
      </Confirm>
      <Confirm
        open={!!pinFor}
        onClose={() => {
          setPinFor(null);
          setPin("");
        }}
        title={t("own.staff.pinTitle", { name: pinFor?.name ?? t("own.staff.someone") })}
        body={t("own.staff.pinBody")}
        confirmLabel={t("own.staff.pinSave")}
        disabled={!/^\d{4}$/.test(pin)}
        onConfirm={async () => {
          await api.setPin(pinFor!.userId, pin);
          toast({ message: t("own.staff.pinSaved"), tone: "success" });
          await state.reload();
        }}
      >
        <TextField label={t("own.staff.pinLabel")} type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus />
      </Confirm>
      <Confirm
        open={!!remove}
        onClose={() => setRemove(null)}
        title={remove?.name ? t("own.staff.removeTitle", { name: remove.name }) : t("own.staff.removeTitleNoName")}
        body={remove?.name ? t("own.staff.removeBody", { name: remove.name }) : t("own.staff.removeBodyNoName")}
        confirmLabel={t("own.staff.removeConfirm")}
        danger
        onConfirm={async () => {
          await api.removeStaff(remove!.userId);
          await state.reload();
        }}
      />
    </div>
  );
}
