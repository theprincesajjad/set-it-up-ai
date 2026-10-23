/**
 * Facts about other companies that the marketing site quotes, each with the date it was read and the page it came
 * from. Nothing here is an estimate: a number we only saw in a search summary is not allowed in this file. A unit test
 * (test/marketing-sources.test.ts) fails when any `asOf` is more than 90 days old, which forces a re-read before the
 * claim stays on the page.
 */
export interface Sourced {
  /** Day the page was read, YYYY-MM-DD. */
  asOf: string;
  sourceUrl: string;
}

/** DoorDash Canada merchant pricing, read on the vendor's own page. Pickup is 8% on Plus and Premier and 10% on Basic; delivery is up to 29% on Premier. */
export const DOORDASH_CANADA = {
  asOf: "2026-10-23",
  sourceUrl: "https://merchants.doordash.com/en-ca",
  /** Basis points of the order subtotal. */
  pickupBps: { plusPremier: 800, basic: 1000 },
  deliveryUpToBps: 2900,
} as const satisfies Sourced & Record<string, unknown>;

export interface Competitor extends Sourced {
  id: "sopoints-free" | "square-loyalty";
  name: string;
  /** Short host shown beside the date, e.g. "sopoints.com". */
  host: string;
  monthlyFee: string;
  locations: string;
  /** What the vendor charges on sales that go through the loyalty program. */
  salesFee: string;
  /** Prices in a currency other than CAD say so here. */
  currencyNote?: string;
}

/** Competitors named on the landing page. Public pricing pages only, read on `asOf`. */
export const COMPETITORS: readonly Competitor[] = [
  {
    id: "sopoints-free",
    name: "SoPoints Free",
    host: "sopoints.com",
    sourceUrl: "https://sopoints.com/",
    asOf: "2026-10-23",
    monthlyFee: "US$0",
    locations: "1",
    salesFee: "5%",
    currencyNote: "SoPoints prices are in USD.",
  },
  {
    id: "square-loyalty",
    name: "Square Loyalty",
    host: "squareup.com/ca",
    sourceUrl: "https://squareup.com/ca/en/software/loyalty",
    asOf: "2026-10-23",
    monthlyFee: "from CA$60 per location",
    locations: "Per location",
    salesFee: "None listed",
  },
];

/** Whole days between an `asOf` date and `now`. */
export function ageInDays(asOf: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(`${asOf}T00:00:00Z`).getTime()) / 86_400_000);
}

/** Longest a sourced fact may go without being re-read. */
export const MAX_SOURCE_AGE_DAYS = 90;

/** "Oct 23, 2026" */
export function formatAsOf(asOf: string): string {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${asOf}T00:00:00Z`));
}
