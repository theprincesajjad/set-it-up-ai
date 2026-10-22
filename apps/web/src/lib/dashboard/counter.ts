/** Web counter (staff-counter.md, staff.md): keypad money entry, lookup hints, award labels. */
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
}

/** Estimated earn for the button label; the server's breakdown is the truth. */
export function estimateEarn(p: ProgramForCounter, amountCents: number): number {
  if (p.earnType === "per_dollar") return Math.floor((amountCents / 100) * p.pointsPerDollar);
  return p.pointsPerVisit;
}

/** `quantity` (stamp / visit programs): +1/+2/+3 chips award quantity × pointsPerVisit in one tap. */
export function awardLabel(p: ProgramForCounter, amountCents: number, quantity = 1): string {
  const n = p.pointsPerVisit * Math.max(1, quantity);
  if (p.earnType === "stamps") return n > 1 ? `Add ${n} stamps` : "Add 1 stamp";
  if (p.earnType === "per_visit") return quantity > 1 ? `Add ${quantity} visits (+${n} pts)` : `Add visit (+${n} pts)`;
  return `Award ${estimateEarn(p, amountCents)} pts`;
}

export function awardSuccess(p: ProgramForCounter, pointsEarned: number): string {
  if (p.earnType === "stamps") return `Added ${pointsEarned} stamp${pointsEarned === 1 ? "" : "s"}`;
  return `Awarded ${pointsEarned} ${p.terminology === "points" ? "pts" : p.terminology}`;
}

/**
 * Counter errors in plain words (polish-audit D11): what happened and what to do, one sentence.
 * `code` is the API error code; `message` the API's own text (used only when it is already human).
 */
export function counterErrorMessage(e: { code?: string; status?: number; message?: string; isNetwork?: boolean }, ctx: { terminology?: string | null; firstName?: string | null } = {}): string {
  const word = (ctx.terminology || "points").toLowerCase();
  const who = ctx.firstName || "They";
  if (e.isNetwork || e.status === 0) return "No connection. The award is saved here and sends when you're back online.";
  switch (e.code) {
    case "cooldown":
      return `${who} already got ${word} for this visit. Wait a few minutes, or adjust it from the customer's page.`;
    case "insufficient_points":
      return `Not enough ${word} for that reward yet.`;
    case "expired":
    case "code_expired":
      return "This code expired. Their points went back. Ask them to tap Redeem again.";
    case "already_used":
      return "This code was already used. Ask the customer to check their app.";
    case "void":
      return "This code was cancelled. Ask the customer to tap Redeem again.";
    case "not_found":
      return "No reward code like that at this shop. Check the letters, or ask them to tap Redeem again.";
    case "program_paused":
      return "Your program is paused. Resume it in Program & rewards to award again.";
    default:
      if (e.status === 404) return "No reward code like that at this shop. Check the letters, or ask them to tap Redeem again.";
      if (e.status === 409 && e.message) return e.message;
      if (e.status && e.status >= 500) return "Something went wrong on our end. Try again in a moment.";
      return e.message || "That didn't work. Try again.";
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
export function undoLabel(secondsLeft: number): string {
  return `Undo · ${Math.max(0, secondsLeft)}s`;
}
