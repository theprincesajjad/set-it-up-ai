/**
 * THE single source for how the marketing pages describe the plans. Pro is being repackaged: when the new packaging lands, edit
 * `PLAN_COPY` below (the words) and `PLANS` / `PROMOS_PER_MONTH_PLUS` in packages/shared/src/plans.ts (the numbers), and every
 * marketing surface follows: the price cards on the home page and on the solo landing pages (nail, brow, lash, makeup, barber,
 * groomer), the price line under each hero, the "with Pro" line in the promo demo and the start-form fine print.
 * No page may type a plan name, a price or a Pro feature itself; read `marketingPlans()` or `planLine()` instead.
 * Placeholders: {free} {monthly} {yearly} {pro} {promos} {texts} {paid} are filled from PLANS here, never in the page.
 */
import { ANNUAL_INCLUDES_WEBSITE, PLANS, PROMOS_PER_MONTH_PLUS } from "@ll/shared";
import { fill, moneyShort } from "./text";

/** Who the page speaks to: a shop running loyalty (home) or a solo pro taking bookings (nail, barber, groomer pages). */
export type PlanAudience = "shop" | "solo";

export const PLAN_COPY = {
  /** The line under each hero's buttons. */
  priceLine: "{free} to start. {pro} is {monthly} a month.",
  /** Promo demo: how many promos a paid plan sends. */
  promoAllowance: "{promos} promos a month with {pro}",
  /** Under the price cards. */
  noteSolo: "Prices in CAD. No commission on your clients. Cancel any time.",
  noteShop: "Prices in CAD. No fee on loyalty. No contract.",
  perMonth: "/month",
  free: {
    tagline: { solo: "Everything you need to take bookings.", shop: "A complete loyalty program, free forever." },
    features: {
      solo: ["Your own booking page and link", "Calendar for every booking", "Automatic reminders", "Client list and stamp card"],
      shop: ["Digital stamp card or points", "Apple Wallet and Google Wallet card", "Customer list and weekly reports", "Unlimited staff and locations"],
    },
    cta: "Start free",
  },
  pro: {
    tagline: { solo: "Bring clients back more often.", shop: "Bring customers back more often." },
    features: {
      solo: ["{promos} promos a month to your regulars", "{texts} reminder and promo texts a month", "Rebooking nudges and VIP levels", "Unlimited calendars"],
      shop: ["{promos} promos a month to your regulars", "Email and text campaigns", "Rebooking nudges and VIP levels", "POS auto-award and customer exports"],
    },
    /** Shown under the Pro price. */
    yearly: "or {yearly} a year: 12 months for the price of {paid}",
    yearlyWebsite: "Yearly plans include your own website.",
    cta: "Start free, upgrade any time",
    badge: "Most popular",
  },
} as const;

/** The numbers every placeholder above reads, from PLANS. */
export function planVars(): Record<string, string | number> {
  const p = PLANS.plus;
  return {
    pro: p.name,
    free: moneyShort(PLANS.free.priceCents),
    monthly: moneyShort(p.priceCents),
    yearly: moneyShort(p.annualPriceCents),
    promos: PROMOS_PER_MONTH_PLUS,
    texts: p.smsPerMonth.toLocaleString("en-CA"),
    paid: Math.round(p.annualPriceCents / p.priceCents),
  };
}

/** One PLAN_COPY line, filled. */
export function planLine(key: "priceLine" | "promoAllowance" | "noteSolo" | "noteShop"): string {
  return fill(PLAN_COPY[key], planVars());
}

export interface MarketingPlan {
  /** `monthly` is the paid plan (kept for the e2e hooks and the beacon's #plans links). */
  key: "free" | "monthly";
  name: string;
  price: string;
  per: string;
  tagline: string;
  features: string[];
  cta: string;
  /** The paid plan only: its yearly price line, and the yearly price on its own (for `[data-plan=yearly]`). */
  yearly?: { line: string; price: string; extra?: string };
  badge?: string;
}

/** The two plan cards, words from PLAN_COPY and numbers from PLANS. */
export function marketingPlans(audience: PlanAudience): MarketingPlan[] {
  const v = planVars();
  const f = (s: string) => fill(s, v);
  const C = PLAN_COPY;
  return [
    { key: "free", name: PLANS.free.name, price: String(v.free), per: "", tagline: C.free.tagline[audience], features: C.free.features[audience].map(f), cta: C.free.cta },
    {
      key: "monthly",
      name: PLANS.plus.name,
      price: String(v.monthly),
      per: C.perMonth,
      tagline: C.pro.tagline[audience],
      features: C.pro.features[audience].map(f),
      cta: C.pro.cta,
      yearly: { line: f(C.pro.yearly), price: String(v.yearly), extra: ANNUAL_INCLUDES_WEBSITE ? C.pro.yearlyWebsite : undefined },
      badge: C.pro.badge,
    },
  ];
}
