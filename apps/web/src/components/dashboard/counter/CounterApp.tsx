"use client";
import { Clock3, Gift, RotateCcw, Search, Ticket, UserPlus, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { staffApi } from "@ll/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Keypad } from "@/components/ui/Keypad";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Segmented } from "@/components/dashboard/kit";
import { inputBase } from "@/components/ui/TextField";
import { copy } from "@/copy/en-CA";
import { newIdempotencyKey } from "@/lib/api/client";
import type { MerchantEndpoints } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { applyKey, awardLabel, awardSuccess, centsFromKeypad, COUNTER_QUEUE_KEY, counterErrorMessage, keypadDisplay, lookupKind, readQueue, undoLabel, type KeypadKey, type ProgramForCounter, type QueuedAward } from "@/lib/dashboard/counter";
import { CountUp } from "@/components/ui/CountUp";
import { formatMoney, formatPoints, formatSigned, formatTime, firstName, rewardInSentence } from "@/lib/format";
import { formatNanp, maskPhone } from "@/lib/phone";
import { typeLabel } from "@/lib/dashboard/labels";

type CounterApi = MerchantEndpoints["counter"];

type Phase =
  | { kind: "idle" }
  | { kind: "pick"; items: staffApi.MemberSummaryDto[] }
  | { kind: "new"; phone: string }
  | { kind: "member"; member: staffApi.MemberSummaryDto }
  | { kind: "awarded"; res: staffApi.AwardResponse; at: number; from: number }
  /** Saved on this device (offline / network error); sends with the same idempotency key. */
  | { kind: "queued"; label: string; who: string }
  | { kind: "redeemed"; res: staffApi.CounterRedemptionResponse };

export interface CounterAppProps {
  api: CounterApi;
  program: ProgramForCounter;
  shopName: string;
  locations: { id: string; name: string }[];
  /** Undo window shown on the success screen (seconds). */
  undoSeconds?: number;
  /** localStorage key for awards saved while offline (one per shop). */
  queueKey?: string;
}

/**
 * Web counter mode (staff-counter.md / staff.md) for a laptop or tablet at the till.
 * Keyboard-first: "/" search, Enter = primary action, digits feed the amount keypad,
 * Esc = next customer. Every award/redeem tap gets one idempotency key, reused on retry.
 */
export function CounterApp({ api, program, shopName, locations, undoSeconds = 30, queueKey = COUNTER_QUEUE_KEY }: CounterAppProps) {
  const [mode, setMode] = useState<"award" | "verify">("award");
  const [locationId, setLocationId] = useState<string | undefined>(locations[0]?.id);
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [cents, setCents] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [recent, setRecent] = useState<staffApi.ActivityItemDto[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [announce, setAnnounce] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const awardKey = useRef<string | null>(null);
  const redeemKey = useRef<string | null>(null);
  const perDollar = program.earnType === "per_dollar";
  const [queue, setQueue] = useState<QueuedAward[]>([]);
  const [online, setOnline] = useState(true);
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const queueRef = useRef<QueuedAward[]>([]);

  // ---- Never lose an award (polish-audit D10): network failures go to a queue on this device, shown in a
  // strip, retried with the SAME idempotency key when the browser is back online, every 20 s, or on "Retry now".
  const saveQueue = useCallback(
    (next: QueuedAward[]) => {
      queueRef.current = next;
      setQueue(next);
      try {
        localStorage.setItem(queueKey, JSON.stringify(next));
      } catch {
        /* private mode: the queue lives for this tab */
      }
    },
    [queueKey],
  );
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      saveQueue(readQueue(localStorage.getItem(queueKey)));
    } catch {
      /* ignore */
    }
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
  }, [queueKey, saveQueue]);

  const flush = useCallback(async () => {
    if (!queueRef.current.length) return;
    setSending(true);
    let sent = 0;
    for (const item of [...queueRef.current]) {
      try {
        await api.award(item.body as Parameters<CounterApi["award"]>[0], item.key);
        sent += 1;
        saveQueue(queueRef.current.filter((x) => x.key !== item.key));
      } catch (e) {
        if (isApiError(e) && e.isNetwork) break;
        // A final error (duplicate, cooldown...) is dropped from the queue but said out loud.
        saveQueue(queueRef.current.filter((x) => x.key !== item.key));
        setError(`${item.label}: ${counterErrorMessage(isApiError(e) ? e : {}, { terminology: program.terminology })}`);
      }
    }
    setSending(false);
    if (sent) {
      setSentNote(`Back online · ${sent} sent`);
      setTimeout(() => setSentNote(null), 4000);
    }
  }, [api, saveQueue, program.terminology]);
  useEffect(() => {
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const t = setInterval(() => {
      if (queueRef.current.length && navigator.onLine) void flush();
    }, 20_000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(t);
    };
  }, [flush]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ll.counter.location");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && locations.some((l) => l.id === saved)) setLocationId(saved);
    } catch {
      /* ignore */
    }
  }, [locations]);

  const loadRecent = useCallback(async () => {
    try {
      const r = await api.activity({ locationId, limit: 8 });
      setRecent(r.items);
    } catch {
      /* the activity strip is a convenience */
    }
  }, [api, locationId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (phase.kind !== "awarded") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase.kind]);

  const reset = useCallback(() => {
    setPhase({ kind: "idle" });
    setQ("");
    setCents("");
    setQty(1);
    setError(null);
    setNewName("");
    setConsent(false);
    awardKey.current = null;
    redeemKey.current = null;
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const lookup = useCallback(async () => {
    const term = q.trim();
    if (lookupKind(term) === "incomplete") {
      setError("Type a 10-digit phone number, the last 4 digits, or the member code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.lookup(term);
      awardKey.current = null;
      if (r.items.length === 1) setPhase({ kind: "member", member: r.items[0]! });
      else if (r.items.length > 1) setPhase({ kind: "pick", items: r.items });
      else if (r.normalizedPhone) setPhase({ kind: "new", phone: r.normalizedPhone });
      else setError(r.matchedBy === "last4" ? "No member with those last 4 digits. Try the full number." : "No member found. Check the code or number.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [api, q]);

  const award = useCallback(
    async (ref: { memberId?: string; phone?: string }, extra: { customerName?: string; consent?: { text: string } } = {}) => {
      if (perDollar && centsFromKeypad(cents) <= 0) {
        setError("Enter the purchase amount first.");
        return;
      }
      awardKey.current ??= newIdempotencyKey("counter");
      setBusy(true);
      setError(null);
      const body = { ...ref, ...extra, amountCents: perDollar ? centsFromKeypad(cents) : undefined, quantity: perDollar || qty === 1 ? undefined : qty, locationId };
      const before = phase.kind === "member" ? phase.member.balance : 0;
      const label = awardLabel(program, centsFromKeypad(cents), qty);
      try {
        const res = await api.award(body, awardKey.current);
        awardKey.current = null;
        setPhase({ kind: "awarded", res, at: Date.now(), from: res.duplicate ? res.balance : before });
        setNow(Date.now());
        setAnnounce(`${awardSuccess(program, res.pointsEarned)}. Balance ${formatPoints(res.balance, program.terminology)}.`);
        void loadRecent();
      } catch (e) {
        if (isApiError(e) && e.isNetwork) {
          // Saved, not lost: same key, sent later. The staff member moves on now.
          const who = phase.kind === "member" ? (phase.member.name ?? "Member") : ref.phone ? formatNanp(ref.phone.replace(/^\+1/, "")) : "Customer";
          saveQueue([...queueRef.current, { key: awardKey.current!, body, label: `${label} for ${who}`, at: Date.now() }]);
          awardKey.current = null;
          setPhase({ kind: "queued", label, who });
          setAnnounce(`${label}. Saved on this device. It sends when you're back online.`);
        } else {
          awardKey.current = null;
          setError(counterErrorMessage(isApiError(e) ? e : {}, { terminology: program.terminology, firstName: phase.kind === "member" ? firstName(phase.member.name) : null }));
        }
      } finally {
        setBusy(false);
      }
    },
    [api, cents, qty, locationId, perDollar, program, loadRecent, phase, saveQueue],
  );

  const redeem = useCallback(
    async (member: staffApi.MemberSummaryDto, rewardId: string) => {
      redeemKey.current ??= newIdempotencyKey("redeem");
      setBusy(true);
      setError(null);
      try {
        const res = await api.redeem({ memberId: member.memberId, rewardId, locationId, subtotalCents: perDollar && cents ? centsFromKeypad(cents) : undefined }, redeemKey.current);
        redeemKey.current = null;
        setPhase({ kind: "redeemed", res });
        setAnnounce(`${res.redemption.reward.name} redeemed. Hand it over.`);
        void loadRecent();
      } catch (e) {
        if (!(isApiError(e) && e.isNetwork)) redeemKey.current = null;
        setError(isApiError(e) && e.isNetwork ? "No connection. Redeem needs the internet; awards still save here." : counterErrorMessage(isApiError(e) ? e : {}, { terminology: member.terminology }));
      } finally {
        setBusy(false);
      }
    },
    [api, locationId, perDollar, cents, loadRecent],
  );

  const undo = useCallback(
    async (transactionId: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await api.undo(transactionId);
        setAnnounce(`Undone. ${firstName(r.member.name) || "The customer"} is back to ${formatPoints(r.member.balance, program.terminology)}.`);
        setPhase({ kind: "member", member: r.member });
        void loadRecent();
      } catch (e) {
        setError(isApiError(e) && e.status === 403 ? "Too late to undo here. Adjust it from the customer's page." : errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [api, program.terminology, loadRecent],
  );

  const verify = useCallback(async () => {
    if (code.trim().length < 4) return setError("Enter the code on the customer's screen.");
    setBusy(true);
    setError(null);
    try {
      const res = await api.verify(code.trim().toUpperCase());
      setPhase({ kind: "redeemed", res });
      setCode("");
      setAnnounce(`${res.redemption.reward.name} redeemed. Hand it over.`);
      void loadRecent();
    } catch (e) {
      setError(isApiError(e) && e.isNetwork ? "No connection. Checking a code needs the internet." : counterErrorMessage(isApiError(e) ? e : {}));
    } finally {
      setBusy(false);
    }
  }, [api, code, loadRecent]);

  // Hardware keyboard: digits/backspace feed the keypad while a member is selected (per-dollar programs).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if (e.key === "Escape") {
        e.preventDefault();
        reset();
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || phase.kind !== "member") return;
      if (perDollar && /^\d$/.test(e.key)) {
        e.preventDefault();
        setCents((c) => applyKey(c, e.key as KeypadKey));
      } else if (perDollar && e.key === "Backspace") {
        e.preventDefault();
        setCents((c) => applyKey(c, "back"));
      } else if (e.key === "Enter" && !busy) {
        e.preventDefault();
        void award({ memberId: phase.member.memberId });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, perDollar, busy, award, reset]);

  const member = phase.kind === "member" ? phase.member : null;
  const hint = (() => {
    const k = lookupKind(q);
    if (!q) return "Phone number, last 4 digits, or member code";
    if (k === "phone") return `Phone ${formatNanp(q.replace(/\D/g, "").slice(-10))}`;
    if (k === "last4") return "Last 4 digits of their phone";
    if (k === "code") return "Member code";
    return "Keep typing...";
  })();

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Counter mode"
          value={mode}
          onChange={(v) => {
            setMode(v);
            reset();
          }}
          options={[
            { value: "award", label: "Award" },
            { value: "verify", label: "Verify code" },
          ]}
        />
        {locations.length > 1 ? (
          <label className="flex items-center gap-2 text-meta text-fg-muted">
            Location
            <select
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                try {
                  localStorage.setItem("ll.counter.location", e.target.value);
                } catch {
                  /* ignore */
                }
              }}
              className="h-8 rounded-input border border-line bg-bg px-2 text-meta text-fg"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {queue.length || !online || sentNote ? (
        <div role="status" className={cn("flex min-h-11 items-center gap-3 rounded-card px-4 py-2 text-meta", queue.length || !online ? "bg-fg text-bg" : "bg-bg-subtle text-fg")}>
          {queue.length || !online ? <WifiOff aria-hidden className="size-4 shrink-0" strokeWidth={2} /> : null}
          <span className="flex-1 font-medium tabular-nums">
            {sentNote && !queue.length ? sentNote : !online && !queue.length ? "Offline · awards save on this device" : `${online ? "Sending" : "Offline"} · ${queue.length} waiting to send`}
          </span>
          {queue.length ? (
            <button type="button" onClick={() => void flush()} disabled={sending} className="min-h-8 rounded-full px-3 font-semibold underline-offset-2 hover:underline focus-visible:focus-ring disabled:opacity-60">
              {sending ? "Sending..." : "Retry now"}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <Banner tone="danger" action={<button type="button" aria-label="Dismiss" onClick={() => setError(null)} className="inline-flex size-9 items-center justify-center rounded-full"><X aria-hidden className="size-4" /></button>}>
          {error}
        </Banner>
      ) : null}

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {mode === "verify" ? (
            <section className="rounded-card border border-line bg-bg p-6" aria-labelledby="verify-title">
              <h2 id="verify-title" className="text-body-strong text-fg">
                Verify a reward code
              </h2>
              <p className="mt-1 text-meta text-fg-muted">For rewards the customer redeemed in the app. The code is on their screen.</p>
              <form
                className="mt-4 flex flex-col gap-3 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void verify();
                }}
              >
                <label className="sr-only" htmlFor="redeem-code">
                  Reward code
                </label>
                <input id="redeem-code" autoFocus autoComplete="off" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="K74Q" className={cn(inputBase, "min-h-16 text-center font-mono text-code tracking-[0.3em] sm:max-w-60")} />
                <Button type="submit" size="lg" loading={busy} className="min-h-16">
                  {copy.action.redeem}
                </Button>
              </form>
            </section>
          ) : null}

          {mode === "award" && (phase.kind === "idle" || phase.kind === "pick" || phase.kind === "new") ? (
            <section className="rounded-card border border-line bg-bg p-6" aria-labelledby="find-title">
              <h2 id="find-title" className="text-body-strong text-fg">
                Find customer
              </h2>
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void lookup();
                }}
              >
                <div className="relative flex-1">
                  <Search aria-hidden className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-fg-muted" strokeWidth={1.75} />
                  <label htmlFor="counter-search" className="sr-only">
                    Phone, last 4 digits or member code
                  </label>
                  <input
                    id="counter-search"
                    ref={searchRef}
                    autoFocus
                    autoComplete="off"
                    inputMode="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-describedby="counter-hint"
                    placeholder="(416) 555-0123 or 0123 or K7QX2M9P"
                    className={cn(inputBase, "min-h-16 ps-12 text-title tabular")}
                  />
                </div>
                <Button type="submit" size="lg" loading={busy} className="min-h-16">
                  Find customer
                </Button>
              </form>
              <p id="counter-hint" className="mt-2 text-meta text-fg-muted">
                {hint} · Press <kbd className="rounded-[5px] border border-line px-1.5 text-caption">/</kbd> to search, <kbd className="rounded-[5px] border border-line px-1.5 text-caption">Esc</kbd> for the next customer
              </p>

              {phase.kind === "pick" ? (
                <ul className="mt-4 divide-y divide-line rounded-input border border-line" aria-label="Matching members">
                  {phase.items.map((m) => (
                    <li key={m.memberId}>
                      <button type="button" onClick={() => setPhase({ kind: "member", member: m })} className="flex min-h-16 w-full items-center gap-3 px-3 text-start hover:bg-bg-subtle focus-visible:focus-ring">
                        <Avatar name={m.name} id={m.memberId} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-strong text-fg">{m.name ?? "Member"}</span>
                          <span className="block text-meta tabular-nums text-fg-muted">{maskPhone(m.maskedPhone)}</span>
                        </span>
                        <span className="tabular-nums text-fg">{formatPoints(m.balance, m.terminology)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {phase.kind === "new" ? (
                <form
                  className="mt-4 flex flex-col gap-3 rounded-input border border-line p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void award({ phone: phase.phone }, { customerName: newName.trim() || undefined, consent: consent ? { text: copy.consent.merchant(shopName) } : undefined });
                  }}
                >
                  <p className="flex items-center gap-2 text-body-strong text-fg">
                    <UserPlus aria-hidden className="size-4 text-fg-muted" strokeWidth={1.75} /> New customer: {formatNanp(phase.phone.replace(/^\+1/, ""))}
                  </p>
                  <label className="flex flex-col gap-1.5 text-meta-strong text-fg">
                    First name (optional)
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} autoComplete="off" className={inputBase} />
                  </label>
                  <Checkbox checked={consent} onChange={setConsent} label={copy.consent.merchant(shopName)} caption="Read this to the customer. Only tick it if they say yes." />
                  {perDollar ? <AmountPad cents={cents} setCents={setCents} /> : null}
                  <Button type="submit" size="counter" loading={busy}>
                    Add and award
                  </Button>
                </form>
              ) : null}
            </section>
          ) : null}

          {mode === "award" && member ? (
            <section className="rounded-card border border-line bg-bg p-6" aria-labelledby="member-title">
              <div className="flex items-start gap-3">
                <Avatar name={member.name} id={member.memberId} size={40} />
                <div className="min-w-0 flex-1">
                  <h2 id="member-title" className="truncate text-title text-fg">
                    {member.name ?? "Member"}
                  </h2>
                  <p className="text-meta text-fg-muted">
                    {maskPhone(member.maskedPhone)} · {member.visitCount} {member.visitCount === 1 ? "visit" : "visits"}{member.vip ? ` · ${member.vip.name}` : ""}
                  </p>
                </div>
                <div className="text-end">
                  <p className="font-display text-display-number tabular-nums text-accent-text">{member.balance}</p>
                  <p className="text-meta text-fg-muted">{member.terminology}</p>
                </div>
              </div>
              {member.nextReward ? <ProgressBar className="mt-5" value={member.nextReward.progressPct} max={100} label={member.nextReward.name} valueText={`${member.nextReward.pointsNeeded} more`} /> : null}
              {member.openRedemptionCount > 0 ? (
                <Banner tone="info" className="mt-3" icon={Ticket} action={<Button size="sm" variant="ghost" onClick={() => setMode("verify")}>Verify code</Button>}>
                  This customer has a reward code waiting in the app.
                </Banner>
              ) : null}
              <p className="mt-2 text-caption text-fg-muted">{member.expiryDisclosure}</p>

              <div className="mt-4 flex flex-col gap-3">
                {perDollar ? (
                  <AmountPad cents={cents} setCents={setCents} />
                ) : (
                  <div role="radiogroup" aria-label="How many" className="flex gap-2">
                    {[1, 2, 3].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={qty === n} onClick={() => setQty(n)} className={cn("min-h-14 flex-1 rounded-input border text-title tabular-nums text-fg focus-visible:focus-ring", qty === n ? "border-fg bg-bg font-semibold shadow-[inset_0_0_0_1px_var(--ll-color-fg)]" : "border-line bg-bg hover:bg-bg-subtle")}>
                        +{n}
                      </button>
                    ))}
                  </div>
                )}
                <Button size="counter" loading={busy} onClick={() => void award({ memberId: member.memberId })}>
                  {awardLabel(program, centsFromKeypad(cents), qty)}
                </Button>
              </div>

              {member.rewardsAffordable.length ? (
                <div className="mt-5">
                  <h3 className="text-meta-strong text-fg">Ready to redeem</h3>
                  <ul className="mt-2 divide-y divide-line border-y border-line">
                    {member.rewardsAffordable.map((r) => (
                      <li key={r.id} className="flex min-h-14 items-center gap-3 py-2">
                        <Gift aria-hidden className="size-4 text-fg-muted" strokeWidth={1.75} />
                        <span className="min-w-0 flex-1 text-body-strong text-fg">{r.name}</span>
                        <span className="text-meta tabular-nums text-fg-muted">{formatPoints(r.pointsCost, member.terminology)}</span>
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void redeem(member, r.id)}>
                          {copy.action.redeem}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {member.discountCards.length ? (
                <p className="mt-3 text-meta text-fg-muted">Discount cards: {member.discountCards.map((d) => d.name).join(", ")}</p>
              ) : null}
              <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
                <Button variant="secondary" onClick={reset}>
                  Next customer
                </Button>
                <span className="text-meta text-fg-muted">
                  or press <kbd className="rounded-[5px] border border-line px-1.5 text-caption">Esc</kbd>
                </span>
              </div>
            </section>
          ) : null}

          {phase.kind === "awarded" ? (
            <section role="status" className="rounded-card border border-line bg-bg p-6" aria-labelledby="ok-title">
              <SuccessMark />
              <p id="ok-title" className="text-large-title font-display text-fg">
                {phase.res.duplicate ? "Already added" : awardSuccess(program, phase.res.pointsEarned)}
              </p>
              <p className="mt-2 text-title font-normal text-fg">
                {phase.res.member.name ? `${firstName(phase.res.member.name)} has ` : "Balance "}
                <CountUp value={phase.res.balance} from={phase.from} className="tabular-nums text-accent-text" />
                {` ${formatPoints(phase.res.balance, program.terminology).replace(/^[\d,]+ /, "")}`}
                {phase.res.memberCreated ? " · new member" : ""}
              </p>
              {phase.res.rewardsAvailable.length ? <p className="mt-2 text-body text-fg">Reward ready: {phase.res.rewardsAvailable.map((r) => rewardInSentence(r.name)).join(", ")}</p> : phase.res.member.nextReward ? <p className="mt-2 text-body text-fg-muted">{copy.misc.stampsToGo(phase.res.member.nextReward.pointsNeeded, rewardInSentence(phase.res.member.nextReward.name))}</p> : null}
              {phase.res.breakdown.length ? <p className="mt-1 text-meta text-fg-muted">{phase.res.breakdown.join(" · ")}</p> : null}
              {phase.res.messages.map((msg) => (
                <p key={msg} className="mt-1 text-meta text-fg-muted">
                  {msg}
                </p>
              ))}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={reset} autoFocus>
                  Next customer
                </Button>
                {phase.res.transactionId && !phase.res.duplicate && now - phase.at < undoSeconds * 1000 ? (
                  <Button variant="secondary" size="lg" iconStart={RotateCcw} disabled={busy} onClick={() => void undo(phase.res.transactionId!)}>
                    {undoLabel(Math.ceil((undoSeconds * 1000 - (now - phase.at)) / 1000))}
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          {phase.kind === "queued" ? (
            <section role="status" className="rounded-card border border-line bg-bg p-6" aria-labelledby="queued-title">
              <Clock3 aria-hidden className="mb-4 size-10 text-fg-muted" strokeWidth={1.5} />
              <p id="queued-title" className="text-large-title font-display text-fg">
                {phase.label} for {phase.who}
              </p>
              <p className="mt-2 text-body text-fg-muted">Saved on this device. It sends when you&apos;re back online, with nothing counted twice.</p>
              <div className="mt-5">
                <Button size="lg" onClick={reset} autoFocus>
                  Next customer
                </Button>
              </div>
            </section>
          ) : null}

          {phase.kind === "redeemed" ? (
            <section role="status" className="rounded-card border border-line bg-bg p-6">
              <SuccessMark />
              <p className="text-large-title font-display text-fg">{phase.res.redemption.reward.name} redeemed.</p>
              <p className="mt-2 text-title font-normal text-fg">Hand it over.{phase.res.redemption.discountCents ? ` Discount ${formatMoney(phase.res.redemption.discountCents)}.` : ""}</p>
              <p className="mt-1 text-body text-fg-muted">
                {phase.res.member.name ? `${firstName(phase.res.member.name)} has ` : "Balance "}
                {formatPoints(phase.res.member.balance, phase.res.member.terminology)} left.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button size="lg" onClick={reset} autoFocus>
                  Next customer
                </Button>
                {phase.res.redemption.transactionId ? (
                  <Button variant="secondary" size="lg" iconStart={RotateCcw} disabled={busy} onClick={() => void undo(phase.res.redemption.transactionId!)}>
                    Undo redeem
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <aside aria-labelledby="recent-title" className="min-w-0">
          <h2 id="recent-title" className="text-body-strong text-fg">
            Recent at the counter
          </h2>
          {recent.length ? (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {recent.map((a) => (
                // Fixed trailing columns so every number lines up whether or not the row can be undone (D7).
                <li key={a.transactionId} className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_52px] items-center gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-meta text-fg">
                      {a.name ?? (a.maskedPhone ? maskPhone(a.maskedPhone) : "Member")}
                      {a.reversed ? <span className="text-fg-muted"> · undone</span> : null}
                    </p>
                    <p className="truncate text-caption text-fg-muted">
                      {formatTime(a.createdAt)} · {typeLabel(a.type)}
                      {a.staffName ? ` · ${a.staffName}` : ""}
                    </p>
                  </div>
                  <span className={cn("text-end tabular-nums text-meta", a.reversed ? "text-fg-subtle line-through" : a.points >= 0 ? "text-fg" : "text-fg-muted")}>{formatSigned(a.points)}</span>
                  <span className="text-end">
                    {a.canUndo && !a.reversed ? (
                      <button type="button" onClick={() => void undo(a.transactionId)} disabled={busy} className="min-h-8 rounded-sm px-1 text-meta text-fg-muted hover:text-fg hover:underline focus-visible:focus-ring">
                        Undo
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-meta text-fg-muted">Awards and redemptions show up here.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The award check: ring then tick, ~320 ms, a single settle; drawn instantly with reduced motion. */
function SuccessMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="ll-success-mark mb-4 size-12 text-positive">
      <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M15.5 24.5 L21.5 30.5 L33 18.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AmountPad({ cents, setCents }: { cents: string; setCents: (fn: (c: string) => string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-meta-strong text-fg">Purchase amount</p>
      <output aria-live="polite" aria-label="Purchase amount" className="block border-b border-line px-1 py-3 text-end font-display text-display-number tabular-nums text-fg">
        {keypadDisplay(cents)}
      </output>
      <Keypad size="compact" onKey={(k) => setCents((c) => applyKey(c, k))} label="Amount keypad" />
    </div>
  );
}
