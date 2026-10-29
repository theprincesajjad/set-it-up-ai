/**
 * Everything one solo landing variant shows, worked out on the server from copy.solo (en-CA), the trade data in solo.ts and the
 * plan numbers in @ll/shared (PLANS, FEES): prices and fees are never typed into the page. English only, like the rest of the
 * marketing copy; the page renders it statically.
 */
import { FEES, PLANS, PROMOS_PER_MONTH_PLUS } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { landingVariant } from "./landing-variants";
import { fill, moneyShort } from "./text";
import { SAMPLE_SERVICES, SHOWN_SERVICES, SOLO_PAGES, SOLO_PHOTOS, soloKey, soloVertical, type NailTrade, type SoloKey, type SoloPageId } from "./solo";

const C = copy.solo;

export interface SoloServiceView {
  name: string;
  minutes: string;
  price: string;
  cents: number;
}

/** The visit the sample pass is on, and the stamp that fills in. */
const STAMP_GOAL: Record<SoloKey, number> = { nails: 5, brows: 5, lashes: 5, makeup: 5, barber: 8, groom: 6 };

/** `variant`: a LANDING_VARIANTS id for an A/B test; "control" (the default) otherwise. */
export function soloView(id: SoloPageId, trade: NailTrade = "nails", variant?: string) {
  const key = soloKey(id, trade);
  const T = C.trades[key];
  const page = SOLO_PAGES[id];
  const vertical = soloVertical(id, trade);
  const V = landingVariant(key, variant);
  const services: SoloServiceView[] = SHOWN_SERVICES[key].map((i) => {
    const s = SAMPLE_SERVICES[key][i]!;
    return { name: s.name.replace(/ \((small|large) dog\)$/, ""), minutes: `${s.minutes} min`, price: `${s.from ? "from " : ""}${moneyShort(s.priceCents)}`, cents: s.priceCents };
  });
  const booked = services[1]!;
  const plus = PLANS.plus;
  const vars = {
    pro: plus.name,
    client: T.client,
    service: booked.name,
    free: moneyShort(0),
    monthly: moneyShort(plus.priceCents),
    promos: PROMOS_PER_MONTH_PLUS,
    texts: plus.smsPerMonth.toLocaleString("en-CA"),
    months: Math.round(plus.annualPriceCents / plus.priceCents),
    fee: String(FEES.depositInvoiceBps / 100),
  };
  const f = (s: string) => fill(s, vars);
  const goal = STAMP_GOAL[key];
  const facts = C.facts.items.map((x) => ({ value: f(x.value), line: f(x.line) }));
  if (id === "barber") facts[3] = { ...C.facts.barberLast };
  return {
    id,
    key,
    vertical,
    src: page.src,
    /** The full sign-up page with this page's trade preset (the short form also leads there). */
    signupHref: `/signup?vertical=${vertical}&src=${page.src}`,
    photos: SOLO_PHOTOS[key],
    trade: T,
    services,
    booked,
    goal,
    variant: V.id,
    hero: {
      eyebrow: V.eyebrow,
      hook: V.hook,
      lede: f(V.lede),
      cta: V.cta,
      trust: "trust" in T ? T.trust : C.hero.trust,
      price: f(C.hero.price),
      booked: f(C.hero.booked),
      bookedCard: C.hero.bookedCard,
      bookedCardLine: f(C.hero.bookedCardLine),
    },
    facts,
    /** The three job cards in the variant's order. */
    jobs: V.jobs.map((j) => ({ id: j, title: f(T.jobs[j].title), body: f(T.jobs[j].body) })),
    notes: T.notes.map(f),
    dmAfter: f(C.dm.after),
    card: fill(C.regulars.card, { client: T.client, have: goal - 1, goal }),
    promoSub: f(C.regulars.promoSub),
    price: {
      title: f(C.price.title),
      plans: [
        { key: "free", name: f(C.price.free.name), price: moneyShort(0), per: "", what: f(C.price.free.what) },
        { key: "monthly", name: f(C.price.monthly.name), price: moneyShort(plus.priceCents), per: C.price.monthly.per, what: f(C.price.monthly.what) },
        { key: "yearly", name: f(C.price.yearly.name), price: moneyShort(plus.annualPriceCents), per: C.price.yearly.per, what: f(C.price.yearly.what) },
      ],
      note: f(C.price.note),
    },
  };
}

export type SoloView = ReturnType<typeof soloView>;
