/**
 * Rebooking nudges (service.rebooking): bring regulars back at their usual interval, once per cycle, in their own language.
 *
 * "Due" is computed, never stored: the last completed visit (an appointment marked completed, or a paid invoice with a line
 * from the price list) plus services.rebookAfterDays. rebooking_nudges records what we did (sent, skipped, snoozed) so a
 * customer is nudged at most once per service per cycle and never more than twice without a visit in between.
 *
 * A nudge is a commercial message (CASL): it only goes to members with marketing consent who have not muted the shop, it names
 * the shop, and an SMS carries "Reply STOP". The STOP reply is handled by messaging.handleInboundSms, which withdraws consent
 * everywhere, so a customer who replied STOP drops out of every list here on the next read.
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { appointments, invoices, merchantMembers, merchants, pushTokens, rebookingNudges, services, users, webPushSubscriptions } from "@ll/db";
import { normalizeLocale, rungsFor, serviceApi, t, type ChannelPref, type LadderRung, type Locale } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { memberRhythms } from "./member-stats.js";
import { isPharmacy } from "./pharmacy-guard.js";
import { getMerchantFeatures, requireFeature } from "./features.js";
import { localDate, reserveSmsCredits, smsAllowance, unsubscribeHeaders, unsubscribeUrl } from "./messaging.js";
import { recordSignal } from "./signals.js"; // phase-pro: p3
import { sendWebPush } from "./web-push.js";
import { messageDeliveries } from "@ll/db";
import { inQuietHours } from "./notifications.js";
import { isSuppressed, optedOutSet, sendSms } from "./opt-out.js";

type Merchant = typeof merchants.$inferSelect;
const DAY_MS = 86_400_000;
const WINDOW_MONTHS = 24;
/** A customer who has not visited in this long is left alone. */
const MAX_AGE_DAYS = 730;
const UNANSWERED_LIMIT = 2;
/** Automatic mode reminds a client this many days before they are due ("Clients are reminded 3 days before they're due"). */
export const REMIND_BEFORE_DAYS = 3;
export const REBOOKING_MODES = serviceApi.REBOOKING_MODES;
export type RebookingMode = serviceApi.RebookingMode;


export interface Candidate {
  userId: string;
  serviceId: string;
  serviceName: string;
  customerName: string | null;
  customerPhone: string | null;
  locale: Locale;
  lastVisitAt: Date;
  rebookAfterDays: number;
  dueOn: string;
  daysLate: number;
  state: "due" | "late" | "snoozed";
  /** The first rung that can reach them (app push, web push, email, then text); the send walks on to the next if it fails. */
  channel: RebookChannel;
  rungs: RebookChannel[];
  /** Who they saw last time, so the book-again link opens on the same stylist. */
  staffId: string | null;
  canSend: boolean;
  memberId: string | null;
}

export type RebookChannel = "push" | "web_push" | "email" | "sms";

/** How each person can be reached, ahead of the ladder: app push, web push, email and text, in the order their channel preference at the shop allows. */
async function loadReach(ctx: AppContext, merchantId: string, userIds: string[]) {
  const [tokens, subs, people, prefs] = await Promise.all([
    ctx.db.select({ userId: pushTokens.userId }).from(pushTokens).where(inArray(pushTokens.userId, userIds)),
    ctx.db.select({ userId: webPushSubscriptions.userId }).from(webPushSubscriptions).where(inArray(webPushSubscriptions.userId, userIds)),
    ctx.db.select({ id: users.id, email: users.email, phone: users.phone }).from(users).where(inArray(users.id, userIds)),
    ctx.db.select({ userId: merchantMembers.userId, pref: merchantMembers.channelPref }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchantId), inArray(merchantMembers.userId, userIds))),
  ]);
  const hasPush = new Set(tokens.map((x) => x.userId));
  const hasWeb = new Set(subs.map((x) => x.userId));
  const email = new Map(people.map((x) => [x.id, x.email]));
  const pref = new Map(prefs.map((x) => [x.userId, x.pref as ChannelPref]));
  const stopped = await optedOutSet(ctx.db, people.map((x) => x.phone), "sms");
  return {
    rungs(userId: string, phone: string | null): RebookChannel[] {
      const ok: Record<LadderRung, boolean> = { push: hasPush.has(userId), web_push: hasWeb.has(userId), email: !!email.get(userId), sms: !!phone && !isSuppressed(stopped, phone) };
      return rungsFor(pref.get(userId) ?? "best").filter((r) => ok[r]);
    },
  };
}

const addDaysLocal = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/**
 * Who is due: customers whose last completed service plus its rebook days has come (the price-list rules), and regulars the shop already
 * knows from its visit history (counter stamps included) who have gone quiet against their own rhythm. The second group is what a shop
 * that only stamps cards has, and it is the same list Home calls "slipping away".
 */
export async function rebookingCandidates(ctx: AppContext, merchant: Merchant): Promise<Candidate[]> {
  if (isPharmacy(merchant)) return [];
  const byService = await serviceCandidates(ctx, merchant);
  const regulars = await regularCandidates(ctx, merchant, new Set(byService.map((c) => c.userId)));
  return [...byService, ...regulars].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || (a.customerName ?? "").localeCompare(b.customerName ?? ""));
}

/** A regular who comes in without booking a service has no service to rebook: their rows carry this id and say "your last visit". */
export const REGULAR_SERVICE_ID = "00000000-0000-0000-0000-000000000000";

async function regularCandidates(ctx: AppContext, merchant: Merchant, covered: Set<string>): Promise<Candidate[]> {
  const now = ctx.now();
  const today = localDate(now, merchant.timezone);
  const rhythms = await memberRhythms(ctx.db, merchant.id, merchant.timezone, now);
  const slipping = [...rhythms.entries()].filter(([, r]) => r.isSlipping && r.lastVisitAt).map(([memberId, r]) => ({ memberId, at: r.lastVisitAt! }));
  if (!slipping.length) return [];
  const rows = await ctx.db
    .select({ memberId: merchantMembers.id, userId: merchantMembers.userId, consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted, name: users.name, phone: users.phone, locale: users.locale, deletedAt: users.deletedAt })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(and(eq(merchantMembers.merchantId, merchant.id), inArray(merchantMembers.id, slipping.map((x) => x.memberId))));
  const userIds = rows.map((r) => r.userId).filter((u) => !covered.has(u));
  if (!userIds.length) return [];
  const [reach, future, nudges] = await Promise.all([
    loadReach(ctx, merchant.id, userIds),
    ctx.db.select({ userId: appointments.userId }).from(appointments).where(and(eq(appointments.merchantId, merchant.id), inArray(appointments.status, ["booked", "arrived", "in_service"]), gte(appointments.startsAt, now), inArray(appointments.userId, userIds))),
    ctx.db.select().from(rebookingNudges).where(and(eq(rebookingNudges.merchantId, merchant.id), eq(rebookingNudges.serviceId, REGULAR_SERVICE_ID), inArray(rebookingNudges.userId, userIds))).orderBy(desc(rebookingNudges.createdAt)),
  ]);
  const hasFuture = new Set(future.map((f) => f.userId));
  const rules = await ctx.db.select({ d: services.rebookAfterDays }).from(services).where(and(eq(services.merchantId, merchant.id), eq(services.active, true), isNotNull(services.rebookAfterDays)));
  const gap = rules.length ? [...rules.map((r) => r.d!)].sort((a, b) => a - b)[Math.floor(rules.length / 2)]! : 42;
  const out: Candidate[] = [];
  for (const r of rows) {
    if (r.deletedAt || covered.has(r.userId) || hasFuture.has(r.userId)) continue;
    const at = slipping.find((x) => x.memberId === r.memberId)!.at;
    const lastDay = localDate(at, merchant.timezone);
    if (daysBetween(lastDay, today) > MAX_AGE_DAYS) continue;
    const mine = nudges.filter((n) => n.userId === r.userId && n.createdAt > at);
    if (mine.some((n) => n.action === "skipped")) continue;
    const sent = mine.filter((n) => n.action === "sent");
    if (sent.length >= UNANSWERED_LIMIT) continue;
    if (sent.length === 1 && now.getTime() < sent[0]!.createdAt.getTime() + gap * DAY_MS) continue;
    const snooze = mine.find((n) => n.action === "snoozed" && n.until && n.until > now);
    const dueOn = addDaysLocal(lastDay, gap);
    const rungs = reach.rungs(r.userId, r.phone);
    out.push({
      userId: r.userId,
      serviceId: REGULAR_SERVICE_ID,
      serviceName: "Your last visit",
      customerName: r.name,
      customerPhone: r.phone,
      locale: normalizeLocale(r.locale) ?? "en",
      lastVisitAt: at,
      rebookAfterDays: gap,
      dueOn,
      daysLate: Math.max(1, daysBetween(dueOn, today)),
      state: snooze ? "snoozed" : "late",
      channel: rungs[0] ?? "sms",
      rungs,
      staffId: null,
      canSend: !!r.consent && !r.muted && rungs.length > 0,
      memberId: r.memberId,
    });
  }
  return out;
}

async function serviceCandidates(ctx: AppContext, merchant: Merchant): Promise<Candidate[]> {
  // A "time for your next flu shot" text would tie a person to a pharmacy service: pharmacies get no rebooking reminders.
  if (isPharmacy(merchant)) return [];
  const now = ctx.now();
  const today = localDate(now, merchant.timezone);
  const rules = await ctx.db.select().from(services).where(and(eq(services.merchantId, merchant.id), eq(services.active, true), isNotNull(services.rebookAfterDays)));
  if (!rules.length) return [];
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const since = new Date(now.getTime() - WINDOW_MONTHS * 30 * DAY_MS);

  // Last completed visit per (customer, service).
  const last = new Map<string, { userId: string; serviceId: string; at: Date; staffId: string | null }>();
  const note = (userId: string | null, serviceId: string | null | undefined, at: Date | null, staffId: string | null = null) => {
    if (!userId || !serviceId || !at || !ruleById.has(serviceId)) return;
    const k = `${userId}|${serviceId}`;
    const cur = last.get(k);
    if (!cur || cur.at < at) last.set(k, { userId, serviceId, at, staffId });
  };
  const done = await ctx.db
    .select({ userId: appointments.userId, items: appointments.items, at: appointments.completedAt, endsAt: appointments.endsAt, staffId: appointments.staffId })
    .from(appointments)
    .where(and(eq(appointments.merchantId, merchant.id), eq(appointments.status, "completed"), gte(appointments.endsAt, since)));
  for (const a of done) for (const it of a.items) note(a.userId, it.serviceId, a.at ?? a.endsAt, a.staffId);
  const paid = await ctx.db
    .select({ userId: invoices.userId, lines: invoices.lineItems, at: invoices.paidAt })
    .from(invoices)
    .where(and(eq(invoices.merchantId, merchant.id), eq(invoices.status, "paid"), gte(invoices.paidAt, since)));
  for (const p of paid) for (const l of p.lines) note(p.userId, l.serviceId, p.at);
  if (!last.size) return [];

  const userIds = [...new Set([...last.values()].map((v) => v.userId))];
  const [people, members, reach, future, nudges] = await Promise.all([
    ctx.db.select({ id: users.id, name: users.name, phone: users.phone, locale: users.locale, deletedAt: users.deletedAt }).from(users).where(inArray(users.id, userIds)),
    ctx.db.select({ id: merchantMembers.id, userId: merchantMembers.userId, consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchant.id), inArray(merchantMembers.userId, userIds))),
    loadReach(ctx, merchant.id, userIds),
    ctx.db
      .select({ userId: appointments.userId })
      .from(appointments)
      .where(and(eq(appointments.merchantId, merchant.id), inArray(appointments.status, ["booked", "arrived", "in_service"]), gte(appointments.startsAt, now), inArray(appointments.userId, userIds))),
    ctx.db.select().from(rebookingNudges).where(and(eq(rebookingNudges.merchantId, merchant.id), inArray(rebookingNudges.userId, userIds))).orderBy(desc(rebookingNudges.createdAt)),
  ]);
  const person = new Map(people.map((p) => [p.id, p]));
  const member = new Map(members.map((m) => [m.userId, m]));
  const hasFuture = new Set(future.map((f) => f.userId));

  const out: Candidate[] = [];
  for (const v of last.values()) {
    const u = person.get(v.userId);
    if (!u || u.deletedAt || hasFuture.has(v.userId)) continue;
    const rule = ruleById.get(v.serviceId)!;
    const lastDay = localDate(v.at, merchant.timezone);
    const dueOn = addDaysLocal(lastDay, rule.rebookAfterDays!);
    const daysLate = daysBetween(dueOn, today);
    if (daysBetween(lastDay, today) > MAX_AGE_DAYS) continue;
    if (daysLate < -7) continue; // not due this week
    const mine = nudges.filter((n) => n.userId === v.userId && n.serviceId === v.serviceId && n.createdAt > v.at);
    if (mine.some((n) => n.action === "skipped")) continue;
    const sent = mine.filter((n) => n.action === "sent");
    if (sent.length >= UNANSWERED_LIMIT) continue;
    if (sent.length === 1 && now.getTime() < sent[0]!.createdAt.getTime() + rule.rebookAfterDays! * DAY_MS) continue;
    const snooze = mine.find((n) => n.action === "snoozed" && n.until && n.until > now);
    const m = member.get(v.userId);
    // A number that replied STOP to any text drops the text rung, whatever the consent record says (loadReach).
    const rungs = reach.rungs(v.userId, u.phone);
    const consented = !!m?.consent && !m.muted;
    out.push({
      userId: v.userId,
      serviceId: v.serviceId,
      serviceName: rule.name,
      customerName: u.name,
      customerPhone: u.phone,
      locale: normalizeLocale(u.locale) ?? "en",
      lastVisitAt: v.at,
      rebookAfterDays: rule.rebookAfterDays!,
      dueOn,
      daysLate,
      state: snooze ? "snoozed" : daysLate > 0 ? "late" : "due",
      channel: rungs[0] ?? "sms",
      rungs,
      staffId: v.staffId,
      canSend: consented && rungs.length > 0,
      memberId: m?.id ?? null,
    });
  }
  // Snoozed rows whose snooze has not ended stay visible only on the snoozed tab (handled by the caller); sort oldest due first.
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || (a.customerName ?? "").localeCompare(b.customerName ?? ""));
}

export async function rebookingOverview(ctx: AppContext, merchant: Merchant, state: "due" | "late" | "snoozed"): Promise<serviceApi.RebookingResponse> {
  const all = await rebookingCandidates(ctx, merchant);
  const live = all.filter((c) => c.state !== "snoozed");
  const counts = { due: live.length, late: live.filter((c) => c.state === "late").length, snoozed: all.filter((c) => c.state === "snoozed").length };
  const shown = state === "snoozed" ? all.filter((c) => c.state === "snoozed") : state === "late" ? live.filter((c) => c.state === "late") : live;
  return {
    items: shown.map((c) => ({
      userId: c.userId,
      serviceId: c.serviceId,
      customerName: c.customerName,
      customerPhone: c.customerPhone,
      serviceName: c.serviceName,
      lastVisitAt: c.lastVisitAt.toISOString(),
      rebookAfterDays: c.rebookAfterDays,
      dueOn: c.dueOn,
      daysLate: Math.max(0, c.daysLate),
      channel: c.channel,
      language: c.locale,
      state: c.state,
      canSend: c.canSend,
    })),
    counts,
    settings: await rebookingSettings(ctx, merchant),
    stats: await rebookingStats(ctx, merchant, counts.due),
  };
}

/** The mode as the owner should see it: "auto" only counts while the plan includes it (a trial that ended falls back to review until she picks Pro). */
export async function rebookingSettings(ctx: AppContext, merchant: Merchant): Promise<serviceApi.RebookingSettings> {
  const mode = normalizeMode(merchant.rebookingMode);
  const included = (await getMerchantFeatures(ctx.db, merchant))["service.rebooking"].enabled;
  const effective: RebookingMode = mode === "auto" && !included ? "review" : mode;
  return { auto: effective === "auto", mode: effective, canAuto: included };
}
const normalizeMode = (m: string): RebookingMode => ((REBOOKING_MODES as readonly string[]).includes(m) ? (m as RebookingMode) : "review");

async function rebookingStats(ctx: AppContext, merchant: Merchant, dueCount: number): Promise<serviceApi.RebookingResponse["stats"]> {
  const now = ctx.now();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const sent = await ctx.db.select().from(rebookingNudges).where(and(eq(rebookingNudges.merchantId, merchant.id), eq(rebookingNudges.action, "sent"), gte(rebookingNudges.createdAt, since)));
  let booked = 0;
  for (const n of sent) {
    if (n.bookedAppointmentId) {
      booked++;
      continue;
    }
    const end = new Date(n.createdAt.getTime() + 7 * DAY_MS);
    const [a] = await ctx.db.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.merchantId, merchant.id), eq(appointments.userId, n.userId), gte(appointments.createdAt, n.createdAt), sql`${appointments.createdAt} <= ${end.toISOString()}::timestamptz`, sql`${appointments.status} <> 'cancelled'`)).limit(1);
    if (a) {
      booked++;
      continue;
    }
    const [p] = await ctx.db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.merchantId, merchant.id), eq(invoices.userId, n.userId), eq(invoices.status, "paid"), gte(invoices.paidAt, n.createdAt), sql`${invoices.paidAt} <= ${end.toISOString()}::timestamptz`)).limit(1);
    if (p) booked++;
  }
  const [opt] = await ctx.db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchant.id), sql`(${merchantMembers.muted} = true or ${merchantMembers.marketingConsentSource} like 'withdrawn:%')`));
  return { dueThisWeek: dueCount, sentLast30: sent.length, sentSms: sent.filter((n) => n.channel === "sms").length, sentPush: sent.filter((n) => n.channel === "push" || n.channel === "web_push").length, sentEmail: sent.filter((n) => n.channel === "email").length, bookedWithin7Days: booked, nudgedCount: sent.length, optedOut: opt?.n ?? 0 };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function candidateFor(ctx: AppContext, merchant: Merchant, userId: string, serviceId: string): Promise<Candidate> {
  const c = (await rebookingCandidates(ctx, merchant)).find((x) => x.userId === userId && x.serviceId === serviceId);
  if (!c) throw conflict("That customer isn't due for this service right now.");
  return c;
}

/** The book-again link: the service, the stylist they saw last time and the nudge id that counts the booking. */
export function bookAgainUrl(ctx: AppContext, merchant: Pick<Merchant, "slug">, c: Pick<Candidate, "locale" | "serviceId" | "staffId">, nudgeId: string, opts: { withStaff?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (c.serviceId !== REGULAR_SERVICE_ID) q.set("service", c.serviceId);
  if (c.staffId && opts.withStaff !== false) q.set("staff", c.staffId);
  q.set("rebook", nudgeId);
  if (c.locale !== "en") q.set("lang", c.locale);
  return `${ctx.config.publicWebUrl}/shops/${merchant.slug}/book?${q.toString()}`;
}

/**
 * What a customer gets, in their language. The text names the shop and ends with the STOP line (one segment: the link leaves the stylist off);
 * the push, web push and email say the same thing without it, and the email carries the unsubscribe footer.
 */
export function nudgeText(ctx: AppContext, merchant: Merchant, c: Pick<Candidate, "locale" | "customerName" | "serviceName" | "lastVisitAt" | "serviceId" | "staffId">, now: Date, nudgeId = "") {
  const weeks = Math.max(1, Math.round((now.getTime() - c.lastVisitAt.getTime()) / (7 * DAY_MS)));
  const name = (c.customerName ?? "").trim().split(/\s+/)[0] || "";
  const clean = (x: string) => x.replace(/^\s*,\s*/, "");
  if (c.serviceId === REGULAR_SERVICE_ID) {
    const url = nudgeId ? bookAgainUrl(ctx, merchant, c, nudgeId) : `${ctx.config.publicWebUrl}/shops/${merchant.slug}${c.locale === "en" ? "" : `?lang=${c.locale}`}`;
    const vars = { name, shop: merchant.name, weeks, url };
    return { title: t(c.locale, "sv.msg.rebookRegularTitle", vars), body: clean(t(c.locale, "sv.msg.rebookRegular", vars)), short: clean(t(c.locale, "rb.msg.regularShort", vars)), url };
  }
  const textUrl = nudgeId ? bookAgainUrl(ctx, merchant, c, nudgeId, { withStaff: false }) : `${ctx.config.publicWebUrl}/shops/${merchant.slug}/book?service=${c.serviceId}${c.locale === "en" ? "" : `&lang=${c.locale}`}`;
  const url = nudgeId ? bookAgainUrl(ctx, merchant, c, nudgeId) : textUrl;
  const vars = { name, service: c.serviceName, shop: merchant.name, weeks, url: textUrl };
  return { title: t(c.locale, "sv.msg.rebookTitle", vars), body: clean(t(c.locale, "sv.msg.rebook", vars)), short: clean(t(c.locale, "rb.msg.short", { ...vars, url })), url };
}

export async function sendNudge(ctx: AppContext, merchant: Merchant, userId: string, serviceId: string, opts: { quietHours?: boolean } = {}): Promise<{ channel: RebookChannel }> {
  return deliverNudge(ctx, merchant, await candidateFor(ctx, merchant, userId, serviceId), opts);
}

/**
 * Walk the client's rungs, cheapest first, until one reaches them: app push, web push, email, then a text out of the shop's allowance.
 * The nudge row is written first so its id is in the link; it is removed again if no rung worked, so a failed send does not use up the cycle.
 */
async function deliverNudge(ctx: AppContext, merchant: Merchant, c: Candidate, opts: { quietHours?: boolean }): Promise<{ channel: RebookChannel }> {
  const { userId, serviceId } = c;
  if (!c.canSend) throw new HttpError(409, "no_consent", "This customer hasn't agreed to messages from your shop, so we can't send this.");
  const now = ctx.now();
  const [nudge] = await ctx.db.insert(rebookingNudges).values({ merchantId: merchant.id, userId, serviceId, action: "sent", channel: null, createdAt: now }).returning();
  const text = nudgeText(ctx, merchant, c, now, nudge!.id);
  let reached: RebookChannel | null = null;
  let blocked: HttpError | null = null;
  for (const rung of c.rungs) {
    if (rung === "push") {
      const toks = await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, userId));
      if (!toks.length) continue;
      const res = await ctx.providers.push.send(toks.map((x) => ({ token: x.token, title: text.title, body: `${text.short} (${merchant.name} · mute this shop in the app to stop offers)`, data: { type: "rebook", merchantId: merchant.id, serviceId, rebook: nudge!.id, url: text.url } })));
      for (const x of toks) await ctx.db.insert(messageDeliveries).values({ userId, merchantId: merchant.id, channel: "push", to: x.token, body: text.short, kind: "marketing", status: res.failed ? "failed" : "sent" });
      if (!res.failed) reached = "push";
    } else if (rung === "web_push") {
      const n = await sendWebPush(ctx, userId, { title: text.title, body: text.short, url: new URL(text.url).pathname + new URL(text.url).search, tag: `rebook-${nudge!.id}` });
      if (n > 0) reached = "web_push";
    } else if (rung === "email") {
      const [u] = await ctx.db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (!u?.email) continue;
      const footer = c.memberId ? `\n\n—\nSent by ${merchant.name} via Local Loyalty because you opted in to offers from them.\nUnsubscribe: ${unsubscribeUrl(ctx, c.memberId)}` : "";
      const body = `${text.short}${footer}`;
      try {
        const r = await ctx.providers.email.send({ to: u.email, subject: text.title, text: body, ...(c.memberId ? { headers: unsubscribeHeaders(ctx, c.memberId) } : {}) });
        await ctx.db.insert(messageDeliveries).values({ userId, merchantId: merchant.id, channel: "email", to: u.email, body, kind: "marketing", status: "sent", providerId: r.id });
        reached = "email";
      } catch (err) {
        await ctx.db.insert(messageDeliveries).values({ userId, merchantId: merchant.id, channel: "email", to: u.email, body, kind: "marketing", status: "failed", error: err instanceof Error ? err.message.slice(0, 500) : "send failed" });
      }
    } else {
      if (opts.quietHours && inQuietHours(now, merchant.timezone)) {
        blocked = conflict("Quiet hours: we don't text overnight.");
        continue;
      }
      if (!(await reserveSmsCredits(ctx.db, merchant, 1))) {
        blocked = new HttpError(402, "sms_credits_exhausted", `This needs 1 SMS credit but you have none left this month.`, { needed: 1, remaining: Math.max(0, smsAllowance(merchant) - merchant.smsCreditsUsed) });
        continue;
      }
      const [u] = await ctx.db.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
      let status = "sent";
      let providerId: string | null = null;
      let error: string | null = null;
      try {
        const r = await sendSms(ctx, u!.phone!, text.body);
        if (!r) {
          status = "skipped";
          error = "opted_out";
        } else providerId = r.id;
      } catch (err) {
        status = "failed";
        error = err instanceof Error ? err.message.slice(0, 500) : "send failed";
      }
      await ctx.db.insert(messageDeliveries).values({ userId, merchantId: merchant.id, channel: "sms", to: u!.phone!, body: text.body, kind: "marketing", status, providerId, error });
      if (status === "sent") reached = "sms";
      else if (status === "failed") blocked = new HttpError(502, "send_failed", "The text didn't go through. Try again in a minute.");
    }
    if (reached) break;
  }
  if (!reached) {
    await ctx.db.delete(rebookingNudges).where(eq(rebookingNudges.id, nudge!.id));
    throw blocked ?? new HttpError(502, "send_failed", "We couldn't reach this customer. Try again later.");
  }
  await ctx.db.update(rebookingNudges).set({ channel: reached }).where(eq(rebookingNudges.id, nudge!.id));
  await recordSignal(ctx, merchant.id, "rebook_sent", { count: 1 });
  return { channel: reached };
}

export async function skipNudge(ctx: AppContext, merchant: Merchant, userId: string, serviceId: string) {
  await candidateFor(ctx, merchant, userId, serviceId);
  await ctx.db.insert(rebookingNudges).values({ merchantId: merchant.id, userId, serviceId, action: "skipped" });
}

export async function snoozeNudge(ctx: AppContext, merchant: Merchant, userId: string, serviceId: string, days: number) {
  await candidateFor(ctx, merchant, userId, serviceId);
  await ctx.db.insert(rebookingNudges).values({ merchantId: merchant.id, userId, serviceId, action: "snoozed", until: new Date(ctx.now().getTime() + days * DAY_MS) });
}

/** "Send 6 due today": everyone currently due or late who can be texted. */
export async function sendAllDue(ctx: AppContext, merchant: Merchant, opts: { quietHours?: boolean; /** Automatic mode: only those due within this many days. */ leadDays?: number } = {}): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  for (const c of await rebookingCandidates(ctx, merchant)) {
    if (opts.leadDays !== undefined && c.daysLate < -opts.leadDays) continue;
    if (c.state === "snoozed" || !c.canSend) {
      skipped++;
      continue;
    }
    try {
      await deliverNudge(ctx, merchant, c, opts);
      sent++;
    } catch (err) {
      if (err instanceof HttpError && err.code === "sms_credits_exhausted") {
        skipped++;
        break;
      }
      skipped++;
    }
  }
  return { sent, skipped };
}

/**
 * Set how this shop's reminders go: "review" (the owner sends from the due list), "auto" (a daily send on Pro, Studio and trial) or "off".
 * "auto" needs the plan's rebooking feature (402 with the Pro offer otherwise); the trial start (P1) passes `force` to turn it on before the
 * plan has caught up. rebook_auto follows the mode so older readers keep working.
 */
export async function setRebookingMode(ctx: AppContext, merchant: Merchant, mode: RebookingMode, opts: { force?: boolean } = {}): Promise<serviceApi.RebookingSettings> {
  if (isPharmacy(merchant) && mode === "auto") throw badRequest("Pharmacies can't send rebooking reminders");
  if (mode === "auto" && !opts.force) await requireFeature(ctx.db, merchant, "service.rebooking");
  await ctx.db.update(merchants).set({ rebookingMode: mode, rebookAuto: mode === "auto", updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  return rebookingSettings(ctx, { ...merchant, rebookingMode: mode, rebookAuto: mode === "auto" });
}

export async function setAuto(ctx: AppContext, merchant: Merchant, auto: boolean) {
  const s = await setRebookingMode(ctx, merchant, auto ? "auto" : normalizeMode(merchant.rebookingMode) === "off" ? "off" : "review");
  return { auto: s.auto, mode: s.mode };
}

export async function listRules(ctx: AppContext, merchant: Merchant): Promise<serviceApi.RebookRuleDto[]> {
  const rows = await ctx.db.select().from(services).where(and(eq(services.merchantId, merchant.id), eq(services.active, true))).orderBy(services.sort, services.name);
  return rows.map((r) => ({ serviceId: r.id, name: r.name, rebookAfterDays: r.rebookAfterDays }));
}

export async function setRule(ctx: AppContext, merchant: Merchant, serviceId: string, body: z.infer<typeof serviceApi.rebookRuleBody>): Promise<serviceApi.RebookRuleDto> {
  if (isPharmacy(merchant) && body.rebookAfterDays) throw badRequest("Pharmacies can't send rebooking reminders");
  const [row] = await ctx.db.update(services).set({ rebookAfterDays: body.rebookAfterDays, updatedAt: ctx.now() }).where(and(eq(services.id, serviceId), eq(services.merchantId, merchant.id))).returning();
  if (!row) throw notFound("Service");
  return { serviceId: row.id, name: row.name, rebookAfterDays: row.rebookAfterDays };
}

/**
 * Job, hourly: at 10:00 shop time, send the reminders for shops in "auto" mode whose plan includes it (Pro, Studio, trial), to clients due within
 * REMIND_BEFORE_DAYS. Texts stay inside quiet hours and the shop's text allowance; the other rungs are free.
 */
export async function runRebookNudges(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const shops = await ctx.db.select().from(merchants).where(and(eq(merchants.rebookingMode, "auto"), inArray(merchants.status, ["onboarding", "active"])));
  let sent = 0;
  for (const m of shops) {
    const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: m.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
    if (hour !== 10) continue;
    if (!(await getMerchantFeatures(ctx.db, m))["service.rebooking"].enabled) continue;
    sent += (await sendAllDue(ctx, m, { quietHours: true, leadDays: REMIND_BEFORE_DAYS })).sent;
  }
  return sent;
}

// ---- phase-pro: p3 ---- results, attribution and the public welcome
const sumItems = (items: { priceCents?: number | null }[] | null) => (items ?? []).reduce((n, i) => n + (i.priceCents ?? 0), 0);

/** "This month: 31 reminded · 9 rebooked · $495": reminders sent, those that led to a booking that was not cancelled, and what those bookings are worth. */
export async function rebookingResults(ctx: AppContext, merchant: Merchant): Promise<serviceApi.RebookingResultsResponse> {
  const now = ctx.now();
  const today = localDate(now, merchant.timezone);
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  monthStart.setTime(monthStart.getTime() - 14 * 3_600_000); // generous: filtered by the local date below
  const rows = await ctx.db
    .select({ at: rebookingNudges.createdAt, apptId: rebookingNudges.bookedAppointmentId, items: appointments.items, status: appointments.status })
    .from(rebookingNudges)
    .leftJoin(appointments, eq(appointments.id, rebookingNudges.bookedAppointmentId))
    .where(and(eq(rebookingNudges.merchantId, merchant.id), eq(rebookingNudges.action, "sent"), gte(rebookingNudges.createdAt, monthStart)));
  const weekStart = now.getTime() - 7 * DAY_MS;
  const empty = () => ({ sent: 0, booked: 0, amountCents: 0 });
  const week = empty();
  const month = empty();
  for (const r of rows) {
    const inMonth = localDate(r.at, merchant.timezone).slice(0, 7) === today.slice(0, 7);
    const inWeek = r.at.getTime() >= weekStart;
    const booked = !!r.apptId && r.status !== "cancelled" && r.status !== "no_show";
    const amount = booked ? sumItems(r.items) : 0;
    for (const [on, w] of [[inWeek, week], [inMonth, month]] as const) {
      if (!on) continue;
      w.sent++;
      if (booked) {
        w.booked++;
        w.amountCents += amount;
      }
    }
  }
  return { week, month };
}

/**
 * A client booked online: if they came from a book-again link (`rebook` is the nudge id) count that nudge, else the latest reminder they got from this
 * shop in the last 7 days that has not led to a booking yet. Never throws: a failed count must not undo a booking.
 */
export async function attributeBooking(ctx: AppContext, a: { id: string; merchantId: string; userId: string | null; items: { priceCents?: number | null }[] }, rebookNudgeId?: string | null): Promise<void> {
  try {
    if (!a.userId) return;
    const open = and(eq(rebookingNudges.merchantId, a.merchantId), eq(rebookingNudges.userId, a.userId), eq(rebookingNudges.action, "sent"), isNull(rebookingNudges.bookedAppointmentId));
    let nudge: { id: string } | undefined;
    if (rebookNudgeId && /^[0-9a-f-]{36}$/i.test(rebookNudgeId)) [nudge] = await ctx.db.select({ id: rebookingNudges.id }).from(rebookingNudges).where(and(open, eq(rebookingNudges.id, rebookNudgeId))).limit(1);
    if (!nudge) {
      const since = new Date(ctx.now().getTime() - 7 * DAY_MS);
      [nudge] = await ctx.db.select({ id: rebookingNudges.id }).from(rebookingNudges).where(and(open, gte(rebookingNudges.createdAt, since))).orderBy(desc(rebookingNudges.createdAt)).limit(1);
    }
    if (!nudge) return;
    await ctx.db.update(rebookingNudges).set({ bookedAppointmentId: a.id, convertedAt: ctx.now() }).where(eq(rebookingNudges.id, nudge.id));
    await recordSignal(ctx, a.merchantId, "rebook_booked", { count: 1, amountCents: sumItems(a.items) });
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[rebooking] attribution failed", err);
  }
}

/** The public welcome for a book-again link: the client's first name and the service and stylist to open on. Anyone with the link sees a first name only. */
export async function rebookWelcome(ctx: AppContext, slug: string, nudgeId: string): Promise<serviceApi.RebookWelcomeDto> {
  const none = { firstName: null, serviceId: null, staffId: null };
  if (!/^[0-9a-f-]{36}$/i.test(nudgeId)) return none;
  const [row] = await ctx.db
    .select({ serviceId: rebookingNudges.serviceId, userId: rebookingNudges.userId, merchantId: rebookingNudges.merchantId, name: users.name })
    .from(rebookingNudges)
    .innerJoin(merchants, eq(merchants.id, rebookingNudges.merchantId))
    .innerJoin(users, eq(users.id, rebookingNudges.userId))
    .where(and(eq(rebookingNudges.id, nudgeId), eq(merchants.slug, slug), eq(rebookingNudges.action, "sent")))
    .limit(1);
  if (!row) return none;
  const serviceId = row.serviceId === REGULAR_SERVICE_ID ? null : row.serviceId;
  let staffId: string | null = null;
  if (serviceId) {
    const recent = await ctx.db.select({ staffId: appointments.staffId, items: appointments.items }).from(appointments).where(and(eq(appointments.merchantId, row.merchantId), eq(appointments.userId, row.userId), eq(appointments.status, "completed"))).orderBy(desc(appointments.endsAt)).limit(20);
    staffId = recent.find((r) => r.items.some((i) => i.serviceId === serviceId))?.staffId ?? null;
  }
  return { firstName: row.name?.trim().split(/\s+/)[0] || null, serviceId, staffId };
}
// ---- end phase-pro: p3 ----
