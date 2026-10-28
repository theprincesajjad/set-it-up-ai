"use client";
import {
  Check,
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
import { PHARMACY_FRONT_STORE_CAPTION_EN, PHARMACY_FRONT_STORE_TICK_EN, type authApi, type staffApi } from "@ll/shared";
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
  awardSuccess,
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
import { GroceryExtras, notCountedCents, type GroceryCounter } from "./GroceryExtras";
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
import { CounterNotice } from "./CounterNotice";
import { DigitBoxes, ScanKeypad } from "./ScanKeypad";
import { ScanPanel } from "./ScanPanel";
import { StampRow } from "./StampRow";

type CounterApi = MerchantEndpoints["counter"];

const FRONT_STORE_PROMPT = "Confirm the total has no prescriptions, pharmacy services or behind-the-counter (Schedule II or III) items.";

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
  /**
   * Pharmacy: every sale and every redeem needs the cashier to tick "no prescriptions or pharmacy services" first
   * (docs/research/pharmacies-wellness.md). The tick is sent as frontStoreOnly and the server refuses without it.
   */
  frontStoreRule?: boolean;
  /** Staff only: how long they can undo their own awards (a line under "Recent at the counter"). */
  undoNote?: string;
  /** Grocers: the "Not counted" amount and the bulk-item chips on the amount screen (docs/research/grocers.md). Omit for every other shop. */
  grocery?: GroceryCounter | null;
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
  frontStoreRule = false,
  grocery = null,
  undoNote,
}: CounterAppProps) {
  const [mode, setMode] = useState<"scan" | "verify">("scan");
  /** Bumped by the keypad's scan key: the scan panel opens the camera. */
  const [cameraRequest, setCameraRequest] = useState(0);
  // The counter is server-rendered, so it is on screen before React can hear a tap or a scanner's keystrokes (the key
  // listener below attaches in an effect). Anything entered in that gap was silently lost. `ready` flips in the same
  // commit as those effects: the keypad stays disabled until then and the scan panel says so (data-scan-ready).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);
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
  const [frontStore, setFrontStore] = useState(false);
  const [notCounted, setNotCounted] = useState("");
  const [bulk, setBulk] = useState<string[]>([]);
  const [bulkRemind, setBulkRemind] = useState(false);
  const frontStoreRef = useRef(false);
  const tickFrontStore = useCallback((v: boolean) => {
    frontStoreRef.current = v;
    setFrontStore(v);
  }, []);
  const [code, setCode] = useState("");
  const [recent, setRecent] = useState<staffApi.ActivityItemDto[]>([]);
  const [regulars, setRegulars] = useState<staffApi.MemberSummaryDto[]>([]);
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
  // Say the shop's own unit: a points shop never "adds a stamp".
  const addedWord = !perDollar && program.terminology === "stamps" ? "Stamp added" : "Points added";
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
    try {
      // Regulars not yet stamped today: one tap instead of four digits.
      if (typeof api.regulars === "function") setRegulars((await api.regulars()).items);
    } catch {
      /* optional shortcut */
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
    setNotCounted("");
    setBulk([]);
    setBulkRemind(false);
    setQty(1);
    setShowRewards(false);
    setError(null);
    setNewName("");
    setNewPhone("");
    setConsent(false);
    tickFrontStore(false);
    awardKey.current = null;
    redeemKey.current = null;
    scanner.current = EMPTY_SCANNER;
  }, [setEntry, tickFrontStore]);

  // The stamped screen goes back to scan after 3 s on its own (Next customer does it now).
  useEffect(() => {
    if (phase.kind !== "awarded") return;
    const t = setTimeout(() => reset(), AUTO_RETURN_MS);
    return () => clearTimeout(t);
  }, [phase, reset]);

  // A redeem returns to scan too, but later than a stamp: the barista may still need "Undo redeem".
  useEffect(() => {
    if (phase.kind !== "redeemed") return;
    const t = setTimeout(() => reset(), 10_000);
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
      if (frontStoreRule && !frontStoreRef.current) {
        setError(FRONT_STORE_PROMPT);
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
        ...(frontStoreRule ? { frontStoreOnly: true } : {}),
        ...(grocery && notCountedCents(notCounted) > 0 ? { notCountedCents: notCountedCents(notCounted) } : {}),
      };
      if (grocery && notCountedCents(notCounted) > centsFromKeypad(cents)) {
        setBusy(false);
        setError("The part that doesn't count is more than the total.");
        return;
      }
      const p = phaseRef.current;
      const before =
        from ??
        (p.kind === "member" || p.kind === "reward" ? p.member.balance : 0);
      const label = awardLabel(program, Math.max(0, centsFromKeypad(cents) - (grocery ? notCountedCents(notCounted) : 0)), qty);
      try {
        const res = await api.award(body, awardKey.current);
        awardKey.current = null;
        // Bulk items bought: log each so the shop can text before the household runs out (only with their yes).
        if (grocery && bulk.length && !res.duplicate) {
          for (const id of bulk) {
            try {
              await api.logPantry({ memberId: res.member.memberId, pantryItemId: id, remind: bulkRemind });
            } catch {
              // The points are in; the log is a convenience and can be tapped again at the next visit.
            }
          }
        }
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
          `${res.duplicate ? "Already added" : `${addedWord} for ${firstName(res.member.name) || "the customer"}`}. ${formatPoints(res.balance, program.terminology)}. Undo is on screen for ${undoSeconds} seconds.`,
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
      addedWord,
      cents,
      qty,
      locationId,
      perDollar,
      frontStoreRule,
      program,
      loadRecent,
      saveQueue,
      clock,
      undoSeconds,
      setEntry,
      grocery,
      notCounted,
      bulk,
      bulkRemind,
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
      if (frontStoreRule && !frontStoreRef.current) {
        setError(FRONT_STORE_PROMPT);
        return;
      }
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
            ...(frontStoreRule ? { frontStoreOnly: true } : {}),
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
    [api, locationId, perDollar, cents, loadRecent, frontStoreRule],
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
    if (frontStoreRule && !frontStoreRef.current) return setError(FRONT_STORE_PROMPT);
    setBusy(true);
    setError(null);
    try {
      const res = await api.verify(code.trim().toUpperCase(), frontStoreRule ? true : undefined);
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
  }, [api, code, loadRecent, frontStoreRule]);

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
  const idle = mode === "scan" && phase.kind === "idle";
  const lookupShown = idle && !pinOpen;
  const statusText = online ? "Online" : "Offline";

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      {/* Chrome-free (Figma 15:2): the shop, the page name, whether this device is online, who is stamping. No page header, no banners. */}
      <div className="overflow-hidden rounded-card border border-border bg-background">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-hover text-meta-strong uppercase text-foreground">
              {initialsOf(shopName)}
            </span>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
              <span className="truncate text-body-strong text-foreground">
                <bdi>{shopName}</bdi>
              </span>
              <h1 className="text-body text-muted-foreground">Counter</h1>
              <span className="flex items-center gap-1.5 text-meta text-muted-foreground">
                <span aria-hidden className={cn("size-2 rounded-full", online ? "bg-success" : "bg-destructive")} />
                {statusText}
                {stampsToday != null ? ` · ${formatPoints(stampsToday, program.terminology)} today` : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {locations.length > 1 ? (
              <label className="flex items-center gap-2">
                <span className="sr-only">Location</span>
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
                  className="h-11 rounded-input border border-input bg-background px-3 text-meta text-foreground"
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
                aria-label={staff ? `Stamping as ${staff.name ?? "staff"}. Switch` : "Sign in with a PIN"}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background px-3 text-meta-strong text-foreground hover:bg-hover focus-visible:focus-ring"
              >
                <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full bg-hover text-caption font-semibold uppercase">
                  {(staff?.name ?? signedInName ?? "?").trim()[0]}
                </span>
                {firstName(staff?.name ?? signedInName ?? "") || "Staff"}
              </button>
            ) : null}
          </div>
        </header>

        {frontStoreRule ? (
          <div className="border-b border-border bg-muted px-4 py-3 lg:px-6" data-testid="front-store-confirm">
            <Checkbox checked={frontStore} onChange={tickFrontStore} label={PHARMACY_FRONT_STORE_TICK_EN} caption={PHARMACY_FRONT_STORE_CAPTION_EN} />
          </div>
        ) : null}

        {queue.length || !online || sentNote || error ? (
          <div className="flex flex-col gap-2 border-b border-border px-4 py-3 lg:px-6">
            {queue.length || !online || sentNote ? (
              <div
                role="status"
                className={cn("flex min-h-11 items-center gap-3 rounded-xl px-4 py-2 text-meta", queue.length || !online ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}
              >
                {queue.length || !online ? <WifiOff aria-hidden className="size-4 shrink-0" strokeWidth={2} /> : null}
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
                    className="min-h-11 rounded-full px-3 font-semibold underline-offset-2 hover:underline focus-visible:focus-ring disabled:opacity-60"
                  >
                    {sending ? "Sending..." : "Retry now"}
                  </button>
                ) : null}
              </div>
            ) : null}
            {error ? <CounterNotice tone="danger" onDismiss={() => setError(null)}>{error}</CounterNotice> : null}
          </div>
        ) : null}

        <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* Left: find the customer. On a phone it is only there while there is nobody on screen. */}
          <div className={cn("min-w-0 flex-col gap-4 bg-muted p-4 lg:flex lg:border-e lg:border-border lg:p-6", lookupShown || pinOpen ? "flex" : "hidden")}>
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
            {lookupShown ? (
              <>
                <ScanPanel
                  ready={ready}
                  cameraRequest={cameraRequest}
                  onScan={onScan}
                  hint={program.counterAutoStamp && !perDollar ? "Wallet pass, app, or printed QR. Stamps on scan." : "Wallet pass, app, or printed QR."}
                />
                <p className="text-meta text-muted-foreground">Or type the last 4 digits of their phone</p>
                <DigitBoxes value={entry} />
                <ScanKeypad onKey={onDigit} disabled={busy || !ready} onScanKey={() => setCameraRequest((n) => n + 1)} />
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMode("verify");
                    setError(null);
                  }}
                >
                  Redeem a code
                </Button>
              </>
            ) : !pinOpen ? (
              <>
                {/* Tablet only: the lookup stays put while a customer is on the right, dimmed and out of reach (Figma 15:2). */}
                <div inert aria-hidden className="hidden flex-col gap-4 opacity-50 lg:flex">
                  <DigitBoxes value={entry} />
                  <ScanKeypad onKey={() => undefined} disabled />
                </div>
                <p className="hidden text-meta text-muted-foreground lg:block">
                  <kbd className="rounded-sm border border-border px-1.5 text-caption">Esc</kbd> for the next customer
                </p>
              </>
            ) : null}
          </div>

          {/* Right: the customer and the one decision. */}
          <div className="flex min-w-0 flex-col gap-6 p-4 lg:p-6">
            {idle && regulars.length && !perDollar ? (
              <section aria-labelledby="regulars-title" className="flex flex-col gap-2">
                <h2 id="regulars-title" className="text-meta-strong text-muted-foreground">
                  Regulars not in yet today · tap to {program.counterAutoStamp ? "stamp" : "open"}
                </h2>
                <ul className="flex flex-wrap gap-2" aria-label="Regulars">
                  {regulars.map((m) => (
                    <li key={m.memberId}>
                      <button
                        type="button"
                        disabled={busy || !ready}
                        aria-label={`${program.counterAutoStamp ? "Stamp" : "Open"} ${m.name ?? "member"}`}
                        className="min-h-11 rounded-full border border-border px-4 text-meta-strong text-foreground hover:bg-hover focus-visible:focus-ring disabled:opacity-50"
                        onClick={() => {
                          if (isRewardReady(m, program)) setPhase({ kind: "reward", member: m });
                          else if (program.counterAutoStamp) {
                            phaseRef.current = { kind: "member", member: m };
                            void award({ memberId: m.memberId }, {}, m.balance);
                          } else setPhase({ kind: "member", member: m });
                        }}
                      >
                        {firstName(m.name) || "Member"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
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


          {mode === "scan" && phase.kind === "pick" ? (
            <section
              aria-labelledby="pick-title"
              className="flex flex-col gap-4"
            >
              <div>
                <h2
                  id="pick-title"
                  className="font-display text-title font-bold leading-7 text-fg"
                >
                  {matchesHeading(phase.items.length, phase.digits)}
                </h2>
                <p className="mt-1 text-sm text-fg-muted">
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
                    className="flex items-center gap-3 rounded-card border border-line px-4 py-3.5"
                  >
                    <span
                      aria-hidden
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-bg-muted text-sm font-semibold uppercase text-fg"
                    >
                      {initialsOf(m.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-headline font-semibold text-fg">
                        {m.name ?? "Member"}
                      </span>
                      <span className="block text-sm tabular-nums text-fg-muted">
                        {maskedForRow(m.maskedPhone)}
                      </span>
                      <span className="block text-meta text-fg-muted">
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
                      className="h-10 rounded-full px-5 text-sm"
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
                className="text-center text-sm font-medium text-fg hover:underline focus-visible:focus-ring"
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
                className="font-display text-title font-bold leading-7 text-fg"
              >
                No one ends in {phase.digits}
              </h2>
              <p className="text-sm text-fg-muted">
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
              excludedCents={grocery ? Math.min(notCountedCents(notCounted), centsFromKeypad(cents)) : 0}
              extras={grocery ? <GroceryExtras grocery={grocery} cents={cents} notCounted={notCounted} setNotCounted={setNotCounted} bulk={bulk} setBulk={setBulk} remind={bulkRemind} setRemind={setBulkRemind} /> : null}
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
              className="flex flex-col gap-3"
              aria-labelledby="queued-title"
            >
              <Clock3
                aria-hidden
                className="size-10 text-muted-foreground"
                strokeWidth={1.5}
              />
              <p
                id="queued-title"
                className="font-display text-h1 text-foreground"
              >
                {phase.label} for {phase.who}
              </p>
              <p className="text-body text-muted-foreground">
                Saved on this device. It sends when you&apos;re back online,
                with nothing counted twice.
              </p>
              <Button size="counter" onClick={reset} autoFocus>
                Next customer
              </Button>
            </section>
          ) : null}

          {phase.kind === "redeemed" ? (
            <section
              role="status"
              className="flex flex-col gap-3"
            >
              <SuccessMark />
              <p className="font-display text-h1 text-foreground">
                {phase.res.redemption.reward.name} redeemed.
              </p>
              <p className="text-title font-normal text-foreground">
                Hand it over.
                {phase.res.redemption.discountCents
                  ? ` Discount ${formatMoney(phase.res.redemption.discountCents)}.`
                  : ""}
              </p>
              <p className="text-body text-muted-foreground">
                {phase.res.member.name
                  ? `${firstName(phase.res.member.name)} has `
                  : "Balance "}
                {formatPoints(
                  phase.res.member.balance,
                  phase.res.member.terminology,
                )}{" "}
                left.
              </p>
              <div className="flex flex-col gap-2">
                <Button size="counter" onClick={reset} autoFocus>
                  Next customer
                </Button>
                {phase.res.redemption.transactionId ? (
                  <Button
                    variant="secondary"
                    size="lg"
                    className="min-h-14 rounded-xl"
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
              <p className="text-center text-caption text-muted-foreground">Returns to scan in 10 seconds</p>
            </section>
          ) : null}

        <aside
          aria-labelledby="recent-title"
          className="min-w-0"
        >
          <h2 id="recent-title" className="text-body-strong text-fg">
            Recent at the counter
          </h2>
          {undoNote ? <p className="text-caption text-muted-foreground">{undoNote}</p> : null}
          {recent.length ? (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {recent.map((a) => (
                // Fixed trailing columns so every number lines up whether or not the row can be undone (D7).
                <li
                  key={a.transactionId}
                  className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_60px] items-center gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p dir="auto" className="truncate text-meta text-fg">
                      {a.name ??
                        (a.maskedPhone ? maskPhone(a.maskedPhone) : "Member")}
                      {a.reversed ? (
                        <span className="text-fg-muted"> · undone</span>
                      ) : null}
                    </p>
                    <p dir="auto" className="truncate text-caption text-muted-foreground">
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
                        className="min-h-11 rounded-sm px-2 text-meta text-muted-foreground hover:text-foreground hover:underline focus-visible:focus-ring"
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


            {toast && secondsLeft > 0 ? (
              <div
                role="status"
                className="sticky bottom-4 z-raised mt-auto flex min-h-14 items-center justify-between gap-3 rounded-xl bg-primary px-4 py-2.5 text-meta-strong text-primary-foreground shadow-float"
              >
                <span className="flex items-center gap-2">
                  <Check aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
                  {awardSuccess(program, toast.res.pointsEarned)}.{" "}
                  {toast.res.member.name ? `${firstName(toast.res.member.name)} now has ${toast.res.balance}.` : `Balance ${toast.res.balance}.`}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void undo(toast.res.transactionId!)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 font-semibold tabular-nums hover:underline focus-visible:focus-ring disabled:opacity-60"
                >
                  <RotateCcw aria-hidden className="size-3.5" /> Undo {secondsLeft}s
                </button>
              </div>
            ) : null}
          </div>
        </div>
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

/** Who is at the counter: initials, name, phone and visit (Figma 15:2). `children` sits at the end edge (a status pill, a clear button). */
function CustomerHeader({ name, detail, titleId, size = "lg", children }: { name: string | null; detail?: React.ReactNode; titleId?: string; size?: "md" | "lg"; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-hover font-semibold uppercase text-foreground", size === "lg" ? "size-14 text-title" : "size-11 text-meta-strong")}>
        {initialsOf(name)}
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="truncate font-display text-h1 text-foreground">
          {name ?? "Member"}
        </h2>
        {detail ? <p className="text-meta tabular-nums text-muted-foreground">{detail}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** The stamp card on the right pane: what the next reward is, how far they are, and the stamps. */
function StampsPanel({ title, have, goal, ready, popFrom, size = "lg" }: { title: string; have: number; goal: number; ready: boolean; popFrom?: number; size?: "sm" | "md" | "lg" }) {
  return (
    <div className="rounded-card border border-border bg-card p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-body-strong text-foreground">{title}</p>
        <p className={cn("shrink-0 text-body-strong tabular-nums", ready ? "text-points-text" : "text-muted-foreground")}>
          {Math.min(have, goal)} of {goal}
        </p>
      </div>
      <StampRow goal={goal} filled={have} size={size} popFrom={popFrom} />
    </div>
  );
}

/** Stamped: the stamps with the new one popping in, one big number, what is left, then back to scan on its own. */
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
    <section role="status" aria-labelledby="ok-title" className="flex flex-col gap-5">
      <CustomerHeader
        name={res.duplicate ? "Already added" : res.member.name}
        titleId="ok-title"
        detail={res.memberCreated ? "New member · first stamp" : visitThisMonth(res.visitsThisMonth)}
      />
      <p className="font-display text-9xl font-extrabold leading-none tracking-tighter tabular-nums text-points-text">
        {stamps ? (
          <CountUp value={Math.min(n, goal)} from={Math.min(from, goal)} className="tabular-nums" />
        ) : (
          <CountUp value={n} from={from} className="tabular-nums" />
        )}
        <span className="ms-2 text-title font-bold tracking-normal text-muted-foreground">
          {stamps ? `/ ${goal}` : formatPoints(n, program.terminology).replace(/^[\d,]+ /, "")}
        </span>
      </p>
      {stamps ? <StampRow goal={goal} filled={n} size="md" popFrom={res.duplicate ? undefined : Math.min(from, goal)} /> : null}
      <p className="text-body-strong text-foreground">
        {ready
          ? `${rewardInSentence(ready.name)} ready next time`
          : res.member.nextReward
            ? stampsLeft(left, res.member.nextReward.name)
            : formatPoints(n, program.terminology)}
      </p>
      {/* The big number already says "1 stamp"; only the extras (boosts, VIP) are worth a line. */}
      {res.breakdown.filter((b) => !/^\d+ stamps?$/.test(b)).length ? (
        <p className="text-meta text-muted-foreground">{res.breakdown.filter((b) => !/^\d+ stamps?$/.test(b)).join(" · ")}</p>
      ) : null}
      {/* Network perk and street-campaign progress ("1 of 3 shops visited") is for the customer's pass, not the barista's screen. */}
      <Button size="counter" onClick={onNext} autoFocus>
        Next customer
      </Button>
      <p className="text-center text-caption text-muted-foreground">Returns to scan in {Math.round(AUTO_RETURN_MS / 1000)} seconds</p>
    </section>
  );
}

/** Goal reached (Figma 15:2): one black Redeem, and "stamp instead" when they want to keep the reward. */
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
  const goal = program.stampGoal || member.rewardsAffordable[0]?.pointsCost || 10;
  const reward = member.rewardsAffordable[0] ?? null;
  const carry = reward ? member.balance - reward.pointsCost : Math.max(0, member.balance - goal);
  const rewardName = reward?.name ?? "Free drink";
  const [pick, setPick] = useState(false);
  return (
    <section aria-labelledby="reward-title" className="flex flex-col gap-5">
      <CustomerHeader name={member.name} titleId="reward-title" detail={`${maskPhone(member.maskedPhone).replace(/(•+)\s(\d{4})$/, "$1-$2")} · ${ordinal(member.visitCount + 1)} visit`}>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-points-soft px-3 py-1.5 text-meta-strong text-points-text">
          <span aria-hidden className="size-1.5 rounded-full bg-points" />
          Reward ready
        </span>
      </CustomerHeader>
      {program.earnType === "stamps" ? (
        <StampsPanel title={`${rewardName} after ${goal} stamps`} have={goal} goal={goal} ready />
      ) : (
        <p className="font-display text-display text-foreground">{rewardName}</p>
      )}
      <p className="text-meta text-muted-foreground">
        {firstName(member.name) || "They"} {firstName(member.name) ? "has" : "have"} {formatPoints(member.balance, member.terminology)}.{" "}
        {carry > 0 ? `${carry} carries over after redeeming.` : "A fresh card starts after redeeming."}
      </p>
      <div className="flex w-full flex-col gap-2">
        {member.rewardsAffordable.length > 1 && pick ? (
          <ul className="divide-y divide-border border-y border-border text-start" aria-label="Rewards ready">
            {member.rewardsAffordable.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center gap-3 py-2">
                <Gift aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 text-body-strong text-foreground">{r.name}</span>
                <Button size="md" variant="secondary" disabled={busy} onClick={() => onRedeem(r.id)}>
                  {copy.action.redeem}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Button
            size="counter"
            iconStart={Gift}
            loading={busy}
            onClick={() => (member.rewardsAffordable.length > 1 ? setPick(true) : reward ? onRedeem(reward.id) : undefined)}
          >
            {`Redeem ${rewardInSentence(rewardName)}`}
          </Button>
        )}
        <Button size="lg" variant="secondary" disabled={busy} onClick={onStamp} className="min-h-14 rounded-xl">
          Stamp instead, keep the reward
        </Button>
        <button type="button" onClick={onBack} className="mt-1 min-h-11 text-meta-strong text-muted-foreground hover:text-foreground focus-visible:focus-ring">
          Not them? Back to scan
        </button>
      </div>
    </section>
  );
}

/**
 * Stamp on scan is off, or the program takes an amount: one confirm tap (Figma 15:2): the customer, their stamps, the amount pad or the +1 chips,
 * one 72 px black award button, then redeem and "Enter code".
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
  extras,
  excludedCents = 0,
}: {
  extras?: React.ReactNode;
  /** Grocers: the part of the total that never earns ("Not counted"); the button shows points for the rest. */
  excludedCents?: number;
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
  const next = member.rewardsAffordable[0]
    ? `${rewardInSentence(member.rewardsAffordable[0].name)} ready`
    : member.nextReward
      ? `${member.nextReward.pointsNeeded} to ${/^free /i.test(member.nextReward.name) ? `a ${rewardInSentence(member.nextReward.name)}` : member.nextReward.name}`
      : "";
  return (
    <section className="flex flex-col gap-5" aria-labelledby="member-title">
      <CustomerHeader
        name={member.name}
        titleId="member-title"
        detail={`${maskPhone(member.maskedPhone).replace(/(•+)\s(\d{4})$/, "$1-$2")} · ${ordinal(member.visitCount + 1)} visit${member.vip ? ` · ${member.vip.name}` : ""}`}
      >
        <button
          type="button"
          aria-label="Clear customer"
          onClick={onClear}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground hover:bg-hover focus-visible:focus-ring"
        >
          <X aria-hidden className="size-4" strokeWidth={2.2} />
        </button>
      </CustomerHeader>

      {stamps ? (
        <StampsPanel
          title={`${member.terminology}${next ? ` · ${next}` : ""}`}
          have={member.balance}
          goal={goal}
          ready={member.rewardsAffordable.length > 0}
          size="md"
        />
      ) : (
        <div className="rounded-card border border-border bg-card p-5 text-center">
          <p className="font-display text-display tabular-nums text-foreground">
            {member.balance.toLocaleString("en-CA")}
            <span className="text-title text-muted-foreground"> {formatPoints(member.balance, member.terminology).replace(/^[\d,]+ /, "")}</span>
          </p>
          <p className={cn("mt-1 text-meta", member.rewardsAffordable.length ? "text-points-text" : "text-muted-foreground")}>
            {member.terminology}
            {next ? ` · ${next}` : ""}
          </p>
        </div>
      )}
      {member.openRedemptionCount > 0 ? (
        <CounterNotice
          icon={Ticket}
          action={
            <Button size="sm" variant="ghost" onClick={onVerify}>
              Enter code
            </Button>
          }
        >
          This customer has a reward code waiting in the app.
        </CounterNotice>
      ) : null}

      {perDollar ? (
        <div>
          <AmountPad cents={cents} setCents={setCents} />
          {extras}
        </div>
      ) : (
        <div>
          <div role="radiogroup" aria-label="How many" className="flex gap-2">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={qty === n}
                onClick={() => setQty(n)}
                className={cn(
                  "h-11 min-w-16 rounded-full px-5 font-display text-headline font-bold tabular-nums focus-visible:focus-ring",
                  qty === n ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-hover",
                )}
              >
                +{n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-caption text-muted-foreground">{stamps ? "One per drink in this order" : "One per item in this order"}</p>
        </div>
      )}

      <div className={cn("flex flex-col gap-2", !!extras && "sticky bottom-0 z-raised -mx-4 border-t border-border bg-background px-4 pb-3 pt-3 lg:-mx-6 lg:px-6")}>
        <Button size="counter" loading={busy} onClick={onAward}>
          {awardLabel(program, Math.max(0, centsFromKeypad(cents) - excludedCents), qty)}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="min-h-14 flex-1 rounded-xl"
            disabled={!member.rewardsAffordable.length || busy}
            onClick={() => (member.rewardsAffordable.length === 1 ? onRedeem(member.rewardsAffordable[0]!.id) : setShowRewards(true))}
          >
            {member.rewardsAffordable.length
              ? member.rewardsAffordable.length === 1
                ? `Redeem ${rewardInSentence(member.rewardsAffordable[0]!.name)}`
                : "Redeem"
              : `Redeem · needs ${member.nextReward?.pointsCost ?? goal}`}
          </Button>
          <Button variant="secondary" size="lg" className="min-h-14 flex-1 rounded-xl" onClick={onVerify}>
            Redeem a code
          </Button>
        </div>
      </div>

      {showRewards && member.rewardsAffordable.length > 1 ? (
        <div>
          <h3 className="text-meta-strong text-foreground">Ready to redeem</h3>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {member.rewardsAffordable.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center gap-3 py-2">
                <Gift aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 text-body-strong text-foreground">{r.name}</span>
                <span className="text-meta tabular-nums text-muted-foreground">{formatPoints(r.pointsCost, member.terminology)}</span>
                <Button size="md" variant="secondary" disabled={busy} onClick={() => onRedeem(r.id)}>
                  {copy.action.redeem}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {member.discountCards.length ? <p className="text-meta text-muted-foreground">Discount cards: {member.discountCards.map((d) => d.name).join(", ")}</p> : null}
      <p className="text-center text-caption text-muted-foreground">
        {member.expiryDisclosure} · <kbd className="rounded-sm border border-border px-1.5 text-caption">Esc</kbd> for the next customer
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
      className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
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
          className="inline-flex size-11 items-center justify-center rounded-full hover:bg-hover focus-visible:focus-ring"
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
              "flex h-12 w-12 items-center justify-center rounded-lg border text-2xl",
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
