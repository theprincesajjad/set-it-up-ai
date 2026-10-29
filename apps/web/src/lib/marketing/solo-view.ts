/**
 * Everything one solo landing variant shows, worked out on the server from copy.solo (en-CA), the trade data in solo.ts and the
 * plan words and numbers in plan-copy.ts (which reads PLANS): prices and plan features are never typed into the page. English only, like the rest of the
 * marketing copy; the page renders it statically.
 */
import { copy } from "@/copy/en-CA";
import { landingVariant, type JobId } from "./landing-variants";
import { marketingPlans, planLine, planNote, planVars, proHighlights } from "./plan-copy";
import { fill, moneyShort } from "./text";
import { SAMPLE_DEPOSIT_CENTS, SAMPLE_SERVICES, SHOWN_SERVICES, SOLO_PAGES, SOLO_PHOTOS, soloKey, soloVertical, type NailTrade, type SoloKey, type SoloPageId } from "./solo";

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
  const vars = {
    ...planVars(),
    deposit: moneyShort(SAMPLE_DEPOSIT_CENTS),
    area: T.area,
    client: T.client,
    service: booked.name,
  };
  const f = (s: string) => fill(s, vars);
  const goal = STAMP_GOAL[key];
  const facts = C.facts.items.map((x) => ({ value: f(x.value), line: f(x.line) }));
  if (id === "barber") facts[3] = { ...C.facts.barberLast };
  const upNext = { who: T.people[0]!, what: booked.name, when: C.hero.picked };
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
      price: planLine("priceLine"),
      proof: `${V.eyebrow}. ${C.hero.proof}`,
      policy: V.policy ?? { title: C.hero.policyTitle, body: C.hero.policyBody },
      booked: f(C.hero.booked),
      bookedCard: C.hero.bookedCard,
      bookedCardLine: f(C.hero.bookedCardLine),
    },
    facts,
    /** The owner's week: sample counts, the comparison with last week, the bars per day and the next client. */
    week: { ...C.week, upNext: { label: C.week.upNext, ...upNext } },
    bookings: { ...C.bookings, done: fill(C.bookings.done, { when: C.hero.bookedWhen }) },
    promos: { ...C.promos, allowance: planLine("promoAllowance") },
    /** The three job cards in the variant's order. */
    jobs: V.jobs.map((j) => {
      const card = (T.jobs as Partial<Record<JobId, { title: string; body: string }>>)[j];
      if (!card) throw new Error(`landing variant ${key}/${V.id}: no "${j}" job card for this look`);
      return { id: j, title: f(card.title), body: f(card.body) };
    }),
    notes: T.notes.map(f),
    card: fill(C.regulars.card, { client: T.client, have: goal - 1, goal }),
    /** The two plan cards and the note under them: lib/marketing/plan-copy.ts, the one place the plans are described. */
    price: { title: C.price.title, sub: C.price.sub, plans: marketingPlans("solo"), note: planNote("solo") },
    /** The Pro money features (waitlist, rebooking, reviews, the weekly report), from plan-copy.ts. */
    pro: proHighlights(),
    trialCta: planLine("trialCta"),
  };
}

export type SoloView = ReturnType<typeof soloView>;
