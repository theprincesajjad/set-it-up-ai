/**
 * Restaurant desk contracts (South Asian restaurants, desi2): Home, busy mode, pre-order planning and wait list,
 * kitchen additions (fire time, allergy, sold out), split-bill tenders and the shared cent-splitting rule,
 * WhatsApp inbox, festivals planner, phone orders. Re-exported from restaurant.ts, so callers use `restaurantApi.X`.
 * Money is integer cents; times are ISO strings in UTC, shown in the shop's time zone by the client.
 */
import { z } from "zod";

// ===========================================================================
// Home (GET :m/restaurant/home) and busy mode (PUT :m/restaurant/busy)
// ===========================================================================
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const BUSY_MINUTES = [0, 10, 15, 20, 30] as const;
/** What the app fee in "commission avoided" is assumed to be (basis points). Shown as an estimate with its inputs. */
export const ASSUMED_APP_FEE_BPS = 2500;
/** The wait we quote at the counter and online when the kitchen is not busy. */
export const BASE_QUOTED_WAIT_MIN = 20;
/** Channels that count as direct (guests who did not come through a delivery app). The counter walk-ins do not. */
export const DIRECT_CHANNELS = ["web", "whatsapp", "phone", "app"] as const;
export const ORDER_CHANNELS = ["counter", "phone", "whatsapp", "web", "app"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const busyBody = z.object({
  addMinutes: z.union([z.literal(0), z.literal(10), z.literal(15), z.literal(20), z.literal(30)]),
  /** How long busy mode stays on (default 2 hours). Ignored when addMinutes is 0. */
  hours: z.number().min(0.25).max(12).optional(),
});
export type BusyBody = z.input<typeof busyBody>;

export interface BusyEventDto {
  id: string;
  addMinutes: number;
  startedAt: string;
  until: string | null;
  endedAt: string | null;
}
export interface BusyState {
  on: boolean;
  addMinutes: number;
  until: string | null;
  quotedWaitMin: number;
  /** Most recent busy periods, newest first. */
  recent: BusyEventDto[];
}

export type ComingUpKind = "preorder" | "catering" | "banquet" | "festival";
export interface ComingUpRow {
  /** Shop-local date, YYYY-MM-DD. */
  date: string;
  kind: ComingUpKind;
  title: string;
  sub: string;
  pots?: number;
  cap?: number | null;
  /** Catering and banquet status, or festival date confidence. */
  tag?: string | null;
  href?: string;
  festivalId?: string;
}
export type NeedsYouKind = "new_orders" | "late" | "phone_review" | "whatsapp_payment" | "review";
export interface NeedsYouRow {
  kind: NeedsYouKind;
  count: number;
  /** Plain sentence, e.g. "3 new orders waiting to be accepted". */
  text: string;
  /** Dashboard path under the shop base, e.g. "/orders". */
  href: string;
  /** Accent for new orders, negative for late, info for waiting on a guest. */
  tone: "accent" | "negative" | "info";
}
export interface RestaurantHomeResponse {
  asOf: string;
  today: string;
  /** "11 pm" style closing time of the first location today, null if unknown. */
  closesAt: string | null;
  orders: { new: number; preparing: number; ready: number; late: number; open: number };
  avgWaitMin: number | null;
  quotedWaitMin: number;
  salesTodayCents: number;
  /** Today vs the same weekday last week, whole percent; null when there was nothing last week. */
  salesVsLastSameWeekdayPct: number | null;
  /** An estimate, not a measurement: direct orders x average ticket x the assumed app fee. */
  directSavings: { estimate: true; periodDays: number; directOrders: number; avgTicketCents: number; assumedFeeBps: number; cents: number };
  channels: { channel: OrderChannel; count: number }[];
  comingUp: ComingUpRow[];
  needsYou: NeedsYouRow[];
  busy: BusyState;
}

/** GET :m/restaurant/badges: the numbers beside Orders, Phone orders and WhatsApp in the sidebar. */
export interface RestaurantBadges {
  orders: number;
  phone: number;
  whatsapp: number;
}

// ===========================================================================
// Pre-order planning: rules, plan, shopping list, wait list, availability
// ===========================================================================
const isoDate = z.iso.date();
const weekdayKey = z.enum(WEEKDAYS);

export const preorderOverrideSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    cap: z.number().int().min(1).max(1000),
    /** Minimum notice for pickups on these dates (hours); the item's own notice still applies if longer. */
    leadHours: z.number().int().min(0).max(720).optional(),
    label: z.string().trim().min(1).max(60),
  })
  .refine((o) => o.from <= o.to, { message: "The end date is before the start date", path: ["to"] });
export type PreorderOverride = z.infer<typeof preorderOverrideSchema>;

/** PUT :m/preorders/settings. Every field is optional; null clears a cap. */
export const preorderRulesBody = z.object({
  preorderDailyCap: z.number().int().min(1).max(1000).nullable().optional(),
  capByWeekday: z.partialRecord(weekdayKey, z.number().int().min(1).max(1000).nullable()).optional(),
  perHourCap: z.number().int().min(1).max(100).nullable().optional(),
  overrides: z.array(preorderOverrideSchema).max(20).optional(),
});
export type PreorderRulesBody = z.input<typeof preorderRulesBody>;
export interface PreorderRulesResponse {
  preorderDailyCap: number | null;
  capByWeekday: Partial<Record<Weekday, number>>;
  perHourCap: number | null;
  overrides: PreorderOverride[];
}

/** One dish on a pickup day: pots, when to start, and the estimated rice and meat. */
export interface PreorderPlanLine {
  catalogItemId: string | null;
  name: string;
  pots: number;
  quantity: number;
  serves: number | null;
  /** Earliest pickup for this dish minus its cook time; null when the dish has no cook time. */
  fireAt: string | null;
  firstPickupAt: string;
  lastPickupAt: string;
  cookMinutes: number;
  /** Estimates from the per-pot recipe; null when the dish has none. */
  riceKg: number | null;
  meatKg: number | null;
  meatKind: string | null;
  extras: { name: string; qty: number; unit: string }[];
  hasRecipe: boolean;
}
export interface PreorderShoppingItem {
  name: string;
  qty: number;
  unit: string;
}
export interface PreorderShopping {
  /** Always true: quantities come from recipes you typed in, not measured stock. */
  estimate: true;
  items: PreorderShoppingItem[];
  /** One line you can paste to a supplier. */
  text: string;
}

/** POST :m/orders/:orderId/remind-balance */
export interface RemindBalanceResponse {
  orderId: string;
  balanceDueCents: number;
  channel: "whatsapp" | "sms" | "none";
  sent: boolean;
  /** Why nothing went out: no consent, no phone, WhatsApp window closed and no SMS consent. */
  reason?: "no_phone" | "no_consent" | "not_due" | "too_soon" | "failed";
}

/** GET /public/shops/:slug/preorders/availability?itemId&from&to */
export const preorderAvailabilityQuery = z.object({ itemId: z.uuid(), from: isoDate.optional(), to: isoDate.optional() });
export interface PreorderAvailabilityDay {
  date: string;
  potsLeft: number | null;
  full: boolean;
  /** Guests already waiting for this day. */
  waiting: number;
  /** Earliest day this dish can be picked up is later than this date (notice period). */
  tooSoon: boolean;
  windows: { start: string; end: string; full: boolean }[];
  /** Eid and other override label, if any. */
  note: string | null;
}
export interface PreorderAvailabilityResponse {
  itemId: string;
  leadHours: number;
  perHourCap: number | null;
  days: PreorderAvailabilityDay[];
}
/** Words a guest agrees to when joining the wait list (CASL express consent for this one message). */
export const WAITLIST_CONSENT_TEXT = "Message me once if a pot opens up for this day. I can reply STOP at any time.";
export const waitlistBody = z.object({
  itemId: z.uuid(),
  date: isoDate,
  phone: z.string().trim().min(7).max(20),
  name: z.string().trim().max(80).optional(),
  /** Must be true: the guest saw WAITLIST_CONSENT_TEXT. */
  consent: z.literal(true),
});
export type WaitlistBody = z.input<typeof waitlistBody>;
export interface WaitlistResponse {
  date: string;
  position: number;
  alreadyWaiting: boolean;
  message: string;
}
export interface WaitlistSummaryRow {
  date: string;
  count: number;
}
/** GET :m/preorders/waitlist?from&to: who is waiting, per day (phones are shown in full to staff). */
export interface WaitlistEntryDto {
  id: string;
  date: string;
  name: string | null;
  phone: string;
  dish: string | null;
  joinedAt: string;
  /** Set once we messaged them about a freed pot. */
  notifiedAt: string | null;
}

// ===========================================================================
// Kitchen: fire time, allergy, sold out
// ===========================================================================
/** Minutes before the fire time that a pre-order is pinned to the top of the kitchen screen. */
export const KITCHEN_PIN_BEFORE_FIRE_MIN = 120;

export interface SoldOutItemDto {
  id: string;
  name: string;
  nameEn: string;
  station: string | null;
  /** Null = available. Otherwise sold out until this time. */
  soldOutUntil: string | null;
}
export interface SoldOutResponse {
  soldOutCount: number;
  items: SoldOutItemDto[];
}
/** PATCH :m/kitchen/sold-out/:itemId. until: "today" = end of the shop's day, "restore" = back on, or an ISO time. */
export const soldOutBody = z.object({ until: z.union([z.literal("today"), z.literal("restore"), z.iso.datetime({ offset: true })]) });
export type SoldOutBody = z.input<typeof soldOutBody>;

/** Per-pot recipe (estimates) as saved on a dish. */
export const recipeSchema = z
  .object({
    riceKg: z.number().min(0).max(500).optional(),
    meatKg: z.number().min(0).max(500).optional(),
    meatKind: z.string().trim().min(1).max(30).optional(),
    extras: z.array(z.object({ name: z.string().trim().min(1).max(40), qty: z.number().min(0).max(10_000), unit: z.string().trim().min(1).max(12) })).max(12).optional(),
  })
  .strict();
export type Recipe = z.infer<typeof recipeSchema>;

// ===========================================================================
// Split bills: a payment method per guest, shared items, the odd-cent rule
// ===========================================================================
export const SPLIT_TENDERS = ["link", "card", "cash"] as const;
export type SplitTender = (typeof SPLIT_TENDERS)[number];
export const splitTenderSchema = z.enum(SPLIT_TENDERS);
/** POST :m/orders/:orderId/splits/:splitId/mark-paid: a guest paid at the table (card terminal or cash). */
export const markSplitPaidBody = z.object({ tender: z.enum(["cash", "card"]), tipCents: z.number().int().min(0).max(100_000).default(0) });
export type MarkSplitPaidBody = z.input<typeof markSplitPaidBody>;

/** PATCH :m/orders/:orderId/splits/:splitId: change how an open share is paid. */
export const splitTenderBody = z.object({ tender: splitTenderSchema });

/** Item references in a by-items split: a whole order line ("<id>") or one unit of it ("<id>:2" = the second unit). */
export const splitItemRef = z.string().trim().min(1).max(64).regex(/^[0-9a-fA-F-]{36}(:\d{1,3})?$/, "Use an order item id, or id:n for one unit");

export interface SplitLine {
  id: string;
  quantity: number;
  unitPriceCents: number;
}
/** Which splits (by index) pay for each unit of each line. Throws a plain message when a unit is not on any split. */
export function unitOwners(lines: SplitLine[], refs: string[][]): { lineId: string; unit: number; unitPriceCents: number; owners: number[] }[] {
  const byId = new Map(lines.map((l) => [l.id.toLowerCase(), l]));
  const covered = new Map<string, Set<number>>();
  refs.forEach((list, si) => {
    for (const raw of list) {
      const [id, unitStr] = raw.toLowerCase().split(":");
      const line = byId.get(id!);
      if (!line) throw new Error("An item isn't on this order");
      const units = unitStr ? [Number(unitStr)] : Array.from({ length: line.quantity }, (_, i) => i + 1);
      for (const u of units) {
        if (u < 1 || u > line.quantity) throw new Error("An item unit isn't on this order");
        const key = `${id}:${u}`;
        (covered.get(key) ?? covered.set(key, new Set()).get(key)!).add(si);
      }
    }
  });
  const out: { lineId: string; unit: number; unitPriceCents: number; owners: number[] }[] = [];
  for (const l of lines) {
    for (let u = 1; u <= l.quantity; u++) {
      const owners = [...(covered.get(`${l.id.toLowerCase()}:${u}`) ?? [])].sort((a, b) => a - b);
      if (!owners.length) throw new Error("Every item on the bill must be given to at least one guest");
      out.push({ lineId: l.id, unit: u, unitPriceCents: l.unitPriceCents, owners });
    }
  }
  return out;
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

/**
 * Split `total` cents by weight. Each share is rounded down; the cents left over go to the first split, so the
 * shares always add up to the total ("odd cent goes to the first guest"). Weights are non-negative integers.
 */
export function splitCents(total: number, weights: (number | bigint)[]): number[] {
  const w = weights.map((x) => BigInt(x));
  const sum = w.reduce((a, b) => a + b, 0n);
  if (sum <= 0n) throw new Error("Nothing to split");
  const shares = w.map((x) => (BigInt(total) * x) / sum);
  const left = BigInt(total) - shares.reduce((a, b) => a + b, 0n);
  shares[0] = shares[0]! + left;
  return shares.map(Number);
}

/**
 * Shares of an order total for a by-items split: each guest's food (a unit shared by k guests counts 1/k of its price
 * for each of them) decides their share of tax, discounts and tip; the odd cent goes to the first guest.
 */
export function splitByItems(totalCents: number, lines: SplitLine[], refs: string[][]): number[] {
  const units = unitOwners(lines, refs);
  let scale = 1n;
  for (const u of units) scale = (scale * BigInt(u.owners.length)) / gcd(scale, BigInt(u.owners.length));
  const weights = refs.map(() => 0n);
  for (const u of units) for (const o of u.owners) weights[o] = weights[o]! + (BigInt(u.unitPriceCents) * scale) / BigInt(u.owners.length);
  return splitCents(totalCents, weights);
}

// ===========================================================================
// Festivals planner
// ===========================================================================
export const festivalDateOverrideBody = z.object({
  year: z.number().int().min(2026).max(2028),
  /** The date you will mark it on (YYYY-MM-DD), or null to go back to the calendar date. */
  start: isoDate.nullable(),
});
export type FestivalDateOverrideBody = z.input<typeof festivalDateOverrideBody>;
export const festivalPreferencesBody = z.object({ cuisines: z.array(z.string().trim().min(1).max(30)).max(12) });
export type FestivalPreferencesBody = z.input<typeof festivalPreferencesBody>;
/** Where a send stands, from festival_sends. */
export interface FestivalSendStatus {
  templateId: string;
  channel: string;
  status: "draft" | "scheduled";
  scheduledAt: string | null;
}

// ===========================================================================
// WhatsApp inbox
// ===========================================================================
export const sendChatMessageBody = z.object({ text: z.string().trim().min(1).max(1500) });
export type SendChatMessageBody = z.input<typeof sendChatMessageBody>;
export interface ChatMessageDto {
  id: string;
  direction: "in" | "out";
  kind: "text" | "template" | "order_summary";
  body: string;
  sender: "guest" | "assistant" | "staff" | "system";
  createdAt: string;
}
/** The body of an order_summary message (JSON string): what the assistant built and the pay link. */
export interface OrderSummaryBody {
  orderNumber: number;
  lines: { quantity: number; name: string; totalCents: number }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** Deposit due now, for pre-orders. */
  depositCents: number;
  payUrl: string | null;
}
export interface ChatMessagesResponse {
  sessionId: string;
  phone: string;
  language: string;
  takenOver: boolean;
  windowOpenUntil: string | null;
  items: ChatMessageDto[];
}
export interface ChatGuestPanel {
  name: string | null;
  phone: string;
  memberId: string | null;
  visits: number;
  lastVisitAt: string | null;
  usual: { catalogItemId: string; name: string; quantity: number }[];
  points: number | null;
  notes: string | null;
  consent: { optedIn: boolean; optedInAt: string | null };
  language: string;
}

// ===========================================================================
// Phone orders
// ===========================================================================
export interface PhoneUsualDto {
  items: { catalogItemId: string; name: string; quantity: number }[];
  /** "2 Nihari, 4 Garlic Naan" */
  text: string;
  orders: number;
}
export interface PhoneLookupResponse {
  phone: string;
  member: { id: string; userId: string; name: string | null; visits: number } | null;
  usual: PhoneUsualDto | null;
}
export interface UsualResponse extends PhoneUsualDto {
  memberId: string;
  name: string | null;
}
