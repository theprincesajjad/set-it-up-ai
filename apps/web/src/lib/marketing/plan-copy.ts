/**
 * THE single source for how the marketing pages describe the plans (founder packaging, Oct 29: Free, Pro for one person, Studio for
 * teams, a 14-day Pro trial with no card, Pro's first-year price on annual). Edit the words in `PLAN_COPY` and the marketing numbers in
 * `PLAN_MARKETING` below; plan names and list prices come from `PLANS` in packages/shared/src/plans.ts (`plus` is Pro, `studio` is Studio).
 * Every marketing surface follows: the plan cards on the home page and on the solo landing pages (nail, brow, lash, makeup, barber,
 * groomer), the price line under each hero, the trial button labels, the "with Pro" line in the promo demo, the Pro feature section on
 * the solo pages and the barber page's per-chair variant.
 * No page may type a plan name, a price or a paid feature itself: read `marketingPlans()`, `planLine()`, `proHighlights()` or `planVars()`.
 * Never call the first-year price "founding". Dollar outcomes are illustrative, never promised.
 * Placeholders: {free} {pro} {monthly} {yearly} {firstYear} {studio} {studioMonthly} {studioYearly} {trial} {promos}.
 */
import * as Shared from "@ll/shared";
import { ANNUAL_INCLUDES_WEBSITE, PLANS, PROMOS_PER_MONTH_PLUS, type Plan } from "@ll/shared";
import { fill, moneyShort } from "./text";

/**
 * Billing constants the Pro workstream adds to plans.ts (TRIAL_DAYS, FIRST_YEAR_PRICE, the `studio` plan), read when present so this
 * file compiles on either side of that change; the fallbacks are the founder's numbers (Oct 29).
 */
const S = Shared as unknown as { TRIAL_DAYS?: number; FIRST_YEAR_PRICE?: { enabled: boolean; priceCents: number } };
const STUDIO: Plan = (PLANS as Record<string, Plan>)["studio"] ?? PLANS.pro;

/** Who the page speaks to: a shop running loyalty (home) or a solo pro taking bookings (nail, barber, groomer pages). */
export type PlanAudience = "shop" | "solo";

/** Marketing numbers that are not list prices, from plans.ts. */
export const PLAN_MARKETING = {
  /** Every new shop gets this many days of Pro, no card needed. */
  trialDays: S.TRIAL_DAYS ?? 14,
  /** Pro's price for the first year on annual billing (then the list annual price); null when the offer is off. */
  proFirstYearCents: S.FIRST_YEAR_PRICE ? (S.FIRST_YEAR_PRICE.enabled ? S.FIRST_YEAR_PRICE.priceCents : null) : 19900,
};

export const PLAN_COPY = {
  /** The line under each hero's buttons. */
  priceLine: "Free to start, with {trial} days of {pro} included. No credit card.",
  /** The trial as a button label. */
  trialCta: "Start free, with {trial} days of {pro}",
  /** Promo demo: how many promos a paid plan sends. */
  promoAllowance: "{promos} promos a month with {pro}",
  /** Under the plan cards. */
  noteSolo: "Prices in CAD. No commission on your clients. Cancel any time.",
  noteShop: "Prices in CAD. No fee on loyalty. Cancel any time.",
  website: "Yearly {pro} and {studio} plans include your own website.",
  perMonth: "/month",
  free: {
    tagline: { solo: "Everything you need to take bookings.", shop: "A complete loyalty program, free forever." },
    features: {
      solo: ["Your own booking page and link", "Calendar for every booking", "Automatic reminders", "Client list and stamp card"],
      shop: ["Digital stamp card or points", "Apple Wallet and Google Wallet card", "Customer list and reports", "Unlimited staff and locations"],
    },
    cta: "Start free",
  },
  pro: {
    tagline: { solo: "For one person who wants a fuller week.", shop: "For owners who want customers back sooner." },
    features: {
      solo: ["A waitlist that fills cancelled slots", "Automatic rebooking and win-back", "Google review requests after every visit", "A weekly money report with a goal", "Add-ons at booking", "{promos} promos a month", "No “Powered by” badge"],
      shop: ["{promos} promos a month to your regulars", "Automatic win-back for quiet regulars", "Google review requests after every visit", "A weekly report with a goal and your best day", "No “Powered by” badge"],
    },
    yearly: "or {yearly} a year",
    /** With the first-year price: "or ~~$290~~ $199 first year, billed yearly". */
    or: "or",
    firstYear: "first year, billed yearly",
    badge: "Most popular",
    cta: "Start your {trial}-day trial",
  },
  studio: {
    tagline: { solo: "For teams and shops with chairs.", shop: "For teams with more than one person." },
    features: {
      solo: ["Everything in {pro}", "Unlimited chairs and team members", "Payouts for your team", "Tools at the till"],
      shop: ["Everything in {pro}", "Unlimited team members", "Payouts for your team", "Tools at the till"],
    },
    yearly: "or {studioYearly} a year",
    cta: "Start free",
  },
  /**
   * The solo pages' Pro section: the money features, each with an illustrative sample (the caption says so). Names and numbers in the
   * samples are made up; nothing here promises an amount.
   */
  highlights: {
    title: "Earn more from the week you already have.",
    sub: "{pro} adds the tools that fill gaps and bring clients back.",
    caption: "Illustrative examples, not a promise of earnings.",
    items: [
      { id: "waitlist", title: "A waitlist that fills cancellations.", body: "When someone cancels, the next client on the list is offered the slot.", sample: "Sat 1:00 pm cancelled", sampleLine: "Offered to the waitlist · filled" },
      { id: "rebook", title: "Rebooking that runs itself.", body: "Clients get a reminder when they are due, and a win-back if they go quiet.", sample: "Due for a fill", sampleLine: "Rebooking reminder sent · booked" },
      { id: "reviews", title: "More Google reviews.", body: "A review request goes out after every visit, so happy clients say so.", sample: "How was your visit?", sampleLine: "Review request sent after the visit" },
      { id: "report", title: "Your week in dollars.", body: "A weekly report with your total, your goal and your best day.", sample: "$1,240 of $1,500 goal", sampleLine: "Best day: Saturday" },
    ],
    cta: "Start your {trial}-day trial",
  },
} as const;

/** The numbers every placeholder above reads: list prices from PLANS, the trial and first-year price from PLAN_MARKETING. */
export function planVars(): Record<string, string | number> {
  const pro = PLANS.plus;
  const studio = STUDIO;
  return {
    pro: pro.name,
    free: moneyShort(PLANS.free.priceCents),
    monthly: moneyShort(pro.priceCents),
    yearly: moneyShort(pro.annualPriceCents),
    firstYear: moneyShort(PLAN_MARKETING.proFirstYearCents ?? pro.annualPriceCents),
    studio: studio.name,
    studioMonthly: moneyShort(studio.priceCents),
    studioYearly: moneyShort(studio.annualPriceCents),
    trial: PLAN_MARKETING.trialDays,
    promos: PROMOS_PER_MONTH_PLUS,
  };
}

/** One PLAN_COPY line, filled. */
export function planLine(key: "priceLine" | "trialCta" | "promoAllowance" | "noteSolo" | "noteShop" | "website"): string {
  return fill(PLAN_COPY[key], planVars());
}

export interface MarketingPlan {
  /** `free`, `monthly` (Pro: kept as the e2e and beacon hook) or `studio`. */
  key: "free" | "monthly" | "studio";
  name: string;
  price: string;
  per: string;
  tagline: string;
  features: string[];
  cta: string;
  /** The yearly price: a line, and for Pro the struck list price and the first-year price. */
  yearly?: { line: string; or?: string; was?: string; now?: string; label?: string };
  badge?: string;
}

/** The three plan cards, words from PLAN_COPY and numbers from PLANS / PLAN_MARKETING. */
export function marketingPlans(audience: PlanAudience): MarketingPlan[] {
  const v = planVars();
  const f = (s: string) => fill(s, v);
  const C = PLAN_COPY;
  const firstYearDeal = PLAN_MARKETING.proFirstYearCents !== null && PLAN_MARKETING.proFirstYearCents < PLANS.plus.annualPriceCents;
  return [
    { key: "free", name: PLANS.free.name, price: String(v.free), per: "", tagline: C.free.tagline[audience], features: C.free.features[audience].map(f), cta: f(C.free.cta) },
    {
      key: "monthly",
      name: PLANS.plus.name,
      price: String(v.monthly),
      per: C.perMonth,
      tagline: C.pro.tagline[audience],
      features: C.pro.features[audience].map(f),
      cta: f(C.pro.cta),
      yearly: firstYearDeal ? { line: f(C.pro.yearly), or: C.pro.or, was: String(v.yearly), now: String(v.firstYear), label: C.pro.firstYear } : { line: f(C.pro.yearly) },
      badge: C.pro.badge,
    },
    { key: "studio", name: STUDIO.name, price: String(v.studioMonthly), per: C.perMonth, tagline: C.studio.tagline[audience], features: C.studio.features[audience].map(f), cta: f(C.studio.cta), yearly: { line: f(C.studio.yearly) } },
  ];
}

/** The note under the cards: the audience's line, plus the website line when annual plans include one. */
export function planNote(audience: PlanAudience): string {
  return [planLine(audience === "solo" ? "noteSolo" : "noteShop"), ANNUAL_INCLUDES_WEBSITE ? planLine("website") : ""].filter(Boolean).join(" ");
}

/** The solo pages' Pro section, filled. */
export function proHighlights() {
  const v = planVars();
  const H = PLAN_COPY.highlights;
  return { title: H.title, sub: fill(H.sub, v), caption: H.caption, cta: fill(H.cta, v), items: H.items.map((x) => ({ ...x })) };
}
