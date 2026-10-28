import type { merchantApi } from "@ll/shared";

/**
 * "(416) •••-0123". The API already masks customer phones ("(416) ***-0123"); a full number is only
 * returned by the audit-logged reveal endpoint. Both render the same way here.
 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "No phone";
  if (e164.includes("*")) return e164.replace(/\*/g, "•");
  const d = e164.replace(/\D/g, "").slice(-10);
  if (d.length < 10) return "•••";
  return `(${d.slice(0, 3)}) •••-${d.slice(6)}`;
}

export type ConsentState = "opted_in" | "no_consent" | "muted";

/**
 * Messages column (merchant-dashboard.md §3): Muted wins (the customer silenced the shop),
 * then Opted in (marketing consent, not muted), else No consent. Only "Opted in" gets offers.
 */
export function consentState(c: Pick<merchantApi.CustomerSummary, "marketingConsent" | "muted">): ConsentState {
  if (c.muted) return "muted";
  return c.marketingConsent ? "opted_in" : "no_consent";
}

export const CONSENT_LABEL: Record<ConsentState, string> = { opted_in: "Opted in", no_consent: "Hasn't opted in", muted: "Muted" };

export type CustomerFilter = "all" | "regulars" | "slipping" | "reward" | "new" | "birthday" | "can_text" | "vip" | "at_risk" | "opted_in" | "muted";

/** `?segment=` on the Customers URL (Home links to it) to the chip it selects. */
export function filterFromSegment(segment: string | null | undefined): CustomerFilter {
  const map: Record<string, CustomerFilter> = { regulars: "regulars", slipping: "slipping", reward: "reward", new: "new", birthday: "birthday", texts: "can_text", can_text: "can_text" };
  return (segment && map[segment]) || "all";
}

/** API query for a filter chip (all filters run server-side, so `total` is exact). `now` is injectable for tests. */
export function filterQuery(f: CustomerFilter, now: number = Date.now()): { query: Record<string, string | number> } {
  switch (f) {
    case "regulars":
      return { query: { segment: "regulars" } };
    case "slipping":
      return { query: { segment: "slipping" } };
    case "birthday":
      return { query: { segment: "birthday_month" } };
    case "can_text":
      return { query: { segment: "can_text" } };
    case "reward":
      return { query: { rewardAvailable: "true" } };
    case "vip":
      return { query: { vip: "true" } };
    case "at_risk":
      return { query: { lapsedDays: 60 } };
    case "new":
      // "New this month": since the 1st (Toronto), matching the chip count.
      return { query: { sort: "joined", joinedAfter: startOfMonthToronto(now) } };
    case "opted_in":
      return { query: { consent: "opted_in" } };
    case "muted":
      return { query: { muted: "true" } };
    default:
      return { query: {} };
  }
}

/** ISO instant of the first of this month at 00:00 Toronto time. */
export function startOfMonthToronto(now: number = Date.now()): string {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number) as [number, number];
  // Toronto is UTC-5 or UTC-4: try both offsets and take the one whose local midnight is the 1st.
  for (const off of [4, 5]) {
    const t = Date.UTC(y, m - 1, 1, off);
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(t);
    if (local.startsWith(`${y}-${String(m).padStart(2, "0")}-01`) && local.endsWith("00")) return new Date(t).toISOString();
  }
  return new Date(Date.UTC(y, m - 1, 1, 5)).toISOString();
}

/** "13 / 10" reads as a mistake: with more than one reward earned it is "1 reward + 3" (stamps past the goal). */
export function stampProgress(balance: number, goal: number): string {
  if (goal > 0 && balance >= goal * 2) return `${Math.floor(balance / goal)} rewards + ${balance % goal}`;
  if (goal > 0 && balance > goal) return `1 reward + ${balance - goal}`;
  return `${balance} / ${goal}`;
}

/** "Weekdays 8 am" is shown as is; the panel says "Weekdays around 8 am". */
export const usuallyAround = (usually: string | null | undefined) => (usually ? (usually.includes(" to ") ? usually : usually.replace(/^(Weekdays|Weekends) /, "$1 around ")) : null);
