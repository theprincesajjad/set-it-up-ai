"use client";
/** The waitlist page's two dialogs: add a client by hand, and offer one of the next openings to a client (phase-pro P2). */
import { useState } from "react";
import { waitlistApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { errorMessage } from "@/lib/api/errors";
import { addDays, todayOf } from "@/lib/dashboard/calendar";
import { useApi } from "@/lib/dashboard/useApi";
import { PREF_KEY, useWaitlistApi } from "@/lib/dashboard/waitlist";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

export function AddClientDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { api: shop, detail } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const api = useWaitlistApi();
  const services = useApi(open ? () => shop.appointments.services("appointment") : null, [shop, open]);
  const staff = useApi(open ? () => shop.appointments.staff() : null, [shop, open]);
  const today = todayOf(new Date(), detail.merchant.timezone);
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 13));
  const [pref, setPref] = useState<waitlistApi.WaitlistTimePref>("any");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = (services.data?.items ?? []).filter((s) => s.active);
  const chosen = serviceId || list[0]?.id || "";

  async function save() {
    if (!name.trim()) return setError(t("wl.add.needName"));
    setBusy(true);
    setError(null);
    try {
      await api.add({ serviceId: chosen, staffId: staffId || null, windowStart: from, windowEnd: to < from ? from : to, timePref: pref, name: name.trim(), phone: phone.trim() || null, email: email.trim() || null });
      setName("");
      setPhone("");
      setEmail("");
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("wl.add.title")}
      description={t("wl.add.body")}
      size="md"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>{t("wl.cancel")}</Button>
          <Button loading={busy} disabled={!chosen} onClick={() => void save()}>{t("wl.add.save")}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("wl.add.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <TextField label={t("wl.add.phone")} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint={t("wl.add.phoneHint")} />
        <TextField label={t("wl.add.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} optionalLabel />
        <Select label={t("wl.add.service")} value={chosen} onChange={(e) => setServiceId(e.target.value)} options={list.map((s) => ({ value: s.id, label: s.name }))} />
        <Select label={t("wl.add.staff")} value={staffId} onChange={(e) => setStaffId(e.target.value)} options={[{ value: "", label: t("wl.anyone") }, ...(staff.data?.items ?? []).map((s) => ({ value: s.userId, label: s.name }))]} />
        <Select label={t("wl.add.time")} value={pref} onChange={(e) => setPref(e.target.value as waitlistApi.WaitlistTimePref)} options={waitlistApi.WAITLIST_TIME_PREFS.map((p) => ({ value: p, label: t(PREF_KEY[p]) }))} />
        <TextField label={t("wl.add.from")} type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} />
        <TextField label={t("wl.add.to")} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </div>
      {error ? <Banner tone="danger" className="mt-3">{error}</Banner> : null}
    </Modal>
  );
}

export function OfferSlotDialog({ entry, tz, onClose, onSent }: { entry: waitlistApi.WaitlistEntryDto; tz: string; onClose: () => void; onSent: (name: string) => void | Promise<void> }) {
  const { t, date, time } = useLocaleOrEnglish();
  const api = useWaitlistApi();
  const openings = useApi(() => api.openings(entry.id), [api, entry.id]);
  const [pick, setPick] = useState<waitlistApi.OpeningsResponse["items"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = entry.customer.name.split(" ")[0]!;

  async function send() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      await api.offer(entry.id, { startsAt: pick.startsAt, staffId: pick.staffId });
      await onSent(first);
    } catch (e) {
      setError(errorMessage(e));
      await openings.reload();
      setPick(null);
    } finally {
      setBusy(false);
    }
  }

  const items = openings.data?.items ?? [];
  return (
    <Modal
      open
      onClose={onClose}
      title={t("wl.offer.title", { name: first })}
      description={t("wl.offer.body")}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>{t("wl.cancel")}</Button>
          <Button loading={busy} disabled={!pick} onClick={() => void send()}>{t("wl.offer.send")}</Button>
        </>
      }
    >
      <p className="mb-2 text-meta text-fg-muted">{entry.serviceName}</p>
      {openings.loading && !openings.data ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full rounded-input" />)}
        </div>
      ) : items.length ? (
        <div role="radiogroup" aria-label={t("wl.offer.pick")} className="flex flex-col gap-2">
          {items.map((o) => {
            const on = pick?.startsAt === o.startsAt && pick.staffId === o.staffId;
            return (
              <button
                key={`${o.startsAt}:${o.staffId}`}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPick(o)}
                className={cn("flex min-h-11 items-center justify-between gap-3 rounded-input border px-3 text-start text-body focus-visible:focus-ring", on ? "border-primary bg-primary text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
              >
                <span className="tabular-nums">{date(o.startsAt, { weekday: "short", month: "short", day: "numeric" }, tz)}, {time(o.startsAt, tz)}</span>
                {o.staffName ? <bdi className={cn("text-meta", on ? "text-primary-foreground" : "text-fg-muted")}>{o.staffName.split(" ")[0]}</bdi> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-body text-fg-muted">{t("wl.offer.none")}</p>
      )}
      {error ? <Banner tone="danger" className="mt-3">{error}</Banner> : null}
    </Modal>
  );
}
