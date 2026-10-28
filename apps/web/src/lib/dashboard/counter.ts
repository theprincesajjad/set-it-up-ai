/** Web counter (staff-counter.md, staff.md): keypad money entry, lookup hints, award labels, scan-first rules. */
import { t as translate, type Locale, type MessageKey, type staffApi, type Vars } from "@ll/shared";
import { formatNumber, formatPoints } from "@/lib/format";

/**
 * Counter text in the staff member's language: a translator (`useLocale().t` in a component) plus the locale, for the few rules that
 * only English has (ordinals, a lower-cased reward name). Every helper below takes one as its last argument and defaults to English,
 * so a caller that has no locale (a test, the wallet-pass preview) keeps the English sentence.
 */
export interface CounterText {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
}
export const EN_TEXT: CounterText = { locale: "en", t: (key, vars) => translate("en", key, vars) };

/** "pts" for points, the plural stamp word for stamps, and the shop's own word (Stars, Visits) as typed. */
export function pointsText(n: number, terminology: string | null | undefined, ct: CounterText = EN_TEXT): string {
  const tl = (terminology || "points").toLowerCase();
  if (tl === "points") return `${formatNumber(n)} ${ct.t("counter.unit.short")}`;
  if (tl === "stamps") return ct.t("auth.unit.stamps", { n: formatNumber(n) });
  return formatPoints(n, terminology);
}

/** The unit word inside a sentence: "points" and "stamps" translate, the shop's own word stays as typed. */
function unitWord(terminology: string | null | undefined, ct: CounterText): string {
  const tl = (terminology || "points").toLowerCase();
  return tl === "points" ? ct.t("counter.word.points") : tl === "stamps" ? ct.t("counter.word.stamps") : tl;
}

/** A reward name inside a sentence. English lower-cases a leading "Free" ("a free drink"); other scripts have no such rule. */
export function rewardIn(name: string, ct: CounterText = EN_TEXT): string {
  if (ct.locale !== "en") return name;
  const m = /^([A-Z][a-z]+)(\b.*)$/.exec(name);
  return m ? `${m[1]!.toLowerCase()}${m[2]}` : name;
}

/** "5th" in English, a plain number in the other languages (their sentences carry the ordinal word). */
const nth = (n: number, ct: CounterText): string => (ct.locale === "en" ? ordinal(n) : String(n));

/** The recent-activity label for a transaction type: translated when the counter knows it, otherwise a readable form of the code. */
export function counterTypeLabel(type: string, ct: CounterText = EN_TEXT): string {
  const key = `counter.type.${type}` as MessageKey;
  const label = ct.t(key);
  return label === key ? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : label;
}

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back" | "clear";

/** Amount keypad: digits fill from the right like a till ("1","2","5","0" → $12.50). Max $99,999.99. */
export function applyKey(cents: string, key: KeypadKey): string {
  if (key === "clear") return "";
  if (key === "back") return cents.slice(0, -1);
  const next = (cents + key).replace(/^0+/, "");
  return next.length > 7 ? cents : next;
}

export function centsFromKeypad(cents: string): number {
  return Number.parseInt(cents || "0", 10);
}

export function keypadDisplay(cents: string): string {
  const n = centsFromKeypad(cents);
  return `$${(n / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What the staff member typed: drives the hint under the search box. */
export function lookupKind(q: string): "code" | "phone" | "last4" | "incomplete" {
  const t = q.trim();
  if (/^LL:/i.test(t) || (/^[A-Z0-9]{8}$/i.test(t.replace(/\s/g, "")) && /[A-Z]/i.test(t))) return "code";
  const d = t.replace(/\D/g, "");
  if (d.length === 4 && /^\d{4}$/.test(t)) return "last4";
  if (d.length === 10 || (d.length === 11 && d.startsWith("1"))) return "phone";
  return "incomplete";
}

export interface ProgramForCounter {
  earnType: "per_dollar" | "per_visit" | "stamps";
  pointsPerDollar: number;
  pointsPerVisit: number;
  terminology: string;
  /** Stamp programs: stamps per card (the "7 / 10" goal). */
  stampGoal?: number;
  /** Stamp on scan: a scan or a one-match 4-digit entry stamps without a confirm tap (never for per_dollar). */
  counterAutoStamp?: boolean;
}

/** Estimated earn for the button label; the server's breakdown is the truth. */
export function estimateEarn(p: ProgramForCounter, amountCents: number): number {
  if (p.earnType === "per_dollar") return Math.floor((amountCents / 100) * p.pointsPerDollar);
  return p.pointsPerVisit;
}

/** `quantity` (stamp / visit programs): +1/+2/+3 chips award quantity × pointsPerVisit in one tap. */
export function awardLabel(p: ProgramForCounter, amountCents: number, quantity = 1, ct: CounterText = EN_TEXT): string {
  const n = p.pointsPerVisit * Math.max(1, quantity);
  if (p.earnType === "stamps") return ct.t("counter.add.stamps", { n });
  if (p.earnType === "per_visit") return quantity > 1 ? ct.t("counter.add.visits", { q: quantity, n }) : ct.t("counter.add.visit", { n });
  return ct.t("counter.add.points", { n: estimateEarn(p, amountCents) });
}

export function awardSuccess(p: ProgramForCounter, pointsEarned: number, ct: CounterText = EN_TEXT): string {
  if (p.earnType === "stamps") return ct.t("counter.added.stamps", { n: pointsEarned });
  return ct.t("counter.added.points", { n: pointsEarned, unit: p.terminology === "points" ? ct.t("counter.unit.short") : p.terminology });
}

/**
 * Counter errors in plain words (polish-audit D11): what happened and what to do, one sentence.
 * `code` is the API error code; `message` the API's own text (used only when it is already human).
 */
export function counterErrorMessage(e: { code?: string; status?: number; message?: string; isNetwork?: boolean }, ctx: { terminology?: string | null; firstName?: string | null } = {}, ct: CounterText = EN_TEXT): string {
  const word = unitWord(ctx.terminology, ct);
  const who = ctx.firstName || ct.t("counter.who");
  if (e.isNetwork || e.status === 0) return ct.t("counter.err.offlineSaved");
  switch (e.code) {
    case "cooldown":
      return ct.t("counter.err.cooldown", { who, word });
    case "insufficient_points":
      return ct.t("counter.err.insufficient", { word });
    case "expired":
    case "code_expired":
      return ct.t("counter.err.expired");
    case "already_used":
      return ct.t("counter.err.used");
    case "void":
      return ct.t("counter.err.void");
    case "not_found":
      return ct.t("counter.err.notFound");
    case "program_paused":
      return ct.t("counter.err.paused");
    default:
      if (e.status === 404) return ct.t("counter.err.notFound");
      if (e.status === 409 && e.message) return e.message;
      if (e.status && e.status >= 500) return ct.t("counter.err.server");
      return e.message || ct.t("counter.err.generic");
  }
}

/** An award saved on this device while offline: replayed with the same idempotency key (never double-awards). */
export interface QueuedAward {
  key: string;
  body: Record<string, unknown>;
  label: string;
  at: number;
}

export const COUNTER_QUEUE_KEY = "ll.counter.queue";

export function readQueue(raw: string | null): QueuedAward[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is QueuedAward => !!x && typeof (x as QueuedAward).key === "string" && typeof (x as QueuedAward).body === "object") : [];
  } catch {
    return [];
  }
}

/** "Undo · 8s" for the countdown on the success panel. */
export function undoLabel(secondsLeft: number, ct: CounterText = EN_TEXT): string {
  return ct.t("counter.undoSecs", { n: Math.max(0, secondsLeft) });
}

// ---------------------------------------------------------------------------
// Scan first (cafes-retail.md 7.2): scanner input, 4-digit entry, what happens after a lookup
// ---------------------------------------------------------------------------
export const AUTO_RETURN_MS = 3000;
export const UNDO_WINDOW_MS = 10_000;
/** USB / Bluetooth scanners type the whole payload within a few ms per character; humans do not. */
export const SCANNER_MAX_GAP_MS = 80;
export const SCANNER_MIN_LENGTH = 6;
const QR_PREFIX = "LL:";
const MEMBER_CODE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

/** "LL:K7QX2M9P" (a scanned pass QR) or a bare 8-character member code, else null. */
export function scanPayload(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (t.startsWith(QR_PREFIX) && t.length > QR_PREFIX.length) return t;
  return MEMBER_CODE.test(t) ? t : null;
}

export interface ScannerState {
  buffer: string;
  lastAt: number;
}
export const EMPTY_SCANNER: ScannerState = { buffer: "", lastAt: 0 };

/**
 * Feed one key to the keyboard-scanner detector. Characters arriving faster than SCANNER_MAX_GAP_MS build a buffer;
 * Enter submits it when it is a pass payload. A slow key (a person typing) restarts the buffer.
 */
export function feedScanner(state: ScannerState, key: string, at: number): { state: ScannerState; scanned: string | null } {
  if (key === "Enter") {
    const scanned = state.buffer.length >= SCANNER_MIN_LENGTH ? scanPayload(state.buffer) : null;
    return { state: EMPTY_SCANNER, scanned };
  }
  if (key.length !== 1) return { state, scanned: null };
  const fast = state.buffer !== "" && at - state.lastAt <= SCANNER_MAX_GAP_MS;
  return { state: { buffer: (fast ? state.buffer : "") + key, lastAt: at }, scanned: null };
}

/** What the counter does with a lookup result. */
export type LookupOutcome = "none" | "new" | "pick" | "reward" | "stamp" | "confirm";

/**
 * One match on a stamp program below the goal with Stamp on scan on → stamp now. Two or more → show the list.
 * A member whose reward is ready is never stamped blindly (redeem, or stamp on purpose). Per-dollar always confirms.
 */
export function lookupOutcome(r: { items: staffApi.MemberSummaryDto[]; normalizedPhone: string | null }, program: ProgramForCounter): LookupOutcome {
  if (r.items.length === 0) return r.normalizedPhone ? "new" : "none";
  if (r.items.length > 1) return "pick";
  const m = r.items[0]!;
  if (isRewardReady(m, program)) return "reward";
  if (program.counterAutoStamp && program.earnType !== "per_dollar") return "stamp";
  return "confirm";
}

export function isRewardReady(m: Pick<staffApi.MemberSummaryDto, "balance" | "rewardsAffordable">, program: ProgramForCounter): boolean {
  if (m.rewardsAffordable.length > 0) return true;
  return program.earnType === "stamps" && !!program.stampGoal && m.balance >= program.stampGoal;
}

/** 1 -> "1st", 5 -> "5th", 12 -> "12th". */
export function ordinal(n: number): string {
  const t = n % 100;
  return `${n}${t >= 11 && t <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
}

/** "5th visit this month". */
export const visitThisMonth = (n: number, ct: CounterText = EN_TEXT) => ct.t("counter.visitMonth", { nth: nth(Math.max(1, n), ct) });

/** "5th visit" for the customer header. */
export const visitNth = (n: number, ct: CounterText = EN_TEXT) => ct.t("counter.visitNth", { nth: nth(n, ct) });

/** "2 more for a free drink" / "Free drink ready". */
export function stampsLeft(left: number, rewardName: string, ct: CounterText = EN_TEXT): string {
  if (left <= 0) return ct.t("counter.readyShort", { reward: rewardName });
  const what = ct.locale === "en" && /^free /i.test(rewardName) ? `a ${rewardName.toLowerCase()}` : rewardName;
  return ct.t("counter.moreFor", { n: left, reward: what });
}

/** "in yesterday", "in 2 weeks ago", "in today": the second line of a match row. */
export function cameInText(iso: string | null | undefined, now: Date, ct: CounterText = EN_TEXT): string {
  if (!iso) return ct.t("counter.came.new");
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return ct.t("counter.came.today");
  if (days === 1) return ct.t("counter.came.yesterday");
  if (days < 14) return ct.t("counter.came.days", { n: days });
  if (days < 60) return ct.t("counter.came.weeks", { n: Math.round(days / 7) });
  return ct.t("counter.came.months", { n: Math.round(days / 30) });
}

/** "Two members end in 1034" (English spells the count out, the other languages write the number). */
export function matchesHeading(n: number, digits: string, ct: CounterText = EN_TEXT): string {
  if (n === 1) return ct.t("counter.pick.one", { digits });
  const words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  return ct.t("counter.pick.many", { count: ct.locale === "en" ? (words[n] ?? n) : n, digits });
}

/** "(647) ···-1034" from the API's "(647) ***-1034". */
export const maskedForRow = (m: string | null | undefined) => (m ?? "").replace(/\*+/g, "···");

/** 4-digit entry: digits only, at most 4. */
export function pushDigit(entry: string, key: string): string {
  if (key === "back") return entry.slice(0, -1);
  if (key === "clear") return "";
  return /^\d$/.test(key) && entry.length < 4 ? entry + key : entry;
}
