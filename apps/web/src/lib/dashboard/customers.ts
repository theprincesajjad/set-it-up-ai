import type { merchantApi } from "@ll/shared";

/** "(416) •••-0123" — phones are masked in lists until revealed. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "No phone";
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

/** API query for a filter chip; `client` filters are applied to loaded rows (no server filter yet). */
export function filterQuery(f: CustomerFilter): { query: Record<string, string | number>; client?: (c: merchantApi.CustomerSummary) => boolean } {
  switch (f) {
    case "reward":
      return { query: { rewardAvailable: "true" } };
    case "vip":
      return { query: { vip: "true" } };
    case "at_risk":
      return { query: { lapsedDays: 60 } };
    case "new":
      return { query: { sort: "joined" }, client: (c) => Date.now() - new Date(c.joinedAt).getTime() < 30 * 86_400_000 };
    case "opted_in":
      return { query: {}, client: (c) => consentState(c) === "opted_in" };
    case "muted":
      return { query: {}, client: (c) => c.muted };
    default:
      return { query: {} };
  }
}
