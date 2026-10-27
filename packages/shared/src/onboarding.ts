/**
 * Merchant onboarding and activation rules (docs/research/merchant-onboarding.md).
 *
 * Time to value is the first stamp. Activation is 25 members who have visited within 30 days of signup
 * (launch plan: >= 60% of shops, leading signal 12 members by day 14). Everything here is pure so the
 * API, the dashboard and the admin funnel agree on the same words and numbers.
 */
import { FOUNDING_OFFER, RESTAURANT_PLANS, PLANS } from "./plans.js";
import type { Locale } from "./i18n/locales.js";
import { t } from "./i18n/t.js";
import type { Vertical } from "./verticals.js";

export const ACTIVATION = {
  /** Members who have visited at least once. Overridable per environment (ACTIVATION_THRESHOLD). */
  target: 25,
  windowDays: 30,
  leadingMembers: 12,
  leadingByDay: 14,
  /** A shop with no first stamp this long after signup goes on the founder's call list. */
  stuckAfterHours: 48,
  /** Preview line for restaurants. */
  previewMembers: 10,
} as const;

// ---------------------------------------------------------------------------
// Milestones (merchant_milestones.key)
// ---------------------------------------------------------------------------
export const MILESTONE_KEYS = ["signed_up", "first_stamp", "members_10", "activated", "qr_printed", "staff_added", "pos_connected", "upsell_seen", "upsell_dismissed", "nudges_off", "needs_call"] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];
/** Nudges are stored as milestones too, one per (shop, nudge), so each is sent once. */
export const NUDGE_KEYS = ["nudge_d1", "nudge_d3", "nudge_d7", "nudge_d14", "nudge_d25"] as const;
export type NudgeKey = (typeof NUDGE_KEYS)[number];

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------
export type Pace = "activated" | "ahead" | "on_track" | "behind" | "late";

export function daysSince(from: Date | string, now: Date): number {
  const t = typeof from === "string" ? new Date(from).getTime() : from.getTime();
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** Members a shop should have by `day` (0-based days since signup) to reach the target on time, a straight line. */
export function expectedMembers(day: number, target: number = ACTIVATION.target, windowDays: number = ACTIVATION.windowDays): number {
  return Math.min(target, (target * Math.max(0, day)) / windowDays);
}

export function paceFor(args: { day: number; members: number; activated: boolean; target?: number; windowDays?: number }): Pace {
  const target = args.target ?? ACTIVATION.target;
  const windowDays = args.windowDays ?? ACTIVATION.windowDays;
  if (args.activated || args.members >= target) return "activated";
  if (args.day > windowDays) return "late";
  // The first two days are too early to call anyone behind.
  if (args.day <= 2) return args.members > 0 ? "ahead" : "on_track";
  const expected = expectedMembers(args.day, target, windowDays);
  if (args.members >= expected * 1.15) return "ahead";
  if (args.members >= expected * 0.85) return "on_track";
  return "behind";
}

export const PACE_LABEL: Record<Pace, string> = {
  activated: "Active shop",
  ahead: "Ahead of pace",
  on_track: "On pace",
  behind: "Behind pace",
  late: "Past day 30",
};

// ---------------------------------------------------------------------------
// Playbooks per shop type
// ---------------------------------------------------------------------------
export type PlaybookKey = "cafe" | "restaurant" | "desi" | "tiffin" | "retail" | "pharmacy" | "salon" | "repair" | "other";

export type UpsellPlanKind = "restaurant_starter" | "restaurant_growth" | "plus" | "pro";

export interface Playbook {
  key: PlaybookKey;
  label: string;
  /** What staff say at the till. One sentence. */
  tillLine: string;
  /** Printed on the staff script card in addition to English (customer-facing languages the shop serves). */
  scriptLanguages: readonly string[];
  /** The till line in the languages above, for the printed staff script. Needs native-speaker review (translation-glossary.md). */
  tillLineLocal?: Readonly<Record<"hi" | "ur" | "pa", string>>;
  /** The single tactic that gets this type of shop to 25. Shown in "best next move" when nothing sharper applies. */
  tactic: string;
  /** Three first-week tips for the setup guide. */
  tips: readonly [string, string, string];
  /** First stamp copy: what the owner does to see it work. */
  firstStampHint: string;
  upsell: { plan: UpsellPlanKind; headline: string; body: string };
}

const PLAYBOOKS: Record<PlaybookKey, Playbook> = {
  cafe: {
    key: "cafe",
    label: "Café or bakery",
    tillLine: "Want a stamp on that today?",
    scriptLanguages: [],
    tactic: "Stamp before they pay so they see it work, and keep the QR stand next to the card machine.",
    tips: ["Stamp before the customer taps their card.", "Put the QR stand next to the card machine, not behind the till.", "Tell regulars first. They tell the line."],
    firstStampHint: "Stamp your own coffee or pastry. It takes ten seconds.",
    upsell: { plan: "plus", headline: "bring them back on a slow day", body: "Café & Retail adds promos for slow hours, texts to regulars who have gone quiet and POS auto-award." },
  },
  restaurant: {
    key: "restaurant",
    label: "Restaurant",
    tillLine: "Are you on the card? You get points on this bill.",
    scriptLanguages: [],
    tactic: "Ask when the bill is printed, and add the points before the card machine comes out. Alcohol never earns points.",
    tips: ["Ask at payment, not at the door.", "Put a table tent at every table for the first two weeks.", "Offer the first reward early: a welcome bonus makes joining worth it."],
    firstStampHint: "Add points to your own lunch bill. It shows exactly what a guest sees.",
    upsell: { plan: "restaurant_starter", headline: "your own ordering page, no commission", body: "Restaurant Starter gives you an ordering page, halal and dietary tags, WhatsApp order updates and review requests." },
  },
  desi: {
    key: "desi",
    label: "South Asian restaurant",
    tillLine: "Are you on the card? Every dollar earns points, here and on the street.",
    scriptLanguages: ["ur", "hi", "pa"],
    tillLineLocal: {
      hi: "क्या आपके पास कार्ड है? हर डॉलर पर पॉइंट मिलते हैं।",
      ur: "کیا آپ کے پاس کارڈ ہے؟ ہر ڈالر پر پوائنٹس ملتے ہیں۔",
      pa: "ਕੀ ਤੁਹਾਡੇ ਕੋਲ ਕਾਰਡ ਹੈ? ਹਰ ਡਾਲਰ 'ਤੇ ਪੁਆਇੰਟ ਮਿਲਦੇ ਹਨ।",
    },
    tactic: "Families on Friday and weekend evenings are your 25. Send the join link on WhatsApp to the table while they wait for the bill.",
    tips: ["Ask the table, not one person: someone always has a phone out.", "Print the script card in your staff's language. It prints in English, Urdu, Hindi and Punjabi.", "Ask the regulars who bring family first."],
    firstStampHint: "Add points to your own family order. Free chai is the first reward, so you can show it.",
    upsell: { plan: "restaurant_growth", headline: "tiffin, degh and festival orders in one place", body: "Restaurant Growth adds tiffin subscriptions, degh pre-orders, catering and festival campaigns." },
  },
  tiffin: {
    key: "tiffin",
    label: "Tiffin kitchen",
    tillLine: "Your tenth box is on us. Scan the sticker once and I will stamp every delivery.",
    scriptLanguages: ["hi", "pa", "ur"],
    tillLineLocal: {
      hi: "स्टिकर एक बार स्कैन करें, हर डिलीवरी पर स्टैम्प मिलेगा।",
      ur: "اسٹکر ایک بار اسکین کریں، ہر ڈیلیوری پر اسٹیمپ ملے گا۔",
      pa: "ਸਟਿੱਕਰ ਇੱਕ ਵਾਰ ਸਕੈਨ ਕਰੋ, ਹਰ ਡਿਲੀਵਰੀ 'ਤੇ ਸਟੈਂਪ ਮਿਲੇਗਾ।",
    },
    tactic: "Put the QR sticker on every box for the first week. Subscribers are already regulars, so they join first.",
    tips: ["Stick the QR on every box for week one.", "Stamp each delivered box, not each order.", "Start with your subscribers: they are the easiest 10."],
    firstStampHint: "Stamp one of your own boxes. A delivered box is one stamp.",
    upsell: { plan: "restaurant_growth", headline: "run the whole tiffin route from here", body: "Restaurant Growth adds subscription billing, skips, delivery routes and WhatsApp updates." },
  },
  retail: {
    key: "retail",
    label: "Retail shop",
    tillLine: "Do you have points with us?",
    scriptLanguages: [],
    tactic: "Add a line to the receipt and put the QR stand at the till. Every sale is a chance to join.",
    tips: ["Ask at the till, every time, for two weeks.", "Put the QR stand where people wait.", "Give a welcome bonus so the first purchase pays off."],
    firstStampHint: "Ring a small sale for yourself and add the points.",
    upsell: { plan: "plus", headline: "sell more to people who already shop with you", body: "Café & Retail adds promos, birthday bonuses and texts to members who have not been in for a while." },
  },
  pharmacy: {
    key: "pharmacy",
    label: "Pharmacy front store",
    tillLine: "Do you collect points on front-store items?",
    scriptLanguages: [],
    tactic: "Front-store items only: prescriptions never earn points. Ask at the front till and mention the discount card for seniors.",
    tips: ["Prescriptions and dispensing fees never earn points. The template already blocks them.", "Ask at the front-store till only.", "Put the QR stand where the line forms."],
    firstStampHint: "Buy something small from the front store and add the points.",
    upsell: { plan: "plus", headline: "keep front-store customers coming back", body: "Café & Retail adds promos and texts for front-store regulars." },
  },
  salon: {
    key: "salon",
    label: "Salon or barber",
    tillLine: "Want to book your next one before you go?",
    scriptLanguages: [],
    tactic: "Ask at checkout while they have the phone out, and rebook right there.",
    tips: ["Ask at checkout, not at the chair.", "Rebook before they leave.", "Put the QR on the mirror card."],
    firstStampHint: "Stamp your next haircut or give yourself a visit.",
    upsell: { plan: "plus", headline: "fill your calendar", body: "Café & Retail adds online booking and rebooking texts so empty slots fill themselves." },
  },
  repair: {
    key: "repair",
    label: "Repair, tailor or service",
    tillLine: "Join and your next repair earns points.",
    scriptLanguages: [],
    tactic: "Put the QR on the ticket stub. People join when they pick up, because that is when they are happiest.",
    tips: ["Put the QR on the pickup ticket.", "Ask at pickup, not at drop-off.", "Record every repair so repeat customers earn."],
    firstStampHint: "Add points to a small repair or a test ticket for yourself.",
    upsell: { plan: "pro", headline: "send quotes and take deposits", body: "Service adds tickets, quote approvals, deposits and invoices." },
  },
  other: {
    key: "other",
    label: "Your shop",
    tillLine: "Are you on the card? It is free.",
    scriptLanguages: [],
    tactic: "Ask every customer for two weeks and keep the QR stand next to the till.",
    tips: ["Ask every customer for the first two weeks.", "Keep the QR stand where people pay.", "Stamp before they pay so they see it work."],
    firstStampHint: "Add a stamp or points for yourself.",
    upsell: { plan: "plus", headline: "do more with the members you have", body: "Café & Retail adds promos, texts and email to your members." },
  },
};

const PLAYBOOK_BY_VERTICAL: Partial<Record<Vertical, PlaybookKey>> = {
  cafe: "cafe",
  bakery: "cafe",
  restaurant: "restaurant",
  bar: "restaurant",
  restaurant_south_asian: "desi",
  tiffin: "tiffin",
  retail: "retail",
  grocery: "retail",
  bookstore: "retail",
  florist: "retail",
  pet: "retail",
  pharmacy: "pharmacy",
  salon: "salon",
  barber: "salon",
  spa: "salon",
  repair_electronics: "repair",
  repair_auto: "repair",
  car_wash: "retail",
  alterations: "repair",
  dry_cleaning: "repair",
  print_shop: "repair",
};

export function playbookFor(vertical: string | null | undefined): Playbook {
  return PLAYBOOKS[(vertical && PLAYBOOK_BY_VERTICAL[vertical as Vertical]) || "other"];
}

export const PLAYBOOK_KEYS = Object.keys(PLAYBOOKS) as PlaybookKey[];
export function allPlaybooks(): Playbook[] {
  return PLAYBOOK_KEYS.map((k) => PLAYBOOKS[k]);
}

// ---------------------------------------------------------------------------
// Upsell timing
// ---------------------------------------------------------------------------
export type UpsellMoment = "none" | "preview" | "offer";
export interface Upsell {
  moment: UpsellMoment;
  plan: UpsellPlanKind;
  headline: string;
  body: string;
  /** Price, e.g. "$99 a month". */
  priceLine: string;
  /** Restaurant founding offer line (restaurants only). */
  foundingLine: string | null;
}

export interface UpsellInput {
  vertical: string;
  members: number;
  firstStamp: boolean;
  activated: boolean;
  pace: Pace;
  /** Already on a paid plan or a restaurant tier. */
  paying: boolean;
  /** Owner pressed "Not now" within the last 14 days. */
  dismissedRecently: boolean;
  /** Founding slots left in this corridor, if known. */
  foundingSpotsLeft?: number | null;
}

const NONE: Upsell = { moment: "none", plan: "plus", headline: "", body: "", priceLine: "", foundingLine: null };

function priceLine(plan: UpsellPlanKind): string {
  if (plan === "restaurant_starter") return `$${RESTAURANT_PLANS.starter.priceCents / 100} a month`;
  if (plan === "restaurant_growth") return `$${RESTAURANT_PLANS.growth.priceCents / 100} a month`;
  if (plan === "pro") return `$${PLANS.pro.priceCents / 100} a month`;
  return `$${PLANS.plus.priceCents / 100} a month`;
}

/**
 * When is a paid tier worth mentioning? Only once the shop has seen the card work in its own numbers:
 * never before the first stamp, never while the owner is behind pace (help them reach 25 first),
 * a one-line preview for restaurants at 10 members, the full offer once activated.
 */
export function upsellMoment(i: UpsellInput): Upsell {
  if (i.paying || i.dismissedRecently || !i.firstStamp) return NONE;
  const pb = playbookFor(i.vertical);
  const restaurant = pb.upsell.plan === "restaurant_starter" || pb.upsell.plan === "restaurant_growth";
  const base: Upsell = { moment: "none", plan: pb.upsell.plan, headline: pb.upsell.headline, body: pb.upsell.body, priceLine: priceLine(pb.upsell.plan), foundingLine: null };
  if (restaurant) {
    const left = i.foundingSpotsLeft;
    base.foundingLine = `Founding offer: ${FOUNDING_OFFER.firstYearPct}% off for 12 months, then ${FOUNDING_OFFER.lifetimePct}% off for life.${typeof left === "number" ? ` ${Math.max(0, left)} of ${FOUNDING_OFFER.slotsPerCorridor} spots left on your street.` : ""}`;
  }
  if (i.activated) return { ...base, moment: "offer" };
  if (restaurant && i.members >= ACTIVATION.previewMembers && (i.pace === "ahead" || i.pace === "on_track")) return { ...base, moment: "preview" };
  return NONE;
}

// ---------------------------------------------------------------------------
// Nudges
// ---------------------------------------------------------------------------
export interface NudgeRule {
  key: NudgeKey;
  /** Hours after signup before this nudge may send. */
  afterHours: number;
  /** Only while this holds. */
  when: (s: { members: number; firstStamp: boolean }) => boolean;
}

export const NUDGE_RULES: readonly NudgeRule[] = [
  { key: "nudge_d1", afterHours: 24, when: (s) => !s.firstStamp },
  { key: "nudge_d3", afterHours: 72, when: (s) => s.members < 5 },
  { key: "nudge_d7", afterHours: 24 * 7, when: (s) => s.members < ACTIVATION.previewMembers },
  { key: "nudge_d14", afterHours: 24 * 14, when: (s) => s.members < ACTIVATION.leadingMembers },
  { key: "nudge_d25", afterHours: 24 * 25, when: (s) => s.members < ACTIVATION.target },
];

/** The nudge due now, if any: the latest rule whose time has passed and whose condition holds and that was not sent. */
export function dueNudge(args: { hoursSinceSignup: number; members: number; firstStamp: boolean; sent: ReadonlySet<string> }): NudgeKey | null {
  const due = NUDGE_RULES.filter((r) => args.hoursSinceSignup >= r.afterHours && !args.sent.has(r.key) && r.when(args));
  return due.length ? due[due.length - 1]!.key : null;
}

/**
 * The setup reminder in the owner's language (`users.locale`; English when it is missing or not one of ours).
 * The shop name, the till line (what the owner says to customers) and the link stay as they are.
 */
export function nudgeText(key: NudgeKey, args: { shopName: string; members: number; daysLeft: number; target: number; tillLine: string; url: string }, locale: Locale = "en"): { subject: string; body: string } {
  const n = args.members;
  const left = Math.max(0, args.target - n);
  const v = { shop: args.shopName, n, left, days: args.daysLeft, target: args.target, till: args.tillLine, url: args.url, lead: ACTIVATION.leadingMembers, day: ACTIVATION.leadingByDay };
  switch (key) {
    case "nudge_d1":
      return { subject: t(locale, "ob.nudge.d1.subject", v), body: t(locale, "ob.nudge.d1.body", v) };
    case "nudge_d3":
      return { subject: t(locale, "ob.nudge.d3.subject", v), body: t(locale, "ob.nudge.d3.body", v) };
    case "nudge_d7":
      return { subject: t(locale, "ob.nudge.d7.subject", v), body: t(locale, "ob.nudge.d7.body", v) };
    case "nudge_d14":
      return { subject: t(locale, "ob.nudge.d14.subject", v), body: t(locale, "ob.nudge.d14.body", v) };
    case "nudge_d25":
      return { subject: t(locale, "ob.nudge.d25.subject", v), body: t(locale, "ob.nudge.d25.body", v) };
  }
}
