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

export const CONSENT_LABEL: Record<ConsentState, string> = { opted_in: "Opted in", no_consent: "No consent", muted: "Muted" };

export type CustomerFilter = "all" | "reward" | "vip" | "new" | "at_risk" | "opted_in" | "muted";

/** API query for a filter chip (all filters run server-side, so `total` is exact). `now` is injectable for tests. */
export function filterQuery(f: CustomerFilter, now: number = Date.now()): { query: Record<string, string | number> } {
  switch (f) {
    case "reward":
      return { query: { rewardAvailable: "true" } };
    case "vip":
      return { query: { vip: "true" } };
    case "at_risk":
      return { query: { lapsedDays: 60 } };
    case "new":
      return { query: { sort: "joined", joinedAfter: new Date(now - 30 * 86_400_000).toISOString() } };
    case "opted_in":
      return { query: { consent: "opted_in" } };
    case "muted":
      return { query: { muted: "true" } };
    default:
      return { query: {} };
  }
}
