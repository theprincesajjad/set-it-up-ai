"use client";
import {
  Clock3,
  Gift,
  KeyRound,
  RotateCcw,
  Ticket,
  UserPlus,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { authApi, staffApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Keypad } from "@/components/ui/Keypad";
import { inputBase } from "@/components/ui/TextField";
import { copy } from "@/copy/en-CA";
import { newIdempotencyKey } from "@/lib/api/client";
import type { MerchantEndpoints } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import {
  applyKey,
  AUTO_RETURN_MS,
  awardLabel,
  cameInText,
  centsFromKeypad,
  COUNTER_QUEUE_KEY,
  counterErrorMessage,
  EMPTY_SCANNER,
  feedScanner,
  isRewardReady,
  keypadDisplay,
  lookupOutcome,
  matchesHeading,
  maskedForRow,
  ordinal,
  pushDigit,
  readQueue,
  scanPayload,
  stampsLeft,
  UNDO_WINDOW_MS,
  visitThisMonth,
  type KeypadKey,
  type ProgramForCounter,
  type QueuedAward,
} from "@/lib/dashboard/counter";
import { CountUp } from "@/components/ui/CountUp";
import { Spinner } from "@/components/ui/Spinner";
import {
  formatMoney,
  formatPoints,
  formatSigned,
  formatTime,
  firstName,
  rewardInSentence,
} from "@/lib/format";
import { formatNanp, maskPhone } from "@/lib/phone";
import { typeLabel } from "@/lib/dashboard/labels";
import { DigitBoxes, ScanKeypad } from "./ScanKeypad";
import { ScanPanel } from "./ScanPanel";
import { StampRow } from "./StampRow";

type CounterApi = MerchantEndpoints["counter"];

type Phase =
  /** Scan first: viewfinder, 4 digits, keypad. */
  | { kind: "idle" }
  /** Two or more members end in these digits. */
  | { kind: "pick"; items: staffApi.MemberSummaryDto[]; digits: string }
  | { kind: "nomatch"; digits: string }
  | { kind: "new"; phone: string }
  /** Stamp on scan is off (or the program takes an amount): confirm with one tap. */
  | { kind: "member"; member: staffApi.MemberSummaryDto }
  /** Goal reached: redeem, or stamp on purpose and keep the reward. */
  | { kind: "reward"; member: staffApi.MemberSummaryDto }
  | { kind: "awarded"; res: staffApi.AwardResponse; at: number; from: number }
  /** Saved on this device (offline / network error); sends with the same idempotency key. */
  | { kind: "queued"; label: string; who: string }
  | { kind: "redeemed"; res: staffApi.CounterRedemptionResponse };

/** The staff member who signed in with a 4-digit PIN on this counter (their token tags every award). */
export interface CounterStaff {
  userId: string;
  name: string | null;
  token: string;
}

export interface CounterAppProps {
  api: CounterApi;
  program: ProgramForCounter;
  shopName: string;
  locations: { id: string; name: string }[];
  /** Undo window shown on the stamped toast (seconds). Default 10. */
  undoSeconds?: number;
  /** localStorage key for awards saved while offline (one per shop). */
  queueKey?: string;
  /** Who is signed in on the dashboard (shown on the staff chip until someone enters a PIN). */
  signedInName?: string | null;
  /** 4-digit PIN sign-in: verify, and the same counter calls made as that person. Omit to hide the chip. */
  pin?: {
    verify: (
      body: authApi.StaffPinVerifyBody,
    ) => Promise<authApi.StaffPinVerifyResponse>;
    apiAs: (token: string) => CounterApi;
  };
  /** Where the toast and auto-return timers read the clock (tests). */
  clock?: () => number;
}

/**
 * Web counter (cafes-retail.md 7.2): scan first, four digits second. A scan, or the 4th digit with one match,
 * stamps straight away (when "Stamp on scan" is on) and the toast keeps Undo for 10 s while the screen returns to
 * scan after 3 s. Two matches show a list; a ready reward offers Redeem or Stamp instead. USB and Bluetooth
 * scanners are keyboard input ending in Enter. Every award/redeem tap gets one idempotency key, reused on retry.
 */
export function CounterApp({
  api: baseApi,
  program,
  shopName,
  locations,
  undoSeconds = UNDO_WINDOW_MS / 1000,
  queueKey = COUNTER_QUEUE_KEY,
  signedInName,
  pin,
  clock = Date.now,
}: CounterAppProps) {
  const [mode, setMode] = useState<"scan" | "verify">("scan");
  const [staff, setStaff] = useState<CounterStaff | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const api = staff && pin ? pin.apiAs(staff.token) : baseApi;
  const [locationId, setLocationId] = useState<string | undefined>(
    locations[0]?.id,
  );
  const [entry, setEntryState] = useState("");
  const entryRef = useRef("");
  const setEntry = useCallback((v: string) => {
    entryRef.current = v;
    setEntryState(v);
  }, []);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [cents, setCents] = useState("");
  const [qty, setQty] = useState(1);
  const [showRewards, setShowRewards] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [recent, setRecent] = useState<staffApi.ActivityItemDto[]>([]);
  const [stampsToday, setStampsToday] = useState<number | null>(null);
  const [now, setNow] = useState(() => clock());
  const [announce, setAnnounce] = useState("");
  /** The latest stamp, kept for the Undo toast after the screen has returned to scan. */
  const [toast, setToast] = useState<{
    res: staffApi.AwardResponse;
    at: number;
  } | null>(null);
  const awardKey = useRef<string | null>(null);
  const redeemKey = useRef<string | null>(null);
  const scanner = useRef(EMPTY_SCANNER);
  const perDollar = program.earnType === "per_dollar";
  const goal = program.stampGoal || 10;
  const [queue, setQueue] = useState<QueuedAward[]>([]);
  const [online, setOnline] = useState(true);
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const queueRef = useRef<QueuedAward[]>([]);
  const phaseRef = useRef<Phase>(phase);
  // Handlers read the latest phase synchronously (they also set it before React re-renders).
  // eslint-disable-next-line react-hooks/refs
  phaseRef.current = phase;
  const busyRef = useRef(false);
  // eslint-disable-next-line react-hooks/refs
  busyRef.current = busy;

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
        await api.award(
          item.body as Parameters<CounterApi["award"]>[0],
          item.key,
        );
        sent += 1;
        saveQueue(queueRef.current.filter((x) => x.key !== item.key));
      } catch (e) {
        if (isApiError(e) && e.isNetwork) break;
        // A final error (duplicate, cooldown...) is dropped from the queue but said out loud.
        saveQueue(queueRef.current.filter((x) => x.key !== item.key));
        setError(
          `${item.label}: ${counterErrorMessage(isApiError(e) ? e : {}, { terminology: program.terminology })}`,
        );
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
      const [r, t] = await Promise.all([
        api.activity({ locationId, limit: 8 }),
        api.today(locationId),
      ]);
      setRecent(r.items);
      setStampsToday(t.pointsIssued);
    } catch {
      /* the activity strip is a convenience */
    }
  }, [api, locationId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecent();
  }, [loadRecent]);

  // One-second tick while the Undo toast is up (it counts down from 10).
  useEffect(() => {
    if (!toast) return;
    const t = setInterval(() => {
      const n = clock();
      setNow(n);
      if (n - toast.at >= undoSeconds * 1000) setToast(null);
    }, 500);
    return () => clearInterval(t);
  }, [toast, undoSeconds, clock]);

  const reset = useCallback(() => {
    setPhase({ kind: "idle" });
    setEntry("");
    setCents("");
    setQty(1);
    setShowRewards(false);
    setError(null);
    setNewName("");
    setNewPhone("");
    setConsent(false);
    awardKey.current = null;
    redeemKey.current = null;
    scanner.current = EMPTY_SCANNER;
  }, [setEntry]);

  // The stamped screen goes back to scan after 3 s on its own (Next customer does it now).
  useEffect(() => {
    if (phase.kind !== "awarded") return;
    const t = setTimeout(() => reset(), AUTO_RETURN_MS);
    return () => clearTimeout(t);
  }, [phase, reset]);

  const award = useCallback(
    async (
      ref: { memberId?: string; phone?: string },
      extra: { customerName?: string; consent?: { text: string } } = {},
      from?: number,
    ) => {
      if (perDollar && centsFromKeypad(cents) <= 0) {
        setError("Enter the purchase amount first.");
        return;
      }
      awardKey.current ??= newIdempotencyKey("counter");
      setBusy(true);
      setError(null);
      const body = {
        ...ref,
        ...extra,
        amountCents: perDollar ? centsFromKeypad(cents) : undefined,
        quantity: perDollar || qty === 1 ? undefined : qty,
        locationId,
      };
      const p = phaseRef.current;
      const before =
        from ??
        (p.kind === "member" || p.kind === "reward" ? p.member.balance : 0);
      const label = awardLabel(program, centsFromKeypad(cents), qty);
      try {
        const res = await api.award(body, awardKey.current);
        awardKey.current = null;
        const at = clock();
        setPhase({
          kind: "awarded",
          res,
          at,
          from: res.duplicate ? res.balance : before,
        });
        setNow(at);
        if (res.transactionId && !res.duplicate) setToast({ res, at });
        setAnnounce(
          `${res.duplicate ? "Already added" : `Stamp added for ${firstName(res.member.name) || "the customer"}`}. ${formatPoints(res.balance, program.terminology)}. Undo is on screen for ${undoSeconds} seconds.`,
        );
        void loadRecent();
      } catch (e) {
        if (isApiError(e) && e.isNetwork) {
          // Saved, not lost: same key, sent later. The staff member moves on now.
          const who =
            p.kind === "member" || p.kind === "reward"
              ? (p.member.name ?? "Member")
              : ref.phone
                ? formatNanp(ref.phone.replace(/^\+1/, ""))
                : "Customer";
          saveQueue([
            ...queueRef.current,
            {
              key: awardKey.current!,
              body,
              label: `${label} for ${who}`,
              at: Date.now(),
            },
          ]);
          awardKey.current = null;
          setPhase({ kind: "queued", label, who });
          setAnnounce(
            `${label}. Saved on this device. It sends when you're back online.`,
          );
        } else {
          awardKey.current = null;
          setPhase({ kind: "idle" });
          setEntry("");
          setError(
            counterErrorMessage(isApiError(e) ? e : {}, {
              terminology: program.terminology,
              firstName:
                p.kind === "member" || p.kind === "reward"
                  ? firstName(p.member.name)
                  : null,
            }),
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [
      api,
      cents,
      qty,
      locationId,
      perDollar,
      program,
      loadRecent,
      saveQueue,
      clock,
      undoSeconds,
      setEntry,
    ],
  );

  /** Look up a scan payload, a member code or the last 4 digits, then do what the program says. */
  const lookup = useCallback(
    async (term: string, digits = "") => {
      setBusy(true);
      setError(null);
      try {
        const r = await api.lookup(term);
        awardKey.current = null;
        const outcome = lookupOutcome(r, program);
        if (outcome === "new")
          setPhase({ kind: "new", phone: r.normalizedPhone! });
        else if (outcome === "none") {
          if (digits) setPhase({ kind: "nomatch", digits });
          else {
            setEntry("");
            setError("No member found. Check the code or number.");
          }
        } else if (outcome === "pick")
          setPhase({ kind: "pick", items: r.items, digits });
        else if (outcome === "reward")
          setPhase({ kind: "reward", member: r.items[0]! });
        else if (outcome === "stamp") {
          const m = r.items[0]!;
          phaseRef.current = { kind: "member", member: m };
          await award({ memberId: m.memberId }, {}, m.balance);
          return;
        } else setPhase({ kind: "member", member: r.items[0]! });
      } catch (e) {
        setEntry("");
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [api, program, award, setEntry],
  );

  const onDigit = useCallback(
    (key: string) => {
      if (phaseRef.current.kind !== "idle" || busyRef.current) return;
      const cur = entryRef.current;
      const next = pushDigit(cur, key);
      setEntry(next);
      // The 4th digit looks up straight away: no Find press.
      if (next.length === 4 && next !== cur) void lookup(next, next);
    },
    [lookup, setEntry],
  );

  const onScan = useCallback(
    (payload: string) => {
      const p = scanPayload(payload);
      if (!p || busyRef.current) return;
      const cur = phaseRef.current.kind;
      if (cur !== "idle" && cur !== "awarded") return;
      setEntry("");
      void lookup(p);
    },
    [lookup, setEntry],
  );

  const redeem = useCallback(
    async (member: staffApi.MemberSummaryDto, rewardId: string) => {
      redeemKey.current ??= newIdempotencyKey("redeem");
      setBusy(true);
      setError(null);
      try {
        const res = await api.redeem(
          {
            memberId: member.memberId,
            rewardId,
            locationId,
            subtotalCents:
              perDollar && cents ? centsFromKeypad(cents) : undefined,
          },
          redeemKey.current,
        );
        redeemKey.current = null;
        setPhase({ kind: "redeemed", res });
        setAnnounce(`${res.redemption.reward.name} redeemed. Hand it over.`);
        void loadRecent();
      } catch (e) {
        if (!(isApiError(e) && e.isNetwork)) redeemKey.current = null;
        setError(
          isApiError(e) && e.isNetwork
            ? "No connection. Redeem needs the internet; awards still save here."
            : counterErrorMessage(isApiError(e) ? e : {}, {
                terminology: member.terminology,
              }),
        );
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
        setAnnounce(
          `Undone. ${firstName(r.member.name) || "The customer"} is back to ${formatPoints(r.member.balance, program.terminology)}.`,
        );
        setToast(null);
        reset();
        void loadRecent();
      } catch (e) {
        setError(
          isApiError(e) && e.status === 403
            ? "Too late to undo here. Adjust it from the customer's page."
            : errorMessage(e),
        );
      } finally {
        setBusy(false);
      }
    },
    [api, program.terminology, loadRecent, reset],
  );

  const verify = useCallback(async () => {
    if (code.trim().length < 4)
      return setError("Enter the code on the customer's screen.");
    setBusy(true);
    setError(null);
    try {
      const res = await api.verify(code.trim().toUpperCase());
      setPhase({ kind: "redeemed", res });
      setMode("scan");
      setCode("");
      setAnnounce(`${res.redemption.reward.name} redeemed. Hand it over.`);
      void loadRecent();
    } catch (e) {
      setError(
        isApiError(e) && e.isNetwork
          ? "No connection. Checking a code needs the internet."
          : counterErrorMessage(isApiError(e) ? e : {}),
      );
    } finally {
      setBusy(false);
    }
  }, [api, code, loadRecent]);

  // Hardware keyboard: a scanner types the payload fast and presses Enter; slow digits feed the 4-digit entry;
  // while a member is on screen (per-dollar) digits feed the amount; Esc is "next customer".
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");
      if (e.key === "Escape") {
        e.preventDefault();
        reset();
        setMode("scan");
        return;
      }
      if (typing) return;
      const ph = phaseRef.current;
      // Keys arriving in a fast burst are a scanner typing a payload: its digits are not keypad digits.
      let burst = false;
      if (mode === "scan" && (ph.kind === "idle" || ph.kind === "awarded")) {
        const fed = feedScanner(
          scanner.current,
          e.key,
          e.timeStamp || performance.now(),
        );
        scanner.current = fed.state;
        burst = fed.state.buffer.length >= 2;
        if (fed.scanned) {
          e.preventDefault();
          onScan(fed.scanned);
          return;
        }
      }
      if (mode === "scan" && ph.kind === "idle" && /^\d$/.test(e.key)) {
        if (!burst) onDigit(e.key);
      } else if (mode === "scan" && ph.kind === "idle" && e.key === "Backspace")
        onDigit("back");
      else if (ph.kind === "member") {
        if (perDollar && /^\d$/.test(e.key)) {
          e.preventDefault();
          setCents((c) => applyKey(c, e.key as KeypadKey));
        } else if (perDollar && e.key === "Backspace") {
          e.preventDefault();
          setCents((c) => applyKey(c, "back"));
        } else if (e.key === "Enter" && !busyRef.current) {
          e.preventDefault();
          void award({ memberId: ph.member.memberId });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, perDollar, award, reset, onDigit, onScan]);

  const secondsLeft = toast
    ? Math.max(0, Math.ceil((undoSeconds * 1000 - (now - toast.at)) / 1000))
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      {toast && secondsLeft > 0 ? (
        <div
          role="status"
          className="flex min-h-11 items-center justify-between gap-3 rounded-[14px] bg-fg px-4 py-2.5 text-[13px] text-bg"
        >
          <span className="font-medium">
            {toast.res.member.name
              ? `${firstName(toast.res.member.name)} · `
              : ""}
            Stamp added · {formatTime(new Date(toast.at))}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void undo(toast.res.transactionId!)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 font-semibold tabular-nums hover:underline focus-visible:focus-ring disabled:opacity-60"
          >
            <RotateCcw aria-hidden className="size-3.5" /> Undo {secondsLeft}s
          </button>
        </div>
      ) : null}

      {queue.length || !online || sentNote ? (
        <div
          role="status"
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-card px-4 py-2 text-meta",
            queue.length || !online ? "bg-fg text-bg" : "bg-bg-subtle text-fg",
          )}
        >
          {queue.length || !online ? (
            <WifiOff aria-hidden className="size-4 shrink-0" strokeWidth={2} />
          ) : null}
          <span className="flex-1 font-medium tabular-nums">
            {sentNote && !queue.length
              ? sentNote
              : !online && !queue.length
                ? "Offline · awards save on this device"
                : `${online ? "Sending" : "Offline"} · ${queue.length} waiting to send`}
          </span>
          {queue.length ? (
            <button
              type="button"
              onClick={() => void flush()}
              disabled={sending}
              className="min-h-8 rounded-full px-3 font-semibold underline-offset-2 hover:underline focus-visible:focus-ring disabled:opacity-60"
            >
              {sending ? "Sending..." : "Retry now"}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <Banner
          tone="danger"
          action={
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setError(null)}
              className="inline-flex size-9 items-center justify-center rounded-full"
            >
              <X aria-hidden className="size-4" />
            </button>
          }
        >
          {error}
        </Banner>
      ) : null}

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:justify-center">
        <div className="mx-auto flex w-full min-w-0 max-w-[420px] flex-col gap-4">
          <div className="flex items-center justify-between gap-3 text-[13px] text-fg-muted">
            <span className="truncate">
              <span className="font-semibold text-fg">{shopName}</span> ·
              counter
            </span>
            <div className="flex items-center gap-2">
              {locations.length > 1 ? (
                <label className="flex items-center gap-2">
                  <span className="sr-only">Location</span>
                  <select
                    value={locationId}
                    onChange={(e) => {
                      setLocationId(e.target.value);
                      try {
                        localStorage.setItem(
                          "ll.counter.location",
                          e.target.value,
                        );
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
              {pin ? (
                <button
                  type="button"
                  onClick={() => setPinOpen(true)}
                  aria-label={
                    staff
                      ? `Stamping as ${staff.name ?? "staff"}. Switch`
                      : "Sign in with a PIN"
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-bg-subtle px-3 text-[13px] font-medium text-fg hover:bg-bg-muted focus-visible:focus-ring"
                >
                  <span
                    aria-hidden
                    className="inline-flex size-5 items-center justify-center rounded-full bg-bg-muted text-[10px] font-semibold uppercase"
                  >
                    {(staff?.name ?? signedInName ?? "?").trim()[0]}
                  </span>
                  {firstName(staff?.name ?? signedInName ?? "") || "Staff"}
                </button>
              ) : null}
            </div>
          </div>

          {pinOpen && pin ? (
            <PinPad
              verify={pin.verify}
              onDone={(s) => {
                setStaff(s);
                setPinOpen(false);
              }}
              onCancel={() => setPinOpen(false)}
            />
          ) : null}

          {mode === "verify" ? (
            <section
              className="rounded-card border border-line bg-bg p-6"
              aria-labelledby="verify-title"
            >
              <h2 id="verify-title" className="text-body-strong text-fg">
                Redeem a code
              </h2>
              <p className="mt-1 text-meta text-fg-muted">
                For rewards the customer redeemed in the app. The code is on
                their screen.
              </p>
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
                <input
                  id="redeem-code"
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="K74Q"
                  className={cn(
                    inputBase,
                    "min-h-16 text-center font-mono text-code tracking-[0.3em] sm:max-w-60",
                  )}
                />
                <Button
                  type="submit"
                  size="lg"
                  loading={busy}
                  className="min-h-16"
                >
                  {copy.action.redeem}
                </Button>
              </form>
              <button
                type="button"
                onClick={() => {
                  setMode("scan");
                  setError(null);
                }}
                className="mt-4 text-meta font-medium text-fg-muted hover:text-fg"
              >
                Back to scan
              </button>
            </section>
          ) : null}

          {mode === "scan" && phase.kind === "idle" && !pinOpen ? (
            <>
              <ScanPanel
                onScan={onScan}
                hint={
                  program.counterAutoStamp && !perDollar
                    ? "Wallet pass, app, or printed QR. Stamps on scan."
                    : "Wallet pass, app, or printed QR."
                }
              />
              <p className="text-center text-[14px] text-fg-muted">
                or type the last 4 digits of their phone
              </p>
              <DigitBoxes value={entry} />
              <ScanKeypad onKey={onDigit} disabled={busy} />
              <div className="flex items-center justify-between text-[13px] text-fg-muted">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-full",
                      online ? "bg-positive" : "bg-negative",
                    )}
                  />
                  {online ? "Online" : "Offline"}
                  {stampsToday != null
                    ? ` · ${stampsToday} ${program.terminology} today`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setMode("verify");
                    setError(null);
                  }}
                  className="font-medium text-fg hover:underline focus-visible:focus-ring"
                >
                  Redeem a code
                </button>
              </div>
            </>
          ) : null}

          {mode === "scan" && phase.kind === "pick" ? (
            <section
              aria-labelledby="pick-title"
              className="flex flex-col gap-4"
            >
              <div>
                <h2
                  id="pick-title"
                  className="font-display text-[22px] font-bold leading-7 tracking-[-0.01em] text-fg"
                >
                  {matchesHeading(phase.items.length, phase.digits)}
                </h2>
                <p className="mt-1 text-[14px] text-fg-muted">
                  {program.counterAutoStamp && !perDollar
                    ? "Tap one. Stamp is added immediately."
                    : "Tap one to open their card."}
                </p>
              </div>
              <DigitBoxes value={phase.digits} />
              <ul
                className="flex flex-col gap-2.5"
                aria-label="Matching members"
              >
                {phase.items.map((m) => (
                  <li
                    key={m.memberId}
                    className="flex items-center gap-3 rounded-[16px] border border-line px-4 py-3.5"
                  >
                    <span
                      aria-hidden
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-bg-muted text-[14px] font-semibold uppercase text-fg"
                    >
                      {initialsOf(m.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] font-semibold text-fg">
                        {m.name ?? "Member"}
                      </span>
                      <span className="block text-[14px] tabular-nums text-fg-muted">
                        {maskedForRow(m.maskedPhone)}
                      </span>
                      <span className="block text-[13px] text-fg-muted">
                        {program.earnType === "stamps"
                          ? `${Math.min(m.balance, goal)} of ${goal}`
                          : formatPoints(m.balance, m.terminology)}{" "}
                        · {cameInText(m.lastVisitAt, new Date(now))}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      disabled={busy}
                      aria-label={`${program.counterAutoStamp && !perDollar ? "Stamp" : "Open"} ${m.name ?? "member"}`}
                      className="h-10 rounded-full px-5 text-[14px]"
                      onClick={() => {
                        if (isRewardReady(m, program))
                          setPhase({ kind: "reward", member: m });
                        else if (program.counterAutoStamp && !perDollar) {
                          phaseRef.current = { kind: "member", member: m };
                          void award({ memberId: m.memberId }, {}, m.balance);
                        } else setPhase({ kind: "member", member: m });
                      }}
                    >
                      {program.counterAutoStamp && !perDollar
                        ? "Stamp"
                        : "Open"}
                    </Button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setPhase({ kind: "new", phone: "" })}
                className="text-center text-[14px] font-medium text-fg hover:underline focus-visible:focus-ring"
              >
                Not here? Add as a new member with their number
              </button>
            </section>
          ) : null}

          {mode === "scan" && phase.kind === "nomatch" ? (
            <section
              aria-labelledby="nomatch-title"
              className="flex flex-col gap-4"
            >
              <h2
                id="nomatch-title"
                className="font-display text-[22px] font-bold leading-7 text-fg"
              >
                No one ends in {phase.digits}
              </h2>
              <p className="text-[14px] text-fg-muted">
                Check the digits, or add them as a new member with their number.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Button size="md" variant="secondary" onClick={reset}>
                  Try again
                </Button>
                <Button
                  size="md"
                  onClick={() => setPhase({ kind: "new", phone: "" })}
                >
                  Add as a new member
                </Button>
              </div>
            </section>
          ) : null}

          {mode === "scan" && phase.kind === "new" ? (
            <form
              className="flex flex-col gap-3 rounded-card border border-line p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const phone = phase.phone || newPhone.replace(/\D/g, "");
                if (!phase.phone && phone.replace(/^1/, "").length !== 10)
                  return setError("Type their 10-digit phone number.");
                void award(
                  {
                    phone:
                      phase.phone ||
                      (phone.length === 10 ? `+1${phone}` : `+${phone}`),
                  },
                  {
                    customerName: newName.trim() || undefined,
                    consent: consent
                      ? { text: copy.consent.merchant(shopName) }
                      : undefined,
                  },
                );
              }}
            >
              <p className="flex items-center gap-2 text-body-strong text-fg">
                <UserPlus
                  aria-hidden
                  className="size-4 text-fg-muted"
                  strokeWidth={1.75}
                />{" "}
                New member
                {phase.phone
                  ? `: ${formatNanp(phase.phone.replace(/^\+1/, ""))}`
                  : ""}
              </p>
              {!phase.phone ? (
                <label className="flex flex-col gap-1.5 text-meta-strong text-fg">
                  Mobile number
                  <input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="off"
                    autoFocus
                    placeholder="(416) 555-0123"
                    className={inputBase}
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1.5 text-meta-strong text-fg">
                First name (optional)
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoComplete="off"
                  className={inputBase}
                />
              </label>
              <Checkbox
                checked={consent}
                onChange={setConsent}
                label={copy.consent.merchant(shopName)}
                caption="Read this to the customer. Only tick it if they say yes."
              />
              {perDollar ? (
                <AmountPad cents={cents} setCents={setCents} />
              ) : null}
              <div className="flex gap-2.5">
                <Button type="button" variant="secondary" onClick={reset}>
                  Cancel
                </Button>
                <Button type="submit" size="counter" loading={busy}>
                  Add and award
                </Button>
              </div>
            </form>
          ) : null}

          {mode === "scan" && phase.kind === "reward" ? (
            <RewardReady
              member={phase.member}
              program={program}
              busy={busy}
              onRedeem={(id) => void redeem(phase.member, id)}
              onStamp={() => void award({ memberId: phase.member.memberId })}
              onBack={reset}
            />
          ) : null}

          {mode === "scan" && phase.kind === "member" ? (
            <MemberPanel
              member={phase.member}
              program={program}
              busy={busy}
              cents={cents}
              setCents={setCents}
              qty={qty}
              setQty={setQty}
              showRewards={showRewards}
              setShowRewards={setShowRewards}
              onAward={() => void award({ memberId: phase.member.memberId })}
              onRedeem={(id) => void redeem(phase.member, id)}
              onVerify={() => setMode("verify")}
              onClear={reset}
            />
          ) : null}

          {phase.kind === "awarded" ? (
            <Stamped
              res={phase.res}
              program={program}
              goal={goal}
              onNext={reset}
              from={phase.from}
            />
          ) : null}

          {phase.kind === "queued" ? (
            <section
              role="status"
              className="rounded-card border border-line bg-bg p-6"
              aria-labelledby="queued-title"
            >
              <Clock3
                aria-hidden
                className="mb-4 size-10 text-fg-muted"
                strokeWidth={1.5}
              />
              <p
                id="queued-title"
                className="text-large-title font-display text-fg"
              >
                {phase.label} for {phase.who}
              </p>
              <p className="mt-2 text-body text-fg-muted">
                Saved on this device. It sends when you&apos;re back online,
                with nothing counted twice.
              </p>
              <div className="mt-5">
                <Button size="lg" onClick={reset} autoFocus>
                  Next customer
                </Button>
              </div>
            </section>
          ) : null}

          {phase.kind === "redeemed" ? (
            <section
              role="status"
              className="rounded-card border border-line bg-bg p-6"
            >
              <SuccessMark />
              <p className="text-large-title font-display text-fg">
                {phase.res.redemption.reward.name} redeemed.
              </p>
              <p className="mt-2 text-title font-normal text-fg">
                Hand it over.
                {phase.res.redemption.discountCents
                  ? ` Discount ${formatMoney(phase.res.redemption.discountCents)}.`
                  : ""}
              </p>
              <p className="mt-1 text-body text-fg-muted">
                {phase.res.member.name
                  ? `${firstName(phase.res.member.name)} has `
                  : "Balance "}
                {formatPoints(
                  phase.res.member.balance,
                  phase.res.member.terminology,
                )}{" "}
                left.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button size="lg" onClick={reset} autoFocus>
                  Next customer
                </Button>
                {phase.res.redemption.transactionId ? (
                  <Button
                    variant="secondary"
                    size="lg"
                    iconStart={RotateCcw}
                    disabled={busy}
                    onClick={() =>
                      void undo(phase.res.redemption.transactionId!)
                    }
                  >
                    Undo redeem
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <aside
          aria-labelledby="recent-title"
          className="min-w-0 lg:max-w-[360px]"
        >
          <h2 id="recent-title" className="text-body-strong text-fg">
            Recent at the counter
          </h2>
          {recent.length ? (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {recent.map((a) => (
                // Fixed trailing columns so every number lines up whether or not the row can be undone (D7).
                <li
                  key={a.transactionId}
                  className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_52px] items-center gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-meta text-fg">
                      {a.name ??
                        (a.maskedPhone ? maskPhone(a.maskedPhone) : "Member")}
                      {a.reversed ? (
                        <span className="text-fg-muted"> · undone</span>
                      ) : null}
                    </p>
                    <p className="truncate text-caption text-fg-muted">
                      {formatTime(a.createdAt)} · {typeLabel(a.type)}
                      {a.staffName ? ` · ${a.staffName}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-end tabular-nums text-meta",
                      a.reversed
                        ? "text-fg-subtle line-through"
                        : a.points >= 0
                          ? "text-fg"
                          : "text-fg-muted",
                    )}
                  >
                    {formatSigned(a.points)}
                  </span>
                  <span className="text-end">
                    {a.canUndo && !a.reversed ? (
                      <button
                        type="button"
                        onClick={() => void undo(a.transactionId)}
                        disabled={busy}
                        className="min-h-8 rounded-sm px-1 text-meta text-fg-muted hover:text-fg hover:underline focus-visible:focus-ring"
                      >
                        Undo
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-meta text-fg-muted">
              Awards and redemptions show up here.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/** "Emma Wong" to "EW". */
function initialsOf(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return (
    (
      (parts[0]?.[0] ?? "") +
      (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")
    ).toUpperCase() || "?"
  );
}

/** Stamped: one big number, the stamp row, what is left, then back to scan on its own. */
function Stamped({
  res,
  program,
  goal,
  onNext,
  from,
}: {
  res: staffApi.AwardResponse;
  program: ProgramForCounter;
  goal: number;
  onNext: () => void;
  from: number;
}) {
  const stamps = program.earnType === "stamps";
  const n = res.balance;
  const ready = res.rewardsAvailable[0] ?? null;
  const left = Math.max(0, (res.member.nextReward?.pointsCost ?? goal) - n);
  return (
    <section
      role="status"
      aria-labelledby="ok-title"
      className="flex flex-col items-center gap-3 pt-2 text-center"
    >
      <span
        aria-hidden
        className="inline-flex size-16 items-center justify-center rounded-full bg-bg-muted text-[22px] font-semibold uppercase text-fg"
      >
        {initialsOf(res.member.name)}
      </span>
      <div>
        <h2
          id="ok-title"
          className="font-display text-[24px] font-bold leading-8 text-fg"
        >
          {res.duplicate ? "Already added" : (res.member.name ?? "Member")}
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          {res.memberCreated
            ? "New member · first stamp"
            : visitThisMonth(res.visitsThisMonth)}
        </p>
      </div>
      <p className="mt-2 font-display font-extrabold leading-none tracking-[-0.03em] tabular-nums text-accent text-[120px]">
        {stamps ? (
          <CountUp
            value={Math.min(n, goal)}
            from={Math.min(from, goal)}
            className="tabular-nums"
          />
        ) : (
          <CountUp value={n} from={from} className="tabular-nums" />
        )}
        <span className="ms-2 text-[36px] font-bold tracking-normal text-fg-subtle">
          {stamps
            ? `/ ${goal}`
            : formatPoints(n, program.terminology).replace(/^[\d,]+ /, "")}
        </span>
      </p>
      {stamps ? <StampRow goal={goal} filled={n} size={28} /> : null}
      <p className="text-[15px] font-medium text-fg">
        {ready
          ? `${rewardInSentence(ready.name)} ready next time`
          : res.member.nextReward
            ? stampsLeft(left, res.member.nextReward.name)
            : formatPoints(n, program.terminology)}
      </p>
      {res.breakdown.length ? (
        <p className="text-meta text-fg-muted">{res.breakdown.join(" · ")}</p>
      ) : null}
      {res.messages.map((msg) => (
        <p key={msg} className="text-meta text-fg-muted">
          {msg}
        </p>
      ))}
      <Button size="lg" fullWidth onClick={onNext} autoFocus className="mt-4">
        Next customer
      </Button>
      <p className="text-[12px] text-fg-muted">
        Returns to scan in {Math.round(AUTO_RETURN_MS / 1000)} seconds
      </p>
    </section>
  );
}

/** Goal reached: orange Redeem, or stamp on purpose and keep the reward. */
function RewardReady({
  member,
  program,
  busy,
  onRedeem,
  onStamp,
  onBack,
}: {
  member: staffApi.MemberSummaryDto;
  program: ProgramForCounter;
  busy: boolean;
  onRedeem: (rewardId: string) => void;
  onStamp: () => void;
  onBack: () => void;
}) {
  const goal =
    program.stampGoal || member.rewardsAffordable[0]?.pointsCost || 10;
  const reward = member.rewardsAffordable[0] ?? null;
  const carry = reward
    ? member.balance - reward.pointsCost
    : Math.max(0, member.balance - goal);
  const rewardName = reward?.name ?? "Free drink";
  const [pick, setPick] = useState(false);
  return (
    <section
      aria-labelledby="reward-title"
      className="flex flex-col items-center gap-3 pt-2 text-center"
    >
      <span
        aria-hidden
        className="inline-flex size-16 items-center justify-center rounded-full bg-bg-muted text-[22px] font-semibold uppercase text-fg"
      >
        {initialsOf(member.name)}
      </span>
      <h2 className="font-display text-[22px] font-bold leading-7 text-fg">
        {member.name ?? "Member"}
      </h2>
      <span className="rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent-text">
        Reward ready
      </span>
      <p
        id="reward-title"
        className="font-display text-[56px] font-extrabold leading-[56px] tracking-[-0.03em] text-fg"
      >
        {rewardName}
      </p>
      {program.earnType === "stamps" ? (
        <StampRow goal={goal} filled={goal} size={28} className="mt-3" />
      ) : null}
      <p className="text-[13px] text-fg-muted">
        {firstName(member.name) || "They"}{" "}
        {firstName(member.name) ? "has" : "have"}{" "}
        {formatPoints(member.balance, member.terminology)}.{" "}
        {carry > 0
          ? `${carry} carries over after redeeming.`
          : "A fresh card starts after redeeming."}
      </p>
      <div className="mt-6 flex w-full flex-col gap-2.5">
        {member.rewardsAffordable.length > 1 && pick ? (
          <ul
            className="divide-y divide-line border-y border-line text-start"
            aria-label="Rewards ready"
          >
            {member.rewardsAffordable.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center gap-3 py-2">
                <Gift
                  aria-hidden
                  className="size-4 text-fg-muted"
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1 text-body-strong text-fg">
                  {r.name}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onRedeem(r.id)}
                >
                  {copy.action.redeem}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              member.rewardsAffordable.length > 1
                ? setPick(true)
                : reward
                  ? onRedeem(reward.id)
                  : undefined
            }
            className="inline-flex h-[52px] items-center justify-center rounded-full bg-accent px-6 text-[16px] font-semibold text-on-accent hover:brightness-95 focus-visible:focus-ring disabled:opacity-70"
          >
            {busy ? <Spinner /> : `Redeem ${rewardInSentence(rewardName)}`}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onStamp}
          className="inline-flex h-[52px] items-center justify-center rounded-full border border-line px-6 text-[15px] font-medium text-fg hover:bg-bg-subtle focus-visible:focus-ring disabled:opacity-70"
        >
          Stamp instead, keep the reward
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-1 text-[13px] font-medium text-fg-muted hover:text-fg"
        >
          Not them? Back to scan
        </button>
      </div>
    </section>
  );
}

/**
 * Stamp on scan is off, or the program takes an amount: one confirm tap (canvas Counter.dc.html): header, one 64 px
 * "7 / 10", the stamp row, the amount pad or the +1 chips, a 72 px black award button, then redeem and "Enter code".
 */
function MemberPanel({
  member,
  program,
  busy,
  cents,
  setCents,
  qty,
  setQty,
  showRewards,
  setShowRewards,
  onAward,
  onRedeem,
  onVerify,
  onClear,
}: {
  member: staffApi.MemberSummaryDto;
  program: ProgramForCounter;
  busy: boolean;
  cents: string;
  setCents: (fn: (c: string) => string) => void;
  qty: number;
  setQty: (n: number) => void;
  showRewards: boolean;
  setShowRewards: (v: boolean) => void;
  onAward: () => void;
  onRedeem: (rewardId: string) => void;
  onVerify: () => void;
  onClear: () => void;
}) {
  const perDollar = program.earnType === "per_dollar";
  const stamps = program.earnType === "stamps";
  const goal = program.stampGoal || member.nextReward?.pointsCost || 10;
  return (
    <section
      className="rounded-card border border-line bg-bg p-5 sm:p-6"
      aria-labelledby="member-title"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-bg-muted text-[15px] font-semibold uppercase text-fg"
        >
          {initialsOf(member.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="member-title"
            className="truncate text-[18px] font-semibold leading-[23px] text-fg"
          >
            {member.name ?? "Member"}
          </h2>
          <p className="text-[13px] leading-[17px] tabular-nums text-fg-muted">
            {maskPhone(member.maskedPhone).replace(/(•+)\s(\d{4})$/, "$1-$2")} ·{" "}
            {ordinal(member.visitCount + 1)} visit
            {member.vip ? ` · ${member.vip.name}` : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="Clear customer"
          onClick={onClear}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-fg hover:bg-bg-muted focus-visible:focus-ring"
        >
          <X aria-hidden className="size-4" strokeWidth={2.2} />
        </button>
      </div>

      <div className="mt-7 text-center">
        <p className="display text-[64px] leading-[64px] tracking-[-0.02em] tabular-nums text-fg">
          {stamps
            ? Math.min(member.balance, goal)
            : member.balance.toLocaleString("en-CA")}
          <span className="text-[32px] text-fg-subtle">
            {stamps
              ? ` / ${goal}`
              : ` ${formatPoints(member.balance, member.terminology).replace(/^[\d,]+ /, "")}`}
          </span>
        </p>
        <p
          className={cn(
            "mt-2 text-[14px] leading-[18px]",
            member.rewardsAffordable.length
              ? "text-accent-text"
              : "text-fg-muted",
          )}
        >
          {member.terminology}
          {member.rewardsAffordable[0]
            ? ` · ${rewardInSentence(member.rewardsAffordable[0].name)} ready`
            : member.nextReward
              ? ` · ${member.nextReward.pointsNeeded} to ${/^free /i.test(member.nextReward.name) ? `a ${rewardInSentence(member.nextReward.name)}` : member.nextReward.name}`
              : ""}
        </p>
        {stamps ? (
          <StampRow
            goal={goal}
            filled={Math.min(member.balance, goal)}
            size={24}
            className="mt-4"
          />
        ) : null}
      </div>
      {member.openRedemptionCount > 0 ? (
        <Banner
          tone="info"
          className="mt-5"
          icon={Ticket}
          action={
            <Button size="sm" variant="ghost" onClick={onVerify}>
              Enter code
            </Button>
          }
        >
          This customer has a reward code waiting in the app.
        </Banner>
      ) : null}

      {perDollar ? (
        <div className="mt-6">
          <AmountPad cents={cents} setCents={setCents} />
        </div>
      ) : (
        <div className="mt-9">
          <div
            role="radiogroup"
            aria-label="How many"
            className="flex justify-center gap-2"
          >
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={qty === n}
                onClick={() => setQty(n)}
                className={cn(
                  "display h-11 rounded-full px-[18px] text-[16px] font-bold tabular-nums focus-visible:focus-ring",
                  qty === n
                    ? "bg-fg text-bg"
                    : "bg-bg-subtle text-fg hover:bg-bg-muted",
                )}
              >
                +{n}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-center text-[12px] text-fg-subtle">
            {stamps
              ? "One per drink in this order"
              : "One per item in this order"}
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={onAward}
          className="display inline-flex h-[72px] items-center justify-center rounded-[20px] bg-fg text-[22px] font-extrabold text-bg hover:bg-fg/90 focus-visible:focus-ring disabled:opacity-70"
        >
          {busy ? (
            <Spinner />
          ) : (
            awardLabel(program, centsFromKeypad(cents), qty)
          )}
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={!member.rewardsAffordable.length || busy}
            onClick={() =>
              member.rewardsAffordable.length === 1
                ? onRedeem(member.rewardsAffordable[0]!.id)
                : setShowRewards(true)
            }
            className="h-[52px] flex-1 rounded-[16px] bg-bg-subtle text-[15px] font-semibold text-fg hover:bg-bg-muted focus-visible:focus-ring disabled:cursor-not-allowed disabled:text-fg-subtle disabled:hover:bg-bg-subtle"
          >
            {member.rewardsAffordable.length
              ? member.rewardsAffordable.length === 1
                ? `Redeem ${rewardInSentence(member.rewardsAffordable[0]!.name)}`
                : "Redeem"
              : `Redeem · needs ${member.nextReward?.pointsCost ?? goal}`}
          </button>
          <button
            type="button"
            onClick={onVerify}
            className="h-[52px] flex-1 rounded-[16px] bg-bg-subtle text-[15px] font-semibold text-fg hover:bg-bg-muted focus-visible:focus-ring"
          >
            Redeem a code
          </button>
        </div>
      </div>

      {showRewards && member.rewardsAffordable.length > 1 ? (
        <div className="mt-5">
          <h3 className="text-meta-strong text-fg">Ready to redeem</h3>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {member.rewardsAffordable.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center gap-3 py-2">
                <Gift
                  aria-hidden
                  className="size-4 text-fg-muted"
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1 text-body-strong text-fg">
                  {r.name}
                </span>
                <span className="text-meta tabular-nums text-fg-muted">
                  {formatPoints(r.pointsCost, member.terminology)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onRedeem(r.id)}
                >
                  {copy.action.redeem}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {member.discountCards.length ? (
        <p className="mt-3 text-meta text-fg-muted">
          Discount cards: {member.discountCards.map((d) => d.name).join(", ")}
        </p>
      ) : null}
      <p className="mt-4 text-center text-caption text-fg-muted">
        {member.expiryDisclosure} ·{" "}
        <kbd className="rounded-[5px] border border-line px-1.5 text-caption">
          Esc
        </kbd>{" "}
        for the next customer
      </p>
    </section>
  );
}

/** Four-digit PIN to say who is stamping: awards are then attributed to that person (Stamps by staff on Home). */
function PinPad({
  verify,
  onDone,
  onCancel,
}: {
  verify: (
    body: authApi.StaffPinVerifyBody,
  ) => Promise<authApi.StaffPinVerifyResponse>;
  onDone: (s: CounterStaff) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      setErr(null);
      try {
        const r = await verify({ pin: value });
        onDone({
          userId: r.staff.userId,
          name: r.staff.name,
          token: r.accessToken,
        });
      } catch (e) {
        setPin("");
        setErr(
          isApiError(e) && e.status === 401
            ? "That PIN is not right."
            : errorMessage(e),
        );
      } finally {
        setBusy(false);
      }
    },
    [verify, onDone],
  );
  return (
    <section
      role="dialog"
      aria-label="Who is stamping?"
      className="flex flex-col gap-3 rounded-card border border-line p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-body-strong text-fg">
          <KeyRound
            aria-hidden
            className="size-4 text-fg-muted"
            strokeWidth={1.75}
          />{" "}
          Who is stamping?
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="inline-flex size-8 items-center justify-center rounded-full hover:bg-bg-subtle"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <p className="text-meta text-fg-muted">
        Type your 4-digit PIN. Stamps you give show under your name.
      </p>
      <div
        role="group"
        aria-label="PIN"
        className="flex justify-center gap-2.5"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-[12px] border text-[24px]",
              i === pin.length ? "border-fg" : "border-line",
            )}
          >
            {pin[i] ? "•" : ""}
          </span>
        ))}
      </div>
      {err ? (
        <p role="alert" className="text-center text-meta text-negative">
          {err}
        </p>
      ) : null}
      <ScanKeypad
        disabled={busy}
        onKey={(k) => {
          const next = pushDigit(pin, k);
          setPin(next);
          if (next.length === 4 && next !== pin) void submit(next);
        }}
      />
    </section>
  );
}

function SuccessMark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      className="ll-success-mark mb-4 size-12 text-positive"
    >
      <circle
        cx="24"
        cy="24"
        r="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M15.5 24.5 L21.5 30.5 L33 18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AmountPad({
  cents,
  setCents,
}: {
  cents: string;
  setCents: (fn: (c: string) => string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-meta-strong text-fg">Purchase amount</p>
      <output
        aria-live="polite"
        aria-label="Purchase amount"
        className="block border-b border-line px-1 py-3 text-end font-display text-display-number tabular-nums text-fg"
      >
        {keypadDisplay(cents)}
      </output>
      <Keypad
        size="compact"
        onKey={(k) => setCents((c) => applyKey(c, k))}
        label="Amount keypad"
      />
    </div>
  );
}
