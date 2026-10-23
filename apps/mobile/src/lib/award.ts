/**
 * Counter award flow logic (docs/design/screens/staff-counter.md § 2-5):
 * POS-style amount entry, live button labels, success-card copy, undo
 * countdown, scan classification and the keypad → lookup → award → success
 * state machine. Pure TypeScript (no React Native) so it is unit tested.
 */
import { rewardInSentence } from "./format";
import { calculateEarn, staffApi } from "@ll/shared";
import { formatNanp, sanitizePhoneInput, toE164, validateNanp } from "./phone";

// ---------------------------------------------------------------------------
// Numbers and terminology
// ---------------------------------------------------------------------------
export const MAX_AMOUNT_CENTS = 9_999_999; // $99,999.99

export function formatNumber(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "$11.80", "$1,250.00" */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${formatNumber(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, "0")}`;
}

/** Singular/plural of the program's unit: points → pt/pts, stamps → stamp/stamps, stars → star/stars. */
export function unitLabel(terminology: string | null | undefined, n: number): string {
  const t = (terminology || "points").toLowerCase();
  if (t === "points" || t === "point") return Math.abs(n) === 1 ? "pt" : "pts";
  const singular = t.endsWith("s") ? t.slice(0, -1) : t;
  return Math.abs(n) === 1 ? singular : `${singular}s`;
}

/** "120 pts", "1 stamp", "8 stamps", "1,250 pts" */
export function formatPts(n: number, terminology?: string | null): string {
  return `${formatNumber(n)} ${unitLabel(terminology, n)}`;
}

/** Full word for sentences: "points"/"point", "stamps"/"stamp". */
export function termWord(terminology: string | null | undefined, n = 2): string {
  const t = (terminology || "points").toLowerCase();
  const singular = t.endsWith("s") ? t.slice(0, -1) : t;
  return n === 1 ? singular : `${singular}s`;
}

/** Locked rewards say how far to go, in the shop's unit, the same phrase as the wallet: "12 pts to go". */
export function lockedRewardCopy(toGo: number, terminology: string | null | undefined): string {
  return `${formatPts(toGo, terminology)} to go`;
}

/** POS-style entry: digits shift in from the right (typing 1180 shows $11.80). */
export function posAmountPress(cents: number, key: string): number {
  if (key === "clear") return 0;
  if (key === "back") return Math.floor(cents / 10);
  if (!/^\d$/.test(key)) return cents;
  const next = cents * 10 + Number(key);
  return next > MAX_AMOUNT_CENTS ? cents : next;
}

// ---------------------------------------------------------------------------
// Program + promos
// ---------------------------------------------------------------------------
export interface CounterProgram {
  earnType: "per_dollar" | "per_visit" | "stamps";
  terminology: string;
  pointsPerDollar: number;
  pointsPerVisit: number;
  minSpendCents: number;
  stampGoal: number;
  active?: boolean;
  /** Stamp on scan: a scan or a one-match 4-digit entry stamps without a confirm tap (never for per_dollar). */
  counterAutoStamp?: boolean;
}

export interface PromoLike {
  kind: string;
  multiplierPct: number | null;
  bonusPoints?: number | null;
  daysOfWeek: number[] | null;
  startTime: string | null;
  endTime: string | null;
  startsAt: string;
  endsAt: string | null;
  status?: string;
}

function hhmmToMinutes(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Whether a live promo applies at `now` (date window, day of week, time of day; device local time). */
export function promoActiveAt(p: PromoLike, now: Date): boolean {
  if (p.status && p.status !== "live") return false;
  if (new Date(p.startsAt).getTime() > now.getTime()) return false;
  if (p.endsAt && new Date(p.endsAt).getTime() < now.getTime()) return false;
  if (p.daysOfWeek && p.daysOfWeek.length && !p.daysOfWeek.includes(now.getDay())) return false;
  const start = hhmmToMinutes(p.startTime);
  const end = hhmmToMinutes(p.endTime);
  const mins = now.getHours() * 60 + now.getMinutes();
  if (start !== null && end !== null) {
    if (end >= start ? mins < start || mins >= end : mins < start && mins >= end) return false;
  }
  return true;
}

/** Biggest active multiplier ("2x today"), 1 when none. Multipliers don't stack (shared/points.ts). */
export function activeMultiplier(promos: PromoLike[], now: Date): number {
  let best = 1;
  for (const p of promos) {
    if (p.kind === "multiplier" && p.multiplierPct && p.multiplierPct > 100 && promoActiveAt(p, now)) {
      best = Math.max(best, p.multiplierPct / 100);
    }
  }
  return best;
}

export interface EstimateInput {
  program: CounterProgram;
  amountCents: number;
  /** Selected category is a no-earn one (prescriptions, alcohol...). */
  noEarn?: boolean;
  multiplier?: number;
  /** VIP level multiplier in hundredths (150 = 1.5x). */
  vipMultiplierPct?: number | null;
}

/** Points the counter expects to award. The server is authoritative; this drives the button label. */
export function estimatePoints(input: EstimateInput): number {
  const { program } = input;
  const lines = program.earnType === "per_dollar" || input.noEarn ? [{ amountCents: input.amountCents, categoryId: input.noEarn ? "no-earn" : null }] : [];
  const res = calculateEarn({
    rules: {
      earnType: program.earnType,
      pointsPerDollar: program.pointsPerDollar,
      pointsPerVisit: program.pointsPerVisit,
      minSpendCents: program.earnType === "per_dollar" ? program.minSpendCents : 0,
    },
    lines,
    noEarnCategoryIds: input.noEarn ? ["no-earn"] : [],
    boosts: input.multiplier && input.multiplier > 1 ? [{ multiplier: input.multiplier }] : [],
    vipMultiplier: input.vipMultiplierPct ? input.vipMultiplierPct / 100 : 1,
  });
  if (input.noEarn) return 0;
  return res.totalPoints;
}

function multiplierSuffix(multiplier?: number): string {
  if (!multiplier || multiplier <= 1) return "";
  const x = Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(1);
  return ` (${x}x today)`;
}

/** Live label for the counter award button (ux-copy counter.*). */
export function awardButtonLabel(program: CounterProgram, opts: { points: number; noEarn?: boolean; multiplier?: number; newCustomer?: boolean }): string {
  if (opts.newCustomer) return "Add and award";
  if (opts.noEarn) return "Record visit (0 pts)";
  const suffix = multiplierSuffix(opts.multiplier);
  if (program.earnType === "stamps") {
    return opts.points > 1 ? `Add ${opts.points} ${termWord(program.terminology, 2)}${suffix}` : `Add ${termWord(program.terminology, 1)}${suffix}`;
  }
  if (program.earnType === "per_visit") return `Add visit (+${formatPts(opts.points, program.terminology)})${suffix}`;
  return `Award ${formatPts(opts.points, program.terminology)}${suffix}`;
}

/** Quantity chips for visit / stamp programs ("+2", "+3": two coffees). Per-dollar programs have none. */
export const MAX_AWARD_QUANTITY = 10;
export function quantityChips(program: Pick<CounterProgram, "earnType"> | null | undefined): number[] {
  return program && program.earnType !== "per_dollar" ? [2, 3] : [];
}

/** The `quantity` body field: only for visit / stamp programs and only when > 1 (API default is 1). */
export function awardQuantity(program: Pick<CounterProgram, "earnType">, quantity: number): { quantity: number } | Record<string, never> {
  if (program.earnType === "per_dollar") return {};
  const q = Math.max(1, Math.min(MAX_AWARD_QUANTITY, Math.floor(quantity)));
  return q > 1 ? { quantity: q } : {};
}

// ---------------------------------------------------------------------------
// Success card
// ---------------------------------------------------------------------------
export interface SuccessView {
  /** "Added 1 stamp" / "Awarded 12 pts" */
  title: string;
  /** "9 / 10", "282 pts", "~9 / 10" offline */
  hero: string;
  /** "1 more for a free drink" / "Reward ready: Free drink" / "Balance updates when you're back online" */
  next: string | null;
  rewardReady: boolean;
  offline: boolean;
  /** Network perk / campaign notes from the API. */
  messages: string[];
  /** Screen-reader announcement. */
  announcement: string;
  /** The hero's leading number and where it counts up from (the balance before this award). */
  count?: { from: number; to: number };
  /** Scan-first stamped screen: who, how many visits this month (shop time), and the balance after. */
  name?: string | null;
  visitsThisMonth?: number | null;
  balance?: number | null;
}

export function successView(input: {
  program: CounterProgram;
  pointsEarned: number;
  balance: number | null;
  nextReward?: { name: string; pointsNeeded: number } | null;
  rewardsAvailable?: { name: string }[];
  offline?: boolean;
  messages?: string[];
  firstName?: string | null;
  fullName?: string | null;
  visitsThisMonth?: number | null;
}): SuccessView {
  const { program } = input;
  const term = program.terminology;
  const stamps = program.earnType === "stamps";
  const title = stamps
    ? `Added ${formatPts(input.pointsEarned, term)}`
    : input.pointsEarned === 0
      ? "Visit recorded"
      : `Awarded ${formatPts(input.pointsEarned, term)}`;
  const tilde = input.offline ? "~" : "";
  let hero: string;
  if (input.balance === null) hero = `+${formatNumber(input.pointsEarned)}`;
  // "9 / 10" while filling a card; past a full card the balance reads as a count ("14 stamps").
  else if (stamps && program.stampGoal > 0 && input.balance <= program.stampGoal) hero = `${tilde}${formatNumber(input.balance)} / ${formatNumber(program.stampGoal)}`;
  else hero = `${tilde}${formatPts(input.balance, term)}`;
  const ready = input.rewardsAvailable?.[0];
  let next: string | null = null;
  // Offline with no known balance: the "saved" line under the hero says it all (polish-audit C16).
  if (input.offline && input.balance === null) next = null;
  else if (ready) next = `Reward ready: ${rewardInSentence(ready.name)}`;
  else if (input.nextReward) {
    next = stamps
      ? `${formatNumber(input.nextReward.pointsNeeded)} more for a ${input.nextReward.name.replace(/^free /i, "free ")}`
      : `${formatPts(input.nextReward.pointsNeeded, term)} to ${input.nextReward.name}`;
  }
  const who = input.firstName ? `${input.firstName} now has ` : "Balance ";
  const announcement = [title, input.balance !== null ? `${who}${formatPts(input.balance, term)}.` : "", next ?? ""].filter(Boolean).join(". ");
  const count = input.balance === null ? { from: 0, to: input.pointsEarned } : { from: Math.max(0, input.balance - input.pointsEarned), to: input.balance };
  return { title, hero, next, rewardReady: !!ready, offline: !!input.offline, messages: input.messages ?? [], announcement, count, name: input.fullName ?? null, visitsThisMonth: input.visitsThisMonth ?? null, balance: input.balance };
}

export const UNDO_SECONDS = 10;

/** Seconds left on the 10-second Undo (0 = hide the button). */
export function undoSecondsLeft(startedAtMs: number, nowMs: number, windowSeconds = UNDO_SECONDS): number {
  const left = Math.ceil((startedAtMs + windowSeconds * 1000 - nowMs) / 1000);
  return Math.max(0, Math.min(windowSeconds, left));
}

/** Non-blocking cooldown hint: "Alex got a stamp 1 min ago." (< 2 min since last visit). */
export function cooldownWarning(member: { name: string | null; lastVisitAt: string | null }, program: CounterProgram, nowMs: number): string | null {
  if (!member.lastVisitAt) return null;
  const ago = nowMs - new Date(member.lastVisitAt).getTime();
  if (ago < 0 || ago >= 2 * 60_000) return null;
  const mins = Math.max(1, Math.round(ago / 60_000));
  const who = firstName(member.name) ?? "This customer";
  const what = program.earnType === "stamps" ? `got a ${termWord(program.terminology, 1)}` : "earned";
  return `${who} ${what} ${mins} min ago. Add another only for a new visit.`;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
export function firstName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  return n ? (n.split(/\s+/)[0] ?? null) : null;
}

/** "Alex C." */
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  if (parts.length === 1) return parts[0] ?? "Customer";
  return `${parts[0]} ${(parts[parts.length - 1] ?? "").charAt(0).toUpperCase()}.`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase();
}

// ---------------------------------------------------------------------------
// Scans and codes
// ---------------------------------------------------------------------------
/** Redeem codes avoid 0/O/1/I/L. */
export const REDEEM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REDEEM_RE = new RegExp(`^[${REDEEM_ALPHABET}]{4,8}$`);

export type ScanResult =
  | { kind: "member"; memberCode: string }
  | { kind: "redeem"; code: string }
  | { kind: "phone"; digits: string }
  | { kind: "invalid" };

/** Classify a scanned barcode or typed code: member QR "LL:K7QX2M9P", app redeem code "7KQ2XM", or a phone. */
export function classifyScan(raw: string): ScanResult {
  const s = raw.trim();
  const prefix = staffApi.QR_PAYLOAD_PREFIX;
  if (s.toUpperCase().startsWith(prefix)) {
    const code = s.slice(prefix.length).trim().toUpperCase();
    return code.length >= 6 ? { kind: "member", memberCode: code } : { kind: "invalid" };
  }
  const upper = s.toUpperCase().replace(/[\s-]/g, "");
  if (/^\+?[\d\s().-]{10,}$/.test(s)) {
    const digits = sanitizePhoneInput(s);
    if (digits.length === 10) return { kind: "phone", digits };
  }
  if (upper.length === 8 && /^[A-Z0-9]+$/.test(upper)) return { kind: "member", memberCode: upper };
  if (REDEEM_RE.test(upper)) return { kind: "redeem", code: upper };
  return { kind: "invalid" };
}

/** Normalise typed redeem code input: uppercase, strip spaces, drop characters not in the alphabet. */
export function normalizeRedeemInput(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .split("")
    .filter((ch) => REDEEM_ALPHABET.includes(ch))
    .join("")
    .slice(0, 8);
}

/** "K74Q" → "K7 4Q", "7KQ2XM" → "7KQ 2XM" for display. */
export function groupCode(code: string): string {
  if (code.length <= 3) return code;
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

/** Member number grouped in 4s for the card: "K7QX 2M9P". */
export function groupMemberCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1 ");
}

/** Award failures worth queueing for /sync instead of showing an error now. */
export function shouldQueueAward(error: unknown): boolean {
  const e = error as { status?: number; code?: string } | null;
  if (!e || typeof e !== "object") return false;
  return e.status === 0 || (typeof e.status === "number" && e.status >= 500) || e.code === "internal";
}

/** ux-copy err.award.* for final award errors. */
export function awardErrorMessage(error: { code?: string; message?: string }, ctx: { last4?: string; terminology?: string }): string {
  switch (error.code) {
    case "cooldown":
      return "Already added for this visit. Wait a few minutes, or ask a manager to adjust it.";
    case "insufficient_points":
      return `Not enough ${termWord(ctx.terminology)} for that reward yet.`;
    case "conflict":
      return error.message?.toLowerCase().includes("pause") ? "Your program is paused. Ask the owner to resume it." : (error.message ?? "This can't be done right now.");
    case "forbidden":
      return "This member can't earn here. Ask a manager.";
    case "duplicate":
      return `Couldn't add for ...${ctx.last4 ?? ""}: it was already added.`;
    default:
      return error.message ?? "Something went wrong on our end. Try again in a moment.";
  }
}

// ---------------------------------------------------------------------------
// State machine: keypad → lookup → customer panel → success
// ---------------------------------------------------------------------------
export type CounterCustomer =
  | { kind: "member"; member: staffApi.MemberSummaryDto }
  | { kind: "new"; phone: string; digits: string }
  /** Identified while offline: award goes to the queue keyed by phone or member code. */
  | { kind: "offline"; phone?: string; memberCode?: string; label: string };

export type CounterState =
  | { step: "entry"; digits: string; error: string | null }
  /** Scan first: one match, Stamp on scan on, below the goal. The screen awards at once, then dispatches "awarded". */
  | { step: "stamping"; member: staffApi.MemberSummaryDto }
  /** Goal reached: Redeem, or stamp on purpose and keep the reward. */
  | { step: "reward"; member: staffApi.MemberSummaryDto }
  /** Four digits that match nobody. */
  | { step: "nomatch"; digits: string }
  | { step: "lookingUp"; digits: string; query: string }
  | { step: "pick"; digits: string; matches: staffApi.MemberSummaryDto[] }
  | { step: "customer"; customer: CounterCustomer; amountCents: number; noEarn: boolean; error: string | null; submitting: boolean }
  | { step: "success"; view: SuccessView; customer: CounterCustomer; transactionId: string | null; queuedKey: string | null; startedAt: number }
  | { step: "notice"; tone: "neutral" | "danger"; message: string };

export type CounterAction =
  | { type: "key"; key: string }
  | { type: "lookup"; query?: string }
  /** `program` switches on the scan-first rules (auto-stamp, reward ready, no match); without it the older confirm flow applies. */
  | { type: "lookupResult"; res: staffApi.LookupResponse; digits: string; program?: CounterProgram | null }
  | { type: "lookupOffline"; phone?: string; memberCode?: string; label: string }
  | { type: "lookupError"; message: string }
  | { type: "pick"; member: staffApi.MemberSummaryDto; program?: CounterProgram | null }
  | { type: "identified"; customer: CounterCustomer }
  | { type: "toggleNoEarn" }
  | { type: "submit" }
  | { type: "awardError"; message: string }
  | { type: "awarded"; view: SuccessView; customer: CounterCustomer; transactionId: string | null; queuedKey: string | null; at: number }
  | { type: "notice"; tone: "neutral" | "danger"; message: string }
  /** Back to an empty keypad (from a no-match or a cancelled stamp). */
  | { type: "toEntry" }
  | { type: "reset" };

/** The reward is ready: an affordable reward, or a full stamp card. */
export function isRewardReady(m: Pick<staffApi.MemberSummaryDto, "balance" | "rewardsAffordable">, program: Pick<CounterProgram, "earnType" | "stampGoal"> | null | undefined): boolean {
  if (m.rewardsAffordable.length > 0) return true;
  return program?.earnType === "stamps" && !!program.stampGoal && m.balance >= program.stampGoal;
}

/**
 * What the counter does for one identified member (cafes-retail.md 7.2): a ready reward is never stamped blindly;
 * Stamp on scan stamps stamp and visit programs at once; per-dollar programs and "off" ask for one confirm tap.
 */
export function decideMember(m: Pick<staffApi.MemberSummaryDto, "balance" | "rewardsAffordable">, program: Pick<CounterProgram, "earnType" | "stampGoal" | "counterAutoStamp"> | null | undefined): "reward" | "stamp" | "confirm" {
  if (isRewardReady(m, program)) return "reward";
  if (program?.counterAutoStamp && program.earnType !== "per_dollar") return "stamp";
  return "confirm";
}

export const initialCounterState: CounterState = { step: "entry", digits: "", error: null };

export function counterReducer(state: CounterState, action: CounterAction): CounterState {
  switch (action.type) {
    case "reset":
      return initialCounterState;
    case "key": {
      if (state.step === "customer") {
        return { ...state, amountCents: posAmountPress(state.amountCents, action.key), error: null };
      }
      // Any keypad press on the success card returns to the keypad (Undo stays in the recent strip).
      const digits = state.step === "entry" || state.step === "pick" ? state.digits : "";
      let next = digits;
      if (action.key === "clear") next = "";
      else if (action.key === "back") next = digits.slice(0, -1);
      else if (/^\d$/.test(action.key) && digits.length < 10) next = digits + action.key;
      return { step: "entry", digits: next, error: null };
    }
    case "lookup": {
      if (state.step !== "entry" && state.step !== "pick") return state;
      const query = action.query ?? state.digits;
      if (!action.query) {
        if (state.digits.length === 4) return { step: "lookingUp", digits: state.digits, query: state.digits };
        const err = validateNanp(state.digits);
        if (err) return { step: "entry", digits: state.digits, error: "Check the number. It needs 10 digits." };
        return { step: "lookingUp", digits: state.digits, query: toE164(state.digits) ?? state.digits };
      }
      return { step: "lookingUp", digits: state.step === "entry" ? state.digits : "", query };
    }
    case "lookupResult": {
      const { res } = action;
      if (action.program !== undefined) {
        // Scan first: one match decides on its own; two or more show the list; none says so.
        if (res.items.length === 1) {
          const m = res.items[0]!;
          const d = decideMember(m, action.program);
          if (d === "reward") return { step: "reward", member: m };
          if (d === "stamp") return { step: "stamping", member: m };
          return { step: "customer", customer: { kind: "member", member: m }, amountCents: 0, noEarn: false, error: null, submitting: false };
        }
        if (res.items.length > 1) return { step: "pick", digits: action.digits, matches: res.items.slice(0, 5) };
        if (res.normalizedPhone) return { step: "customer", customer: { kind: "new", phone: res.normalizedPhone, digits: action.digits }, amountCents: 0, noEarn: false, error: null, submitting: false };
        if (res.matchedBy === "last4") return { step: "nomatch", digits: action.digits };
        return { step: "notice", tone: "danger", message: "This QR code isn't active. Ask the customer to show their number." };
      }
      if (res.items.length === 1 && res.matchedBy !== "last4") {
        return { step: "customer", customer: { kind: "member", member: res.items[0]! }, amountCents: 0, noEarn: false, error: null, submitting: false };
      }
      if (res.matchedBy === "last4") {
        if (res.items.length === 0) return { step: "entry", digits: action.digits, error: "No members end in those 4 digits." };
        return { step: "pick", digits: action.digits, matches: res.items.slice(0, 5) };
      }
      if (res.normalizedPhone) {
        return { step: "customer", customer: { kind: "new", phone: res.normalizedPhone, digits: action.digits }, amountCents: 0, noEarn: false, error: null, submitting: false };
      }
      return { step: "notice", tone: "danger", message: "This QR code isn't active. Ask the customer to show their number." };
    }
    case "lookupOffline":
      return {
        step: "customer",
        customer: { kind: "offline", phone: action.phone, memberCode: action.memberCode, label: action.label },
        amountCents: 0,
        noEarn: false,
        error: null,
        submitting: false,
      };
    case "lookupError":
      return { step: "entry", digits: state.step === "lookingUp" ? state.digits : "", error: action.message };
    case "toEntry":
      return { step: "entry", digits: "", error: null };
    case "pick": {
      if (action.program !== undefined) {
        const d = decideMember(action.member, action.program);
        if (d === "reward") return { step: "reward", member: action.member };
        if (d === "stamp") return { step: "stamping", member: action.member };
      }
      return { step: "customer", customer: { kind: "member", member: action.member }, amountCents: 0, noEarn: false, error: null, submitting: false };
    }
    case "identified":
      return { step: "customer", customer: action.customer, amountCents: 0, noEarn: false, error: null, submitting: false };
    case "toggleNoEarn":
      return state.step === "customer" ? { ...state, noEarn: !state.noEarn } : state;
    case "submit":
      return state.step === "customer" ? { ...state, submitting: true, error: null } : state;
    case "awardError":
      return state.step === "customer" ? { ...state, submitting: false, error: action.message } : state;
    case "awarded":
      return { step: "success", view: action.view, customer: action.customer, transactionId: action.transactionId, queuedKey: action.queuedKey, startedAt: action.at };
    case "notice":
      return { step: "notice", tone: action.tone, message: action.message };
    default:
      return state;
  }
}

/** Number display for the keypad: "(416) 555-01" or the last-4 digits as typed. */
export function entryDisplay(digits: string): string {
  return formatNanp(digits);
}

/** Request body for /award (online) or a sync event (offline), from the identified customer. */
export function awardRef(customer: CounterCustomer): { phone?: string; memberCode?: string; memberId?: string } {
  if (customer.kind === "member") return { memberId: customer.member.memberId };
  if (customer.kind === "new") return { phone: customer.phone };
  return customer.memberCode ? { memberCode: customer.memberCode } : { phone: customer.phone };
}

// ---------------------------------------------------------------------------
// Scan-first copy (cafes-retail.md 7.2)
// ---------------------------------------------------------------------------
export const AUTO_RETURN_SECONDS = 3;
export const SCAN_UNDO_SECONDS = 10;

/** 1 -> "1st", 5 -> "5th", 12 -> "12th". */
export function ordinal(n: number): string {
  const t = n % 100;
  return `${n}${t >= 11 && t <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
}

/** "5th visit this month". */
export const visitThisMonth = (n: number) => `${ordinal(Math.max(1, n))} visit this month`;

/** "2 more for a free drink", or "Free drink ready". */
export function stampsLeft(left: number, rewardName: string): string {
  const what = /^free /i.test(rewardName) ? `a ${rewardName.toLowerCase()}` : rewardName;
  return left <= 0 ? `${rewardName} ready` : `${left} more for ${what}`;
}

/** "Two members end in 1034". */
export function matchesHeading(n: number, digits: string): string {
  const words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  return `${words[n] ?? n} member${n === 1 ? "" : "s"} end${n === 1 ? "s" : ""} in ${digits}`;
}

/** "in yesterday", "in 2 weeks ago": the second line of a match row. */
export function cameInText(iso: string | null | undefined, now: Date): string {
  if (!iso) return "new member";
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return "in today";
  if (days === 1) return "in yesterday";
  if (days < 14) return `in ${days} days ago`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks ago`;
  return `in ${Math.round(days / 30)} months ago`;
}

/** "(647) ···-1034" from the API's "(647) ***-1034". */
export const maskedRow = (m: string | null | undefined) => (m ?? "").replace(/\*+/g, "···");

/** Carry-over line on the reward screen: "Fatima has 11 stamps. 1 carries over after redeeming." */
export function carryOverLine(name: string | null, balance: number, rewardCost: number, terminology: string): string {
  const who = firstName(name) ?? "They";
  const has = firstName(name) ? "has" : "have";
  const carry = balance - rewardCost;
  return `${who} ${has} ${formatPts(balance, terminology)}. ${carry > 0 ? `${carry} carries over after redeeming.` : "A fresh card starts after redeeming."}`;
}
