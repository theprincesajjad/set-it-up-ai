"use client";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { ShopMark } from "@/components/dashboard/ShopMark";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";
import { errorKind, isApiError } from "@/lib/api/errors";
import { TITLE_KEY } from "@/lib/api/userError";
import { useErrorText } from "@/lib/api/useErrorText";
import { cn } from "@/lib/cn";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { LOCALE_LIST } from "@ll/shared";
import { useLocale } from "@/lib/i18n/client";

/** A choice chip for the kiosk (Figma 31): a 56 px pill, in the trade colour when picked. */
const chip = (on: boolean) => cn("min-h-14 rounded-full border px-6 text-body-strong focus-visible:focus-ring", on ? "border-trade bg-trade text-trade-foreground" : "border-border bg-card text-foreground hover:bg-hover");

/** English, हिन्दी, اردو, ਪੰਜਾਬੀ: each in its own script with its own `lang`, in the trade colour when it is the page's language. Replaces the segmented switcher on the kiosk only. */
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
          className={cn("min-h-11 rounded-full border px-4 text-meta-strong focus-visible:focus-ring", locale === l.code ? "border-trade bg-trade text-trade-foreground" : "border-border bg-card text-foreground hover:bg-hover")}
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
  const { t, locale, time } = useLocale();
  const errorText = useErrorText();
  const router = useRouter();
  const act = useAction();
  // The tablet sees the shop's whole line (every chair, the real counts), whoever signed it in.
  const board = useApi(() => api.barber.doorBoard(), [api], { pollMs: 8_000 });
  const b = board.data;
  // When the line last loaded: shown if a later refresh fails, so nobody reads an old wait as live.
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (b) setUpdatedAt(Date.now());
  }, [b]);
  const failed = !!board.error && !b;
  const stale = !!board.error && !!b;
  /** Nothing has come back yet: the panel holds its place instead of saying the line is closed or how long it is. */
  const loading = !b && !board.error;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [consent, setConsent] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);
  const [tried, setTried] = useState(false);
  const [joined, setJoined] = useState<{ name: string; position: number | null; text: boolean } | null>(null);
  const joinRef = useRef<HTMLFormElement>(null);
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

  const open = !failed && !loading && (b?.settings.open ?? false);
  // Urdu's tall script needs more line height than the display size gives it, or the lines touch.
  const tall = locale === "ur" ? "leading-[1.9]!" : "";
  const estimate = b?.stats.estimateMin ?? null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!name.trim()) return;
    const text = textOk;
    const r = await act.run(() => api.barber.add({ name: name.trim(), phone: phone ?? undefined, serviceId: serviceId || null, requestedStaffId: staffId || null, textConsent: text, source: "tablet" }));
    if (r) {
      // What the place really has: a repeat join returns the first place and its first choice about the text.
      setJoined({ name: r.entry.name, position: r.entry.position, text: r.textsYou ?? text });
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
  const shop = detail.merchant;

  return (
    <div data-trade={detail.merchant.vertical} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ShopMark name={shop.name} brandColor={shop.brandColor} logoUrl={shop.logoUrl} size={48} className="rounded-2xl" />
          <p className="min-w-0 truncate font-display text-title font-semibold text-foreground"><bdi>{shop.name}</bdi></p>
        </div>
        <Button variant="ghost" size="md" iconStart={Lock} onClick={() => setLeaving(true)}>{t("counter.staff")}</Button>
      </div>
      <LanguageChips />
      <div className="grid min-h-[calc(100vh-14rem)] grid-cols-1 overflow-hidden rounded-card bg-card shadow-card md:grid-cols-[360px_minmax(0,1fr)]">
        <div className={cn("flex flex-col justify-center bg-trade-soft px-8 py-10 text-trade-deep", locale === "ur" ? "gap-4" : "gap-3")}>
          {failed ? (
            // The line could not be read: say so, never "closed" or a made-up wait.
            // Walk-ins read this: what happened, one line why, Try again, and the desk. No support email, no talk of the shop's own data.
            <div role="alert" className="flex flex-col items-start gap-3" data-testid="door-failed">
              <h2 className="font-display text-title text-foreground">{t(TITLE_KEY[errorKind(board.cause)])}</h2>
              <p className="text-body text-trade-deep">{errorText(board.cause)}</p>
              <Button variant="secondary" onClick={() => void board.reload()}>{t("err.action.retry")}</Button>
              <p className="text-body text-trade-deep">{t("door.askDesk")}</p>
            </div>
          ) : loading ? (
            <SkeletonGroup label={t("door.line")} className="flex flex-col gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-12 w-56" />
              <Skeleton className="h-4 w-32" />
            </SkeletonGroup>
          ) : (
            <>
              <p className={cn("text-meta opacity-80", tall)}>{open ? t("door.line") : t("q.closed")}</p>
              <p className={cn("font-display text-display", tall)}>{!open ? t("door.closedShort") : estimate === null ? t("door.noChair") : estimate <= 0 ? t("q.noWait") : t("q.estimate", { min: estimate })}</p>
              <p className={cn("text-body opacity-80", tall)}>{b ? t("door.waiting", { n: b.stats.waiting }) : ""}</p>
              {stale && updatedAt ? <p role="status" className="text-meta font-medium">{t("door.offlineSince", { time: time(updatedAt) })}</p> : null}
            </>
          )}
          {b?.called.length ? (
            <div className="mt-2 flex flex-col gap-1 rounded-tile bg-card px-4 py-3 text-foreground shadow-card" aria-live="polite">
              <p className="text-meta text-muted-foreground">{t("door.yourTurn")}</p>
              {b.called.map((c) => (
                <p key={c.id} className="text-title font-semibold"><bdi>{c.name}</bdi> {c.calledStaffId ? `→ ${b.chairs.find((x) => x.staffId === c.calledStaffId)?.name.split(" ")[0] ?? ""}` : ""}</p>
              ))}
            </div>
          ) : null}
        </div>
        <form ref={joinRef} onSubmit={submit} noValidate className="flex flex-col gap-5 px-8 py-8">
          <h1 className="font-display text-h1 text-foreground">{t("door.heading")}</h1>
          {joined ? (
            <Banner tone="success">
              {joined.text ? t("door.joinedText", { name: joined.name, n: joined.position ?? 1 }) : t("door.joinedNoText", { name: joined.name, n: joined.position ?? 1 })}
            </Banner>
          ) : null}
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          {!open && !failed && !loading ? <Banner tone="info">{t("door.closedAsk")}</Banner> : null}
          <TextField label={t("q.firstName")} className="min-h-13 text-lg clear:md:min-h-13" value={name} onChange={(e) => setName(e.target.value)} error={tried && !name.trim() ? t("q.nameRequired") : undefined} autoComplete="off" />
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
          <Checkbox checked={textOk} disabled={!phone} onChange={setConsent} label={t("q.consent")} />
          <Button type="submit" size="kiosk" className="rounded-full" loading={act.busy} disabled={!open}>{t("q.join")}</Button>
          {!phone ? <p className="text-center text-meta text-muted-foreground">{t("door.noPhoneNote")}</p> : null}
        </form>
      </div>
      <PinDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onVerified={async () => {
          // The PIN was right: let this tablet off the door (it is held there by a cookie), then go to the line.
          await fetch("/api/door/release", { method: "POST" }).catch(() => undefined);
          router.push(`${base}/queue`);
        }}
      />
    </div>
  );
}

/** A tablet signed in as someone with no PIN: set one now, so the tablet can be locked. Four digits, typed twice; it is also that person's counter PIN. */
function SetPin({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { api, me, base, detail } = useMerchant();
  const { t } = useLocale();
  const errorText = useErrorText();
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shop = detail.merchant;
  async function save() {
    if (busy) return;
    setError(null);
    if (!/^\d{4}$/.test(pin)) return;
    if (again !== pin) return setError(t("counter.door.pinMismatch"));
    setBusy(true);
    try {
      await api.setPin(me.user.id, pin);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div data-trade={shop.vertical} className="mx-auto flex max-w-md flex-col gap-5 py-10">
      <div className="flex min-w-0 items-center gap-3">
        <ShopMark name={shop.name} brandColor={shop.brandColor} logoUrl={shop.logoUrl} size={40} className="rounded-xl" />
        <p className="min-w-0 truncate font-display text-title font-semibold text-foreground"><bdi>{shop.name}</bdi></p>
      </div>
      <h1 className="font-display text-h1 text-foreground">{t("counter.door.setPin")}</h1>
      <p className="text-body text-fg-muted">{t("counter.door.setPinBody")}</p>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate className="flex flex-col gap-4">
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <TextField label={t("counter.pin.label")} type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null); }} autoFocus />
        <TextField label={t("counter.door.pinConfirm")} type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} hint={t("counter.door.pinAlsoCounter")} value={again} onChange={(e) => { setAgain(e.target.value.replace(/\D/g, "")); setError(null); }} />
        <Button type="submit" size="lg" loading={busy} disabled={!/^\d{4}$/.test(pin) || again.length !== 4}>
          {t("counter.door.savePin")}
        </Button>
      </form>
      {/* No PIN is set yet, so this screen is for staff, not for walk-ins: the way back to the line also lets the tablet off the door. */}
      <Link
        href={`${base}/queue`}
        onClick={(e) => {
          e.preventDefault();
          void fetch("/api/door/release", { method: "POST" }).catch(() => undefined).finally(() => router.push(`${base}/queue`));
        }}
        className="inline-flex min-h-11 items-center gap-2 text-meta-strong text-fg-muted hover:text-fg focus-visible:focus-ring"
      >
        <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
        {t("counter.door.backToLine")}
      </Link>
    </div>
  );
}

function PinDialog({ open, onClose, onVerified }: { open: boolean; onClose: () => void; onVerified: () => void | Promise<void> }) {
  const { api } = useMerchant();
  const { t, time } = useLocale();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** After too many wrong PINs the API says how long to wait; the field and the button stay off until then, so nobody keeps guessing into the lockout. */
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const errorText = useErrorText();
  useEffect(() => {
    if (lockedUntil === null) return;
    const id = window.setTimeout(() => { setLockedUntil(null); setError(null); }, Math.max(0, lockedUntil - Date.now()));
    return () => window.clearTimeout(id);
  }, [lockedUntil]);
  const locked = lockedUntil !== null;
  const reset = () => {
    setPin("");
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  async function go() {
    if (busy || locked) return;
    setBusy(true);
    setError(null);
    try {
      await api.verifyStaffPin({ pin });
      setPin("");
      await onVerified();
    } catch (e) {
      // A wrong PIN or the lockout says exactly that, in the tablet's language; anything else (offline, server) gets its own line.
      if (errorKind(e) === "rateLimited") {
        const wait = isApiError(e) && e.retryAfter && e.retryAfter > 0 ? e.retryAfter : 15 * 60;
        const until = Date.now() + wait * 1000;
        setLockedUntil(until);
        setError(t("counter.door.pinLocked", { time: time(until) }));
      } else setError(errorText(e, { validation: t("counter.err.pin") }));
      setPin("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title={t("counter.door.staffOnly")}
      description={t("counter.door.leaveBody")}
      actions={
        <>
          <Button variant="secondary" onClick={close}>{t("counter.door.back")}</Button>
          <Button loading={busy} disabled={locked || !/^\d{4}$/.test(pin)} onClick={() => void go()}>{t("counter.door.leave")}</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (/^\d{4}$/.test(pin)) void go(); }}>
        {error ? <Banner tone="danger" className="mb-3">{error}</Banner> : null}
        <TextField label={t("counter.door.staffPin")} type="password" inputMode="numeric" autoComplete="off" maxLength={4} disabled={locked} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus />
      </form>
    </Modal>
  );
}
