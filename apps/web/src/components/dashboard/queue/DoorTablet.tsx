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
import { LanguageSwitcher } from "@/lib/i18n/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/client";

const chip = (on: boolean) => cn("rounded-pill border px-4 py-2 text-meta-strong", on ? "border-fg bg-fg text-bg" : "border-line bg-bg text-fg hover:bg-bg-subtle");

/**
 * The tablet at the door, on a page of its own (/door/<shop>): a wait panel and the join form a customer sees on their phone.
 * It has no dashboard menu, and it can only be left with a staff PIN. A tablet whose signed-in staff member has no PIN asks for one first,
 * so a walk-in handed the tablet can never reach the client list.
 */
export function DoorTablet() {
  return (
    <FeatureGate keys={["booking.walkin_queue"]} title="Door tablet">
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-[20px] font-semibold text-fg"><bdi>{detail.merchant.name}</bdi></p>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" size="sm" iconStart={Lock} onClick={() => setLeaving(true)}>Staff</Button>
        </div>
      </div>
      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 overflow-hidden rounded-card border border-line md:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col justify-center gap-3 bg-fg px-8 py-10 text-bg">
          <p className="text-meta text-bg/70">{open ? t("door.line") : t("q.closed")}</p>
          <p className="font-display text-[40px] font-semibold leading-none tracking-[-0.02em]">{!open ? t("door.closedShort") : estimate === null ? t("door.noChair") : estimate <= 0 ? t("q.noWait") : t("q.estimate", { min: estimate })}</p>
          <p className="text-body text-bg/80">{b ? t("door.waiting", { n: b.stats.waiting }) : ""}</p>
          {b?.called.length ? (
            <div className="mt-2 flex flex-col gap-1 rounded-card bg-bg/10 px-4 py-3" aria-live="polite">
              <p className="text-meta text-bg/70">{t("door.yourTurn")}</p>
              {b.called.map((c) => (
                <p key={c.id} className="text-title font-semibold"><bdi>{c.name}</bdi> {c.calledStaffId ? `→ ${b.chairs.find((x) => x.staffId === c.calledStaffId)?.name.split(" ")[0] ?? ""}` : ""}</p>
              ))}
            </div>
          ) : null}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-5 px-8 py-8">
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.01em] text-fg">{t("door.heading")}</h1>
          {joined ? (
            <Banner tone="success">
              {joined.text ? t("door.joinedText", { name: joined.name, n: joined.position ?? 1 }) : t("door.joinedNoText", { name: joined.name, n: joined.position ?? 1 })}
            </Banner>
          ) : null}
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          {!open ? <Banner tone="info">{t("door.closedAsk")}</Banner> : null}
          <TextField label={t("q.firstName")} value={name} onChange={(e) => setName(e.target.value)} error={tried && !name.trim() ? t("q.nameRequired") : undefined} autoComplete="off" />
          <PhoneField key={fieldKey} label={t("q.phone")} onChangeE164={setPhone} />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-meta text-fg-muted">{t("q.service")}</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(serviceId === "")} onClick={() => setServiceId("")}>{t("door.cut")}</button>
              {(b?.services ?? []).filter((s) => s.name !== "Cut").map((s) => (
                <button key={s.id} type="button" className={chip(serviceId === s.id)} onClick={() => setServiceId(s.id)}>{s.name}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-meta text-fg-muted">{t("q.barber")}</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(staffId === "")} onClick={() => setStaffId("")}>{t("q.anyone")}</button>
              {(b?.chairs ?? []).filter((c) => c.takesWalkIns).map((c) => (
                <button key={c.staffId} type="button" className={chip(staffId === c.staffId)} onClick={() => setStaffId(c.staffId)}>{c.name.split(" ")[0]}</button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-3 text-body text-fg">
            <input type="checkbox" className="size-5" checked={textOk} disabled={!phone} onChange={(e) => setConsent(e.target.checked)} />
            {t("q.consent")}
          </label>
          {!phone ? <p className="-mt-3 text-meta text-fg-muted">{t("door.noPhoneNote")}</p> : null}
          <Button type="submit" size="lg" loading={act.busy} disabled={!open}>{t("q.join")}</Button>
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
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto flex max-w-[420px] flex-col gap-4 py-16">
      <h1 className="font-display text-[28px] font-semibold text-fg">Set a PIN for this tablet</h1>
      <p className="text-body text-fg-muted">Customers use the tablet at the door. A 4 to 6 digit staff PIN is what lets you leave this page, so they never reach your client list.</p>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <TextField label="PIN" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
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
        Save PIN and open the tablet
      </Button>
    </div>
  );
}

function PinDialog({ open, onClose, onVerified }: { open: boolean; onClose: () => void; onVerified: () => void }) {
  const { api } = useMerchant();
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
      title="Staff only"
      description="Enter your staff PIN to leave the tablet."
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Back</Button>
          <Button loading={busy} disabled={!/^\d{4,6}$/.test(pin)} onClick={go}>Leave the tablet</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (/^\d{4,6}$/.test(pin)) void go(); }}>
        {error ? <Banner tone="danger" className="mb-3">{error}</Banner> : null}
        <TextField label="Staff PIN" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus />
      </form>
    </Modal>
  );
}
