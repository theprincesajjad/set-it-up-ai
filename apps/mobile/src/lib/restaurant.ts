/**
 * Pure helpers for the restaurant pack screens (tiffin, catering, banquet, dietary badges).
 * No react-native imports, so vitest runs them in plain Node. Calendar days are YYYY-MM-DD in
 * America/Toronto, the same as the API; instants are UTC ISO strings.
 */
import type { MessageKey, restaurantApi, tiffinApi } from "@ll/shared";

const TZ = "America/Toronto";

// ---------------------------------------------------------------------------
// Calendar days (Toronto)
// ---------------------------------------------------------------------------
/** Today's date in Toronto, "YYYY-MM-DD". */
export function torontoToday(now: Date = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday .. 6 = Saturday. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** A Date that formats as `day` in any Toronto-zoned formatter (noon Toronto is 16:00 or 17:00 UTC). */
export function dayToDate(day: string): Date {
  return new Date(`${day}T16:00:00Z`);
}

export function isIsoDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** The next `count` days starting at `from` (inclusive). */
export function nextDays(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

function tzOffsetMs(at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant of a Toronto wall-clock time ("2026-11-14", "18:30"). */
export function torontoInstant(day: string, hhmm: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const [hh = 0, mm = 0] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffsetMs(new Date(guess));
  t = guess - tzOffsetMs(new Date(t));
  return new Date(t);
}

// ---------------------------------------------------------------------------
// Tiffin
// ---------------------------------------------------------------------------
/** Per-period price: base for one serving, extra servings, and the delivery fee when delivered (API: priceFor). */
export function planPriceCents(plan: Pick<tiffinApi.PlanDto, "priceCents" | "extraServingCents" | "deliveryFeeCents">, servings: number, fulfilment: tiffinApi.TiffinFulfilment): number {
  return plan.priceCents + plan.extraServingCents * Math.max(0, servings - 1) + (fulfilment === "delivery" ? plan.deliveryFeeCents : 0);
}

/** Fulfilments a plan allows, delivery first. */
export function planFulfilments(plan: Pick<tiffinApi.PlanDto, "deliveryAllowed" | "pickupAllowed">): tiffinApi.TiffinFulfilment[] {
  return [...(plan.deliveryAllowed ? (["delivery"] as const) : []), ...(plan.pickupAllowed ? (["pickup"] as const) : [])];
}

/** Earliest start: tomorrow (today's meals are already past cutoff for any plan with a cutoff). */
export function earliestStart(plan: Pick<tiffinApi.PlanDto, "cutoffHours">, today: string): string {
  return addDays(today, plan.cutoffHours >= 24 ? 1 : 0);
}

/** First day on or after `from` the plan serves a meal. */
export function firstServiceDay(daysOfWeek: number[], from: string): string {
  let d = from;
  for (let i = 0; i < 8; i++, d = addDays(d, 1)) if (daysOfWeek.includes(weekdayOf(d))) return d;
  return from;
}

/** Canadian postal code, "L4T 1A1". Loose on purpose: the API takes 3 to 10 characters. */
export function normalizePostalCode(s: string): string {
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return c.length > 3 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}
export function isPostalCode(s: string): boolean {
  return /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(s.trim());
}

export type CountdownParts = { kind: "passed" } | { kind: "dh"; d: number; h: number } | { kind: "hm"; h: number; m: number } | { kind: "m"; m: number };

/** Time left to a cutoff, in the largest two units. */
export function countdownParts(cutoffAt: string | Date, now: number = Date.now()): CountdownParts {
  const ms = new Date(cutoffAt).getTime() - now;
  if (!(ms > 0)) return { kind: "passed" };
  const mins = Math.floor(ms / 60_000);
  if (mins >= 24 * 60) return { kind: "dh", d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60) };
  if (mins >= 60) return { kind: "hm", h: Math.floor(mins / 60), m: mins % 60 };
  return { kind: "m", m: Math.max(1, mins) };
}

export type SubStanding = "pending" | "active" | "paused" | "past_due" | "cancelled";

/** Which actions the subscription screen offers. */
export function subscriptionActions(sub: Pick<tiffinApi.MySubscriptionDto, "status" | "pausedUntil">, today: string) {
  const live = sub.status === "active" || sub.status === "paused" || sub.status === "past_due";
  return {
    canSkip: sub.status === "active",
    canPause: sub.status === "active",
    canResume: sub.status === "paused" || (!!sub.pausedUntil && sub.pausedUntil > today && sub.status === "active"),
    canCancel: live || sub.status === "pending",
    canEdit: live,
    canRetry: sub.status === "past_due" || sub.status === "pending",
  };
}

/** Whether the customer can still skip a meal-day: the API says so, and the cutoff has not passed on this phone's clock. */
export function canStillSkip(u: Pick<tiffinApi.UpcomingDelivery, "canSkip" | "cutoffAt" | "status">, now: number = Date.now()): boolean {
  return u.canSkip && u.status === "scheduled" && new Date(u.cutoffAt).getTime() > now;
}

/** A skipped day can be put back until its cutoff (the skip credit is only given before it). */
export function canUndoSkip(u: Pick<tiffinApi.UpcomingDelivery, "cutoffAt" | "status">, now: number = Date.now()): boolean {
  return u.status === "skipped" && new Date(u.cutoffAt).getTime() > now;
}

/** Message key for a delivery status badge. */
export function deliveryStatusKey(status: tiffinApi.UpcomingDelivery["status"]): MessageKey {
  switch (status) {
    case "skipped":
      return "tiffin.skipped";
    case "paused":
      return "tiffin.paused";
    case "on_hold":
      return "rest.tiffin.onHold";
    case "out_for_delivery":
      return "rest.tiffin.outForDelivery";
    case "delivered":
      return "rest.tiffin.delivered";
    case "picked_up":
      return "rest.tiffin.pickedUp";
    case "missed":
      return "rest.tiffin.missed";
    default:
      return "rest.tiffin.scheduled";
  }
}

// ---------------------------------------------------------------------------
// Dietary badges (the shop's own claims)
// ---------------------------------------------------------------------------
export type DietaryLike = restaurantApi.DietaryTagsInput | tiffinApi.Dietary | null | undefined;

const BADGE_ORDER = ["zabihah", "halal", "vegetarian", "vegan", "jain", "glutenFree"] as const;
export type DietBadge = (typeof BADGE_ORDER)[number];

/** Badges for one item or plan, in display order. Zabihah is shown instead of plain halal; vegan instead of vegetarian. */
export function dietBadges(d: DietaryLike): DietBadge[] {
  if (!d) return [];
  const out: DietBadge[] = [];
  if (d.zabihah) out.push("zabihah");
  else if (d.halal) out.push("halal");
  if (d.vegan) out.push("vegan");
  else if (d.vegetarian) out.push("vegetarian");
  if (d.jain) out.push("jain");
  if (d.glutenFree) out.push("glutenFree");
  return out.sort((a, b) => BADGE_ORDER.indexOf(a) - BADGE_ORDER.indexOf(b));
}

export interface DietSummary {
  /** "all": every tagged item has it; "some": at least one. */
  halal: "all" | "some" | null;
  zabihah: boolean;
  veg: "all" | "some" | null;
  /** Highest spice level on the menu, null when nothing is tagged. */
  maxSpice: number | null;
  certifiers: string[];
}

/** Shop-level summary of its items' tags (Halal here means "the shop says so", never our claim). */
export function summarizeDiet(list: DietaryLike[]): DietSummary {
  const items = list.filter((d): d is NonNullable<DietaryLike> => !!d);
  const total = list.length;
  const isHalal = (d: NonNullable<DietaryLike>) => !!(d.halal || d.zabihah);
  const isVeg = (d: NonNullable<DietaryLike>) => !!(d.vegetarian || d.vegan || d.jain);
  const count = (f: (d: NonNullable<DietaryLike>) => boolean) => items.filter(f).length;
  const level = (n: number): "all" | "some" | null => (n === 0 ? null : n === total ? "all" : "some");
  const spices = items.map((d) => d.spice).filter((s): s is 0 | 1 | 2 | 3 => s !== undefined);
  return {
    halal: level(count(isHalal)),
    zabihah: items.some((d) => d.zabihah),
    veg: level(count(isVeg)),
    maxSpice: spices.length ? Math.max(...spices) : null,
    certifiers: [...new Set(items.map((d) => d.halalCertifier?.trim()).filter((c): c is string => !!c))],
  };
}

/**
 * Client-side fallback for the directory filter: older servers ignore `?halal=`, so keep a shop when
 * the API marked its menu halal (`halalMenu`), or when a `dietary` / `tags` field on the payload says so.
 * TODO(api): drop the fallback once every deployed API honours `halal=1|all` on GET /v1/network/shops.
 */
export function shopMatchesHalal(shop: { halalMenu?: "all" | "some"; dietary?: DietaryLike; tags?: string[] | null }, mode: "1" | "all"): boolean {
  if (shop.halalMenu) return mode === "all" ? shop.halalMenu === "all" : true;
  if (shop.dietary && (shop.dietary.halal || shop.dietary.zabihah)) return true;
  const tags = (shop.tags ?? []).map((t) => t.toLowerCase());
  return tags.includes("halal") || tags.includes("zabihah");
}

// ---------------------------------------------------------------------------
// Catering
// ---------------------------------------------------------------------------
export const CATERING_STEPS = ["inquiry", "tasting", "quoted", "confirmed"] as const;

export interface CateringStep {
  status: (typeof CATERING_STEPS)[number];
  state: "done" | "current" | "todo";
  /** ISO time when known (tasting appointment, quote sent, deposit paid). */
  at: string | null;
}

/** Inquiry → tasting → quoted → confirmed; a tasting is optional, so a quote can skip it. Completed events show every step done. */
export function cateringTimeline(e: Pick<restaurantApi.CateringEventDto, "status" | "createdAt" | "tastingAt" | "quoteSentAt" | "depositPaidAt" | "approvedAt">): CateringStep[] {
  const at: Record<(typeof CATERING_STEPS)[number], string | null> = { inquiry: e.createdAt, tasting: e.tastingAt, quoted: e.quoteSentAt, confirmed: e.depositPaidAt ?? e.approvedAt };
  const idx = e.status === "completed" ? CATERING_STEPS.length : e.status === "cancelled" ? -1 : CATERING_STEPS.indexOf(e.status as (typeof CATERING_STEPS)[number]);
  return CATERING_STEPS.map((status, i) => ({ status, at: at[status], state: idx === -1 ? (i === 0 ? "done" : "todo") : i < idx ? "done" : i === idx ? (e.status === "confirmed" ? "done" : "current") : "todo" }));
}

/** The quote can be approved in the web view once it is sent and not yet confirmed. */
export function canApproveQuote(e: Pick<restaurantApi.CateringEventDto, "status" | "approvalUrl">): boolean {
  return e.status === "quoted" && !!e.approvalUrl;
}

/** `/e/<token>` from an approval URL (or a bare path), for the in-app deep link. */
export function approvalToken(url: string | null | undefined): string | null {
  const m = url?.match(/\/e\/([^/?#]+)/);
  return m?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Banquet
// ---------------------------------------------------------------------------
export const HALL_START_TIMES = ["11:00", "12:00", "17:00", "18:00", "19:00"] as const;
export const HALL_HOURS = [3, 4, 5, 6] as const;

/** Hold window for a day, a start time and a duration in hours. */
export function holdWindow(day: string, startHhmm: string, hours: number): { startsAt: string; endsAt: string } {
  const start = torontoInstant(day, startHhmm);
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + hours * 3_600_000).toISOString() };
}

export interface BusyWindow {
  bookingId: string;
  status: restaurantApi.HallBookingStatus;
  startsAt: string;
  endsAt: string;
}

/** Busy windows that touch a Toronto calendar day. */
export function busyOnDay(busy: BusyWindow[], day: string): BusyWindow[] {
  const from = torontoInstant(day, "00:00").getTime();
  const to = torontoInstant(addDays(day, 1), "00:00").getTime();
  return busy.filter((b) => new Date(b.startsAt).getTime() < to && new Date(b.endsAt).getTime() > from);
}

/** Does a proposed window overlap anything busy? */
export function overlapsBusy(busy: BusyWindow[], startsAt: string, endsAt: string): boolean {
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  return busy.some((b) => new Date(b.startsAt).getTime() < e && new Date(b.endsAt).getTime() > s);
}

/** Cheapest package per head, or null when the hall has none. */
export function fromPerHeadCents(hall: Pick<restaurantApi.HallDto, "packages">): number | null {
  return hall.packages.length ? Math.min(...hall.packages.map((p) => p.perHeadCents)) : null;
}

/** Hold left, in the largest two units (same shape as the tiffin cutoff). "passed" once it lapses. */
export function holdLeft(b: Pick<restaurantApi.HallBookingDto, "status" | "holdExpiresAt">, now: number = Date.now()): CountdownParts | null {
  if (b.status !== "hold" || !b.holdExpiresAt) return null;
  return countdownParts(b.holdExpiresAt, now);
}

export function bookingNeedsDeposit(b: Pick<restaurantApi.HallBookingDto, "status" | "depositCents" | "depositPaidAt" | "holdExpiresAt">, now: number = Date.now()): boolean {
  return b.status === "hold" && b.depositCents > 0 && !b.depositPaidAt && (!b.holdExpiresAt || new Date(b.holdExpiresAt).getTime() > now);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
/**
 * Where a Stripe PaymentIntent is confirmed until the app ships the Stripe SDK: the web pay page
 * (same pattern as invoices, tickets/[id].tsx). The secret travels in the query because the page has
 * nothing else to look the intent up by. TODO(web): build /pay/intent/[id] (Payment Element, returns to ll://).
 */
export function paymentUrl(webUrl: string, p: { paymentIntentId: string; clientSecret: string }): string {
  return `${webUrl.replace(/\/+$/, "")}/pay/intent/${encodeURIComponent(p.paymentIntentId)}?cs=${encodeURIComponent(p.clientSecret)}`;
}

// ---------------------------------------------------------------------------
// Notification routing
// ---------------------------------------------------------------------------
/**
 * Tiffin pushes (tiffin_update: out for delivery, delivered, payment failed, renewal; tiffin_menu: tomorrow's menu)
 * carry `subscriptionId` and no `screen`; they open the subscription. Null for anything else.
 */
export function tiffinRoute(data: { type?: string; screen?: string; subscriptionId?: unknown } | null | undefined): string | null {
  const id = typeof data?.subscriptionId === "string" ? data.subscriptionId : "";
  if (!id) return null;
  return data?.type === "tiffin_update" || data?.type === "tiffin_menu" || data?.screen === "tiffin" ? `/tiffin/${encodeURIComponent(id)}` : null;
}
