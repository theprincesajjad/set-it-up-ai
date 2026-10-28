"use client";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { LOCALE_LIST } from "@ll/shared";
import { useLocale } from "@/lib/i18n/client";

/** A choice chip for the kiosk (Figma 15:130): a 56 px pill, black when picked. */
const chip = (on: boolean) => cn("min-h-14 rounded-full border px-6 text-body-strong focus-visible:focus-ring", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-hover");

/** English, हिन्दी, اردو, ਪੰਜਾਬੀ: each in its own script with its own `lang`, black when it is the page's language. Replaces the segmented switcher on the kiosk only. */
function LanguageChips() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div role="group" aria-label={t("lang.label")} className="flex flex-wrap justify-center gap-2">
      {LOCALE_LIST.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-pressed={locale === l.code}
          onClick={() => setLocale(l.code)}
          className={cn("min-h-11 rounded-full border px-4 text-meta-strong focus-visible:focus-ring", locale === l.code ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-hover")}
        >
          {l.name}
        </button>
      ))}
    </div>
  );
}

/**
 * The tablet at the door, on a page of its own (/door/<shop>): a wait panel and the join form a customer sees on their phone.
 * It has no dashboard menu, and it can only be left with a staff PIN. A tablet whose signed-in staff member has no PIN asks for one first,
 * so a walk-in handed the tablet can never reach the client list.
 */
export function DoorTablet() {
  const { t } = useLocale();
  return (
    <FeatureGate keys={["booking.walkin_queue"]} title={t("counter.door.title")}>
      <Door />
    </FeatureGate>
  );
}

function Door() {
  const { api, base, me, merchantId, detail } = useMerchant();
  const { t } = useLocale();
  const router = useRouter();
  const act = useAction();
  const board = useApi(() => api.barber.board(), [api], { pollMs: 8_000 });
  const b = board.data;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [consent, setConsent] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);
  const [tried, setTried] = useState(false);
  const [joined, setJoined] = useState<{ name: string; position: number | null; text: boolean } | null>(null);
  const hasPin = me.merchants.find((m) => m.merchantId === merchantId)?.hasPin ?? false;
  const [pinSet, setPinSet] = useState(hasPin);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!joined) return;
    const timer = setTimeout(() => setJoined(null), 20_000);
    return () => clearTimeout(timer);
  }, [joined]);
  // The text box and the phone go together: no number, no box.
  const textOk = consent && !!phone;

  const open = b?.settings.open ?? false;
  const estimate = b?.stats.estimateMin ?? null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!name.trim()) return;
    const text = textOk;
    const r = await act.run(() => api.barber.add({ name: name.trim(), phone: phone ?? undefined, serviceId: serviceId || null, requestedStaffId: staffId || null, textConsent: text, source: "tablet" }));
    if (r) {
      setJoined({ name: r.entry.name, position: r.entry.position, text });
      setName("");
      setPhone(null);
      setFieldKey((k) => k + 1);
      setServiceId("");
      setStaffId("");
      setConsent(false);
      setTried(false);
      await board.reload();
    }
  }

  if (!pinSet) return <SetPin onDone={() => setPinSet(true)} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-hover text-body-strong uppercase text-foreground">
            {detail.merchant.name.trim()[0]}
          </span>
          <p className="min-w-0 truncate font-display text-title font-semibold text-foreground"><bdi>{detail.merchant.name}</bdi></p>
        </div>
        <Button variant="ghost" size="sm" iconStart={Lock} onClick={() => setLeaving(true)}>{t("counter.staff")}</Button>
      </div>
      <LanguageChips />
      <div className="grid min-h-[calc(100vh-14rem)] grid-cols-1 overflow-hidden rounded-card border border-border bg-background md:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col justify-center gap-3 bg-muted px-8 py-10 text-foreground">
          <p className="text-meta text-muted-foreground">{open ? t("door.line") : t("q.closed")}</p>
          <p className="font-display text-display">{!open ? t("door.closedShort") : estimate === null ? t("door.noChair") : estimate <= 0 ? t("q.noWait") : t("q.estimate", { min: estimate })}</p>
          <p className="text-body text-muted-foreground">{b ? t("door.waiting", { n: b.stats.waiting }) : ""}</p>
          {b?.called.length ? (
            <div className="mt-2 flex flex-col gap-1 rounded-xl bg-background px-4 py-3" aria-live="polite">
              <p className="text-meta text-muted-foreground">{t("door.yourTurn")}</p>
              {b.called.map((c) => (
                <p key={c.id} className="text-title font-semibold"><bdi>{c.name}</bdi> {c.calledStaffId ? `→ ${b.chairs.find((x) => x.staffId === c.calledStaffId)?.name.split(" ")[0] ?? ""}` : ""}</p>
              ))}
            </div>
          ) : null}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-5 px-8 py-8">
          <h1 className="font-display text-h1 text-foreground">{t("door.heading")}</h1>
          {joined ? (
            <Banner tone="success">
              {joined.text ? t("door.joinedText", { name: joined.name, n: joined.position ?? 1 }) : t("door.joinedNoText", { name: joined.name, n: joined.position ?? 1 })}
            </Banner>
          ) : null}
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          {!open ? <Banner tone="info">{t("door.closedAsk")}</Banner> : null}
          <TextField label={t("q.firstName")} value={name} onChange={(e) => setName(e.target.value)} error={tried && !name.trim() ? t("q.nameRequired") : undefined} autoComplete="off" />
          <PhoneField key={fieldKey} label={t("q.phone")} onChangeE164={setPhone} size="lg" />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-meta text-muted-foreground">{t("q.service")}</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(serviceId === "")} onClick={() => setServiceId("")}>{t("door.cut")}</button>
              {(b?.services ?? []).filter((s) => s.name !== "Cut").map((s) => (
                <button key={s.id} type="button" className={chip(serviceId === s.id)} onClick={() => setServiceId(s.id)}>{s.name}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-meta text-muted-foreground">{t("q.barber")}</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(staffId === "")} onClick={() => setStaffId("")}>{t("q.anyone")}</button>
              {(b?.chairs ?? []).filter((c) => c.takesWalkIns).map((c) => (
                <button key={c.staffId} type="button" className={chip(staffId === c.staffId)} onClick={() => setStaffId(c.staffId)}>{c.name.split(" ")[0]}</button>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-3 text-body text-foreground">
            <input type="checkbox" className="size-6 shrink-0" checked={textOk} disabled={!phone} onChange={(e) => setConsent(e.target.checked)} />
            {t("q.consent")}
          </label>
          <Button type="submit" size="kiosk" loading={act.busy} disabled={!open}>{t("q.join")}</Button>
          {!phone ? <p className="text-center text-meta text-muted-foreground">{t("door.noPhoneNote")}</p> : null}
        </form>
      </div>
      <PinDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onVerified={() => router.push(`${base}/queue`)}
      />
    </div>
  );
}

/** A tablet signed in as someone with no PIN: set one now, so the tablet can be locked. */
function SetPin({ onDone }: { onDone: () => void }) {
  const { api, me } = useMerchant();
  const { t } = useLocale();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-16">
      <h1 className="font-display text-h1 text-foreground">{t("counter.door.setPin")}</h1>
      <p className="text-body text-fg-muted">{t("counter.door.setPinBody")}</p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <TextField label={t("counter.pin.label")} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      <Button
        size="lg"
        loading={busy}
        disabled={!/^\d{4,6}$/.test(pin)}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.setPin(me.user.id, pin);
            onDone();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("counter.door.savePin")}
      </Button>
    </div>
  );
}

function PinDialog({ open, onClose, onVerified }: { open: boolean; onClose: () => void; onVerified: () => void }) {
  const { api } = useMerchant();
  const { t } = useLocale();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await api.verifyStaffPin({ pin });
      setPin("");
      onVerified();
    } catch (e) {
      setError(errorMessage(e));
      setPin("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        setPin("");
        setError(null);
        onClose();
      }}
      title={t("counter.door.staffOnly")}
      description={t("counter.door.leaveBody")}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>{t("counter.door.back")}</Button>
          <Button loading={busy} disabled={!/^\d{4,6}$/.test(pin)} onClick={go}>{t("counter.door.leave")}</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (/^\d{4,6}$/.test(pin)) void go(); }}>
        {error ? <Banner tone="danger" className="mb-3">{error}</Banner> : null}
        <TextField label={t("counter.door.staffPin")} type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus />
      </form>
    </Modal>
  );
}
