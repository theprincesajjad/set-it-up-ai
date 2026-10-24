import { distanceMetres } from "./points.js";
/**
 * Launch plan and unit costs that the founder's console measures itself against.
 * Source: docs/finance/launch-plan-economics.md (Part A, founder's plan) and
 * docs/finance/unit-economics.md. Every number here is an assumption from those
 * documents, not a measurement; the admin console compares real data with them.
 */

export const LAUNCH_PLAN = {
  /** Month 1 of the plan (first day). */
  startsOn: "2026-11-01",
  /** Cumulative shops on the network at the end of month 1, 2 and 3 (400 by month 3). */
  cumulativeShops: [109, 248, 400] as const,
  /** Areas opened per month. */
  areasPerMonth: 5,
  /** Storefronts that repeat-visit and join, per area (the founder's ~30). */
  shopsPerArea: 30,
  /** Activation goal: share of shops that reach the activation threshold. */
  activationGoal: 0.6,
} as const;

/** Per-unit cost assumptions in cents (CAD). */
export const UNIT_COSTS = {
  /** SMS segment (~$0.0083 Twilio base + carrier fees, converted; model uses $0.022). */
  smsSegmentCents: 2.2,
  /** WhatsApp business-initiated message, estimate from third-party rate cards (about US$0.0034 utility). */
  whatsappMessageCents: 0.5,
  /** Hosting and database per shop per month ($0.60). */
  infraPerShopCents: 60,
} as const;

/** Days after signing a shop should have reached its first customers; used for the "stalled setup" flag. */
export const AT_RISK = {
  /** Signed this many days ago with no member who visited. */
  noVisitAfterDays: 7,
  /** Under the activation target this many days after signing. */
  notActivatedAfterDays: 21,
  /** An active shop with no visit for this many days. */
  quietDays: 14,
} as const;

const monthStart = (y: number, m: number) => Date.UTC(y, m, 1);

/** Which plan month (1-based) a date is in, or 0 before the plan starts. */
export function planMonth(now: Date, startsOn: string = LAUNCH_PLAN.startsOn): number {
  const [y, m] = startsOn.split("-").map(Number) as [number, number];
  const months = (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() - (m - 1)) + 1;
  return months < 1 ? 0 : months;
}

export interface PlanPace {
  /** 0 = before the plan starts, otherwise the plan month (capped at the last planned month). */
  month: number;
  /** Shops the plan expects by the end of this month. */
  plannedEndOfMonth: number;
  /** Shops the plan expects by today (straight line inside the month). */
  plannedToday: number;
  /** Real shops (not closed) on the network. */
  actual: number;
  /** actual - plannedToday (negative = behind). */
  delta: number;
}

/** Straight-line pace through each plan month. */
export function planPace(now: Date, actual: number, startsOn: string = LAUNCH_PLAN.startsOn): PlanPace {
  const raw = planMonth(now, startsOn);
  const last = LAUNCH_PLAN.cumulativeShops.length;
  if (raw === 0) return { month: 0, plannedEndOfMonth: 0, plannedToday: 0, actual, delta: actual };
  const month = Math.min(raw, last);
  const end = LAUNCH_PLAN.cumulativeShops[month - 1]!;
  const before = month === 1 ? 0 : LAUNCH_PLAN.cumulativeShops[month - 2]!;
  if (raw > last) return { month, plannedEndOfMonth: end, plannedToday: end, actual, delta: actual - end };
  const [y, m] = startsOn.split("-").map(Number) as [number, number];
  const from = monthStart(y, m - 1 + (month - 1));
  const to = monthStart(y, m - 1 + month);
  const share = Math.min(1, Math.max(0, (now.getTime() - from) / (to - from)));
  const plannedToday = Math.round(before + (end - before) * share);
  return { month, plannedEndOfMonth: end, plannedToday, actual, delta: actual - plannedToday };
}

/** Estimated cost in cents of a shop's messaging in a month. */
export function messagingCostCents(smsSegments: number, whatsappMessages: number): number {
  return Math.round(smsSegments * UNIT_COSTS.smsSegmentCents + whatsappMessages * UNIT_COSTS.whatsappMessageCents);
}

// ---------------------------------------------------------------------------
// Street-day route: the order one person walks ~30 shops
// ---------------------------------------------------------------------------
export interface RouteStop {
  id: string;
  address: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** "1432 Gerrard St E" -> { n: 1432, street: "gerrard st e" }; no number -> n null. */
export function parseStreetAddress(address: string | null): { n: number | null; street: string } {
  const a = (address ?? "").trim().toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ");
  const m = a.match(/^(?:unit\s+\w+\s+)?(?:\w+-)?(\d+)\s*[a-z]?\s+(.+)$/);
  if (!m) return { n: null, street: a };
  return { n: Number(m[1]), street: m[2]!.replace(/\b(street)\b/g, "st").replace(/\b(avenue)\b/g, "ave").replace(/\b(road)\b/g, "rd").replace(/\b(east)\b/g, "e").replace(/\b(west)\b/g, "w") };
}

/**
 * Order stops for a walking street day.
 * - When at least 80% of stops have a pin: nearest neighbour from `start` (or the first stop alphabetically by address).
 * - Otherwise by address: per street, odd numbers ascending (one side up), then even numbers descending (back down the other side).
 * Stops without a street number go last. The function is pure and stable for equal keys (input order breaks ties).
 */
export function orderStreetDay<T extends RouteStop>(stops: T[], opts: { start?: { lat: number; lng: number } | null } = {}): T[] {
  const pinned = stops.filter((s) => s.lat != null && s.lng != null);
  if (stops.length > 1 && pinned.length / stops.length >= 0.8) {
    const left = [...stops];
    const out: T[] = [];
    let cur: { lat: number; lng: number } | null = opts.start ?? null;
    if (!cur) {
      const first = [...pinned].sort((a, b) => (a.address ?? "").localeCompare(b.address ?? ""))[0]!;
      out.push(first);
      left.splice(left.indexOf(first), 1);
      cur = { lat: first.lat!, lng: first.lng! };
    }
    while (left.length) {
      let best = 0;
      let bestD = Infinity;
      left.forEach((s, i) => {
        const d = s.lat != null && s.lng != null ? distanceMetres(cur!, { lat: s.lat, lng: s.lng }) : Infinity - 1;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const [next] = left.splice(best, 1);
      out.push(next!);
      if (next!.lat != null && next!.lng != null) cur = { lat: next!.lat, lng: next!.lng };
    }
    return out;
  }
  const parsed = stops.map((s, i) => ({ s, i, ...parseStreetAddress(s.address) }));
  const streets = [...new Set(parsed.filter((p) => p.n !== null).map((p) => p.street))].sort();
  const out: T[] = [];
  for (const street of streets) {
    const on = parsed.filter((p) => p.street === street && p.n !== null);
    const odd = on.filter((p) => p.n! % 2 === 1).sort((a, b) => a.n! - b.n! || a.i - b.i);
    const even = on.filter((p) => p.n! % 2 === 0).sort((a, b) => b.n! - a.n! || a.i - b.i);
    out.push(...odd.map((p) => p.s), ...even.map((p) => p.s));
  }
  out.push(...parsed.filter((p) => p.n === null).map((p) => p.s));
  return out;
}
