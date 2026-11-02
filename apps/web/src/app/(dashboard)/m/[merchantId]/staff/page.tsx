"use client";
import { KeyRound, Languages, Link2, MoreHorizontal, UserMinus, UserPlus, Wallet } from "lucide-react";
import { useState } from "react";
import { LOCALE_LIST, type merchantApi } from "@ll/shared";
import { StaffScheduleSheet } from "@/components/dashboard/calendar/StaffScheduleSheet";
import { PaySheet } from "@/components/dashboard/queue/PaySheet";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
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
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { maskPhone } from "@/lib/dashboard/customers";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

const ROLES: { value: merchantApi.StaffRole; label: string; desc: string }[] = [
  { value: "staff", label: "Staff", desc: "Counter and Today only. Can undo their own awards for 15 minutes." },
  { value: "instructor", label: "Instructor", desc: "Their own classes, class lists and check-in. No sales, customers or money." },
  { value: "manager", label: "Manager", desc: "Everything except billing and removing staff." },
  { value: "owner", label: "Owner", desc: "Everything, including billing and staff." },
];

export default function StaffPage() {
  const { api, role, me, enabled, detail } = useMerchant();
  const toast = useToast();
  const state = useApi(() => api.team(), [api]);
  const owner = role === "owner";
  const [invite, setInvite] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<merchantApi.StaffRole>("staff");
  const [pinFor, setPinFor] = useState<merchantApi.StaffMember | null>(null);
  const [pin, setPin] = useState("");
  const [remove, setRemove] = useState<merchantApi.StaffMember | null>(null);
  const [edit, setEdit] = useState<merchantApi.StaffMember | null>(null);
  const [schedule, setSchedule] = useState<merchantApi.StaffMember | null>(null);
  const [pay, setPay] = useState<merchantApi.StaffMember | null>(null);
  const [locale, setLocale] = useState<merchantApi.StaffMember["locale"]>("en");
  const [station, setStation] = useState("");
  const act = useAction();
  const { t } = useLocaleOrEnglish();
  const menuItem = "min-h-11 gap-2.5 text-body md:min-h-9";
  const roleLabel = (r: merchantApi.StaffRole) => t(`own.staff.role.${r}` as "own.staff.role.staff");
  const copyLink = async (userId: string) => {
    await navigator.clipboard?.writeText(`${window.location.origin}/shops/${detail.merchant.slug}/book?staff=${userId}`).catch(() => undefined);
    toast({ message: t("people.linkCopied"), tone: "success" });
  };
  // Instructors only make sense where the studio runs classes.
  const roles = ROLES.filter((r) => r.value !== "instructor" || enabled("booking.classes"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title={t("own.staff.title")} description={t("own.staff.desc")} actions={owner ? <Button size="sm" iconStart={UserPlus} onClick={() => setInvite(true)}>{t("own.staff.invite")}</Button> : undefined} />
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
                      </p>
                      <p className="break-words text-meta text-fg-muted">{s.phone ? maskPhone(s.phone) : s.email}</p>
                      <p className="text-meta text-fg-muted tabular">
                        {[t("own.staff.added", { date: formatDate(s.createdAt) }), s.hasPin ? t("own.staff.pinSet") : t("own.staff.noPin"), lang, s.station ? t("own.staff.station", { station: s.station }) : null].filter(Boolean).join(" · ")}
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
                              <option key={r.value} value={r.value}>
                                {roleLabel(r.value)}
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
            {d.items.length <= 1 && owner ? (
              <EmptyState
                icon={UserPlus}
                title={t("own.staff.soloTitle")}
                description={enabled("booking.appointments") ? t("own.staff.soloBodyBooking") : t("own.staff.soloBody")}
                action={<Button size="sm" iconStart={UserPlus} onClick={() => setInvite(true)}>{t("own.staff.invite")}</Button>}
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
        onClose={() => setInvite(false)}
        title="Invite staff"
        actions={
          <>
            <Button variant="secondary" onClick={() => setInvite(false)}>
              Cancel
            </Button>
            <Button
              loading={act.busy}
              onClick={async () => {
                if (!phone && !email.trim()) return act.setError("Add a mobile number or email.");
                const r = await act.run(() => api.invite({ name: name.trim() || undefined, phone: phone ?? undefined, email: email.trim() || undefined, role: newRole }));
                if (r) {
                  toast({ message: `Invite sent to ${name || "your new staff member"}`, tone: "success" });
                  setInvite(false);
                  setName("");
                  setEmail("");
                  setPhone(null);
                  await state.reload();
                }
              }}
            >
              Send invite
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <PhoneField label="Mobile number" hint="We text them a link to sign in." onChangeE164={setPhone} />
          <TextField type="email" label="Email" optionalLabel value={email} onChange={(e) => setEmail(e.target.value)} />
          <fieldset className="flex flex-col divide-y divide-line rounded-input border border-line">
            <legend className="mb-1 text-meta-strong text-fg">Role</legend>
            {roles.map((r) => (
              <label key={r.value} className={cn("flex cursor-pointer items-start gap-3 px-3 py-2.5", newRole === r.value && "bg-bg-subtle")}>
                <input type="radio" name="role" checked={newRole === r.value} onChange={() => setNewRole(r.value)} className="mt-0.5 size-4 accent-[var(--ll-color-fg)]" />
                <span>
                  <span className="block text-meta-strong text-fg">{r.label}</span>
                  <span className="block text-meta text-fg-muted">{r.desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-caption text-fg-muted">Unlimited staff, always free.</p>
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={`Language and station for ${edit?.name ?? "staff"}`}
        body="Their counter app and kitchen screen open in this language and show this station's tickets first."
        confirmLabel="Save"
        onConfirm={async () => {
          await api.setStaffProfile(edit!.userId, { locale, station: station.trim() || null });
          toast({ message: "Saved", tone: "success" });
          await state.reload();
        }}
      >
        <div className="flex flex-col gap-4">
          <Select label="Language" value={locale} onChange={(e) => setLocale(e.target.value as merchantApi.StaffMember["locale"])} options={LOCALE_LIST.map((l) => ({ value: l.code, label: `${l.englishName} (${l.name})` }))} />
          <TextField label="Kitchen station" optionalLabel hint="For example tandoor, curry or chai. Leave empty to see every station." maxLength={60} value={station} onChange={(e) => setStation(e.target.value)} />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!pinFor}
        onClose={() => {
          setPinFor(null);
          setPin("");
        }}
        title={`Counter PIN for ${pinFor?.name ?? "staff"}`}
        body="4 to 6 digits. They use it to switch to themselves on a shared counter device."
        confirmLabel="Save PIN"
        disabled={!/^\d{4,6}$/.test(pin)}
        onConfirm={async () => {
          await api.setPin(pinFor!.userId, pin);
          toast({ message: "PIN saved", tone: "success" });
          await state.reload();
        }}
      >
        <TextField label="PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </ConfirmDialog>
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title={`Remove ${remove?.name ?? "this person"} from staff?`}
        body={`${remove?.name ?? "They"} can't award points after this. Their past activity stays in your reports.`}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          await api.removeStaff(remove!.userId);
          await state.reload();
        }}
      />
    </div>
  );
}
