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
}

/** Estimated earn for the button label; the server's breakdown is the truth. */
export function estimateEarn(p: ProgramForCounter, amountCents: number): number {
  if (p.earnType === "per_dollar") return Math.floor((amountCents / 100) * p.pointsPerDollar);
  return p.pointsPerVisit;
}

export function awardLabel(p: ProgramForCounter, amountCents: number): string {
  if (p.earnType === "stamps") return p.pointsPerVisit > 1 ? `Add ${p.pointsPerVisit} stamps` : "Add stamp";
  if (p.earnType === "per_visit") return `Add visit (+${p.pointsPerVisit} pts)`;
  return `Award ${estimateEarn(p, amountCents)} pts`;
}

export function awardSuccess(p: ProgramForCounter, pointsEarned: number): string {
  if (p.earnType === "stamps") return `Added ${pointsEarned} stamp${pointsEarned === 1 ? "" : "s"}`;
  return `Awarded ${pointsEarned} ${p.terminology === "points" ? "pts" : p.terminology}`;
}
