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
export const MILESTONE_KEYS = [
  "signed_up", "first_stamp", "members_10", "activated", "qr_printed", "staff_added", "pos_connected", "upsell_seen", "upsell_dismissed", "nudges_off", "needs_call",
  // Solo pros (onboarding-v1.md §4): the booking link takes bookings, it was shared, the first online booking by someone else, 5 and 10 of them.
  "booking_link_live", "first_share", "first_online_booking", "five_bookings", "ten_bookings", "first_promo_sent", "site_published", "instagram_connected",
  // phase-pro P1: the 14-day Pro trial started (the day the link went live) and ended (the receipt went out).
  "trial_started", "trial_ended",
] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];
/** Nudges are stored as milestones too, one per (shop, nudge), so each is sent once. */
export const NUDGE_KEYS = ["nudge_d1", "nudge_d3", "nudge_d7", "nudge_d14", "nudge_d25", "solo_d1", "solo_d3", "solo_d7", "solo_d14", "solo_d25"] as const;
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
  activated: "Goal reached",
  ahead: "Ahead of schedule",
  on_track: "On track",
  behind: "Behind schedule",
  late: "Past day 30",
};

// ---------------------------------------------------------------------------
// Playbooks per shop type
// ---------------------------------------------------------------------------
export type PlaybookKey = "cafe" | "restaurant" | "desi" | "tiffin" | "events" | "retail" | "pharmacy" | "salon" | "repair" | "other";

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
    upsell: { plan: "plus", headline: "bring them back on a slow day", body: "Pro adds promos for slow hours, texts to regulars who have gone quiet and POS auto-award." },
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
  events: {
    key: "events",
    label: "Caterer or banquet hall",
    tillLine: "Booking an event? Join the card and your next one earns points.",
    scriptLanguages: ["ur", "hi", "pa"],
    tactic: "Ask at the tasting or the deposit, when the family is already planning the next event. Past clients are your first 10.",
    tips: ["Ask at the tasting or the deposit.", "Send the join link to past clients on WhatsApp.", "Put the QR on the quote and the final invoice."],
    firstStampHint: "Add points to a past event for yourself, or a test deposit.",
    upsell: { plan: "restaurant_growth", headline: "quotes, deposits and event timelines in one place", body: "Restaurant Growth adds catering quotes, deposits, tasting appointments and event timelines. Banquet halls add hall booking on Restaurant Pro or the banquet add-on." },
  },
  retail: {
    key: "retail",
    label: "Retail shop",
    tillLine: "Do you have points with us?",
    scriptLanguages: [],
    tactic: "Add a line to the receipt and put the QR stand at the till. Every sale is a chance to join.",
    tips: ["Ask at the till, every time, for two weeks.", "Put the QR stand where people wait.", "Give a welcome bonus so the first purchase pays off."],
    firstStampHint: "Ring a small sale for yourself and add the points.",
    upsell: { plan: "plus", headline: "sell more to people who already shop with you", body: "Pro adds promos, birthday bonuses and texts to members who have not been in for a while." },
  },
  pharmacy: {
    key: "pharmacy",
    label: "Pharmacy front store",
    tillLine: "Do you collect points on front-store items?",
    scriptLanguages: [],
    tactic: "Front-store items only: prescriptions never earn points. Ask at the front till and mention the discount card for seniors.",
    tips: ["Prescriptions and dispensing fees never earn points. The template already blocks them.", "Ask at the front-store till only.", "Put the QR stand where the line forms."],
    firstStampHint: "Buy something small from the front store and add the points.",
    upsell: { plan: "plus", headline: "keep front-store customers coming back", body: "Pro adds promos and texts for front-store regulars." },
  },
  salon: {
    key: "salon",
    label: "Salon or barber",
    tillLine: "Want to book your next one before you go?",
    scriptLanguages: [],
    tactic: "Ask at checkout while they have the phone out, and rebook right there.",
    tips: ["Ask at checkout, not at the chair.", "Rebook before they leave.", "Put the QR on the mirror card."],
    firstStampHint: "Stamp your next haircut or give yourself a visit.",
    upsell: { plan: "plus", headline: "fill your calendar", body: "Pro adds online booking and rebooking texts so empty slots fill themselves." },
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
    upsell: { plan: "plus", headline: "do more with the members you have", body: "Pro adds promos, texts and email to your members." },
  },
};

const PLAYBOOK_BY_VERTICAL: Partial<Record<Vertical, PlaybookKey>> = {
  cafe: "cafe",
  bakery: "cafe",
  restaurant: "restaurant",
  bar: "restaurant",
  restaurant_south_asian: "desi",
  tiffin: "tiffin",
  caterer: "events",
  banquet_hall: "events",
  retail: "retail",
  grocery: "retail",
  bookstore: "retail",
  florist: "retail",
  pet: "retail",
  pharmacy: "pharmacy",
  salon: "salon",
  barber: "salon",
  nails: "salon",
  brows_lashes: "salon",
  makeup: "salon",
  spa: "salon",
  repair_electronics: "repair",
  repair_auto: "repair",
  car_wash: "retail",
  alterations: "repair",
  dry_cleaning: "repair",
  print_shop: "repair",
};

/**
 * Shops that are visited a few times a year (a florist, a hardware store, a bookshop, a repair counter, an event hall) cannot put 25
 * members through the door in 30 days, and a "Past day 30" card told them they had failed. They get a smaller target and a longer
 * window. Daily-visit trades keep 25 in 30 days. The base target is the environment's ACTIVATION_THRESHOLD.
 */
export const SLOW_ACTIVATION_VERTICALS: readonly string[] = ["retail", "bookstore", "florist", "beauty_supply", "other", "repair_electronics", "repair_auto", "alterations", "dry_cleaning", "print_shop", "car_wash", "caterer", "banquet_hall"];
export interface ActivationPlan {
  target: number;
  windowDays: number;
  leadingMembers: number;
  leadingByDay: number;
  slow: boolean;
}
export function activationFor(vertical: string | null | undefined, baseTarget: number = ACTIVATION.target): ActivationPlan {
  const slow = !!vertical && SLOW_ACTIVATION_VERTICALS.includes(vertical);
  if (!slow) return { target: baseTarget, windowDays: ACTIVATION.windowDays, leadingMembers: Math.min(ACTIVATION.leadingMembers, baseTarget), leadingByDay: ACTIVATION.leadingByDay, slow };
  const target = Math.min(baseTarget, 10);
  return { target, windowDays: 60, leadingMembers: Math.max(1, Math.ceil(target / 2)), leadingByDay: 30, slow };
}

/**
 * The first thing a shop of this trade sets up after signup, before or beside the loyalty card (founder decision 2026-10-27, trade tools self-serve):
 * a menu for restaurants, tiffin kitchens, caterers and banquet halls; services, hours, HST and the booking link for salons, barbers, repair, pet
 * groomers and auto care; the class schedule for studios; the price list for grocers. Cafés, retail and pharmacies (own rules step) have none.
 */
export type TradeSetupFamily = "menu" | "services" | "classes" | "catalog";
const TRADE_SETUP: Partial<Record<string, TradeSetupFamily>> = {
  restaurant: "menu", restaurant_south_asian: "menu", tiffin: "menu", caterer: "menu", banquet_hall: "menu", bar: "menu",
  salon: "services", barber: "services", nails: "services", brows_lashes: "services", makeup: "services", spa: "services", pet: "services", repair_electronics: "services", repair_auto: "services", car_wash: "services", alterations: "services", dry_cleaning: "services", print_shop: "services",
  fitness: "classes",
  grocery: "catalog",
};
export const tradeSetupFor = (vertical: string | null | undefined): TradeSetupFamily | null => (vertical && TRADE_SETUP[vertical]) || null;

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
  key: Exclude<NudgeKey, SoloNudgeKey>;
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
export function dueNudge(args: { hoursSinceSignup: number; members: number; firstStamp: boolean; sent: ReadonlySet<string> }): Exclude<NudgeKey, SoloNudgeKey> | null {
  const due = NUDGE_RULES.filter((r) => args.hoursSinceSignup >= r.afterHours && !args.sent.has(r.key) && r.when(args));
  return due.length ? due[due.length - 1]!.key : null;
}

/**
 * The setup reminder in the owner's language (`users.locale`; English when it is missing or not one of ours).
 * The shop name, the till line (what the owner says to customers) and the link stay as they are.
 */
export function nudgeText(key: Exclude<NudgeKey, SoloNudgeKey>, args: { shopName: string; members: number; daysLeft: number; target: number; tillLine: string; url: string; windowDays?: number; leadingMembers?: number; leadingByDay?: number }, locale: Locale = "en"): { subject: string; body: string } {
  const n = args.members;
  const left = Math.max(0, args.target - n);
  const v = { shop: args.shopName, n, left, days: args.daysLeft, target: args.target, till: args.tillLine, url: args.url, lead: args.leadingMembers ?? ACTIVATION.leadingMembers, day: args.leadingByDay ?? ACTIVATION.leadingByDay, window: args.windowDays ?? ACTIVATION.windowDays };
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

// ---- phase-solo: B ----
// ---------------------------------------------------------------------------
// Solo pros: the path, the six setup cards, bookings activation and the nudges (docs/design/onboarding-v1.md §3, §4)
// ---------------------------------------------------------------------------
/** Trades that are almost always one person with a chair or a table: always the solo path. */
export const SOLO_ONLY_VERTICALS: readonly string[] = ["nails", "brows_lashes", "makeup"];
/** Appointment trades that go solo when the owner works from home or travels, and appointment-led storefront from a shop. */
export const APPOINTMENT_VERTICALS: readonly string[] = ["salon", "barber", "spa", "pet", "nails", "brows_lashes", "makeup"];

export type OnboardingPath = "solo" | "appointment" | "storefront";

/**
 * Which setup a shop gets. A nail, brow, lash or makeup pro is solo wherever they work. A hairstylist, barber, spa or groomer is solo
 * at home or on the road, and an appointment-led storefront when they picked "A shop or salon". Shops that signed up before the
 * question existed (workSetting null) keep the setup they had.
 */
export function onboardingPath(vertical: string | null | undefined, workSetting: string | null | undefined): OnboardingPath {
  const v = vertical ?? "";
  if (SOLO_ONLY_VERTICALS.includes(v)) return "solo";
  if (!APPOINTMENT_VERTICALS.includes(v) || !workSetting) return "storefront";
  return workSetting === "home" || workSetting === "mobile" ? "solo" : "appointment";
}

/** The six cards, in order, and the "Later" group (never blocks the link). */
export const SOLO_STEPS = ["your_link", "services", "hours", "privacy", "share", "invite"] as const;
/** Appointment-led storefront: the same, with "Who takes bookings?" after services and no privacy card (the address is public). */
export const APPOINTMENT_STEPS = ["your_link", "services", "staff", "hours", "share", "invite"] as const;
export const SOLO_LATER_STEPS = ["profile", "loyalty", "instagram_connect", "site", "promos"] as const;
export const APPOINTMENT_LATER_STEPS = ["profile", "loyalty", "instagram_connect", "site", "promos", "pos"] as const;
export type SoloStepKey = (typeof SOLO_STEPS)[number] | (typeof APPOINTMENT_STEPS)[number] | (typeof APPOINTMENT_LATER_STEPS)[number];

/** Seconds each card should take (the rail shows "20 s"). The six add to under three minutes. */
export const SOLO_STEP_SECONDS: Readonly<Record<string, number>> = { your_link: 20, services: 60, hours: 30, privacy: 15, share: 30, invite: 30, staff: 30 };

/** The booking link is live once it can take a booking: a slug, at least one service and someone with hours. */
export function bookingLinkLive(s: { services: number; staffWithHours: number }): boolean {
  return s.services > 0 && s.staffWithHours > 0;
}

/** A booking link slug: 3 to 40 lowercase letters, digits and single dashes. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/;
/** Slugs that would shadow our own pages. */
export const RESERVED_SLUGS: readonly string[] = ["admin", "api", "app", "book", "dashboard", "help", "login", "logout", "m", "map", "me", "new", "pricing", "s", "settings", "shop", "shops", "signup", "support", "www"];
export function slugProblem(slug: string): "format" | "reserved" | null {
  if (!SLUG_RE.test(slug)) return "format";
  if (RESERVED_SLUGS.includes(slug)) return "reserved";
  return null;
}

/** An Instagram handle from "@nails.by.mo", "nails.by.mo" or an instagram.com link; null when it is not one. */
export function instagramHandle(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : null;
}

/** A handle as a slug candidate ("nails.by.mo" gives "nails-by-mo"). */
export const handleToSlug = (h: string): string => h.toLowerCase().replace(/[._]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** "Your first 10 bookings": the target and the straight-line pace (3 by day 7, onboarding-v1.md §4). */
export const BOOKINGS_ACTIVATION = { target: 10, windowDays: 30, paceBookings: 3, paceByDay: 7 } as const;

export type SoloNextMove = "share" | "invite" | "deposit" | "story";
/** One next move for the Bookings card: share the link, then invite regulars, then a deposit, then a story post. */
export function soloNextMove(s: { shared: boolean; invited: boolean; bookings: number; depositOn: boolean }): SoloNextMove {
  if (!s.shared) return "share";
  if (!s.invited && s.bookings < 3) return "invite";
  if (!s.depositOn) return "deposit";
  return "story";
}

export type SoloNudgeKey = "solo_d1" | "solo_d3" | "solo_d7" | "solo_d14" | "solo_d25";
export interface SoloNudgeState {
  shared: boolean;
  /** Online bookings made by someone other than the owner. */
  bookings: number;
  paying: boolean;
  annual: boolean;
}
export const SOLO_NUDGE_RULES: readonly { key: SoloNudgeKey; afterHours: number; when: (s: SoloNudgeState) => boolean }[] = [
  { key: "solo_d1", afterHours: 24, when: (s) => !s.shared },
  { key: "solo_d3", afterHours: 72, when: (s) => s.bookings === 0 },
  { key: "solo_d7", afterHours: 24 * 7, when: (s) => s.bookings < 3 },
  { key: "solo_d14", afterHours: 24 * 14, when: (s) => s.bookings >= 5 && !s.paying },
  { key: "solo_d25", afterHours: 24 * 25, when: (s) => !s.annual },
];

/** The solo nudge due now: the latest rule whose time has passed, whose condition holds and that was not sent. */
export function dueSoloNudge(args: SoloNudgeState & { hoursSinceSignup: number; sent: ReadonlySet<string> }): SoloNudgeKey | null {
  const due = SOLO_NUDGE_RULES.filter((r) => args.hoursSinceSignup >= r.afterHours && !args.sent.has(r.key) && r.when(args));
  return due.length ? due[due.length - 1]!.key : null;
}

/** The solo nudge in the owner's language: a push title and body (app first) and the text body (second). */
export function soloNudgeText(key: SoloNudgeKey, args: { shopName: string; link: string; url: string; season?: string }, locale: Locale = "en"): { title: string; body: string } {
  const v = { shop: args.shopName, link: args.link, url: args.url, season: args.season ?? "" };
  return { title: t(locale, `ob.solo.nudge.${key.slice(5)}.title` as MessageKeyOf, v), body: t(locale, `ob.solo.nudge.${key.slice(5)}.body` as MessageKeyOf, v) };
}
type MessageKeyOf = Parameters<typeof t>[1];
// ---- end phase-solo: B ----
