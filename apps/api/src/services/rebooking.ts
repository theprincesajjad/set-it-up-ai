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
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { appointments, invoices, merchantMembers, merchants, pushTokens, rebookingNudges, services, users } from "@ll/db";
import { normalizeLocale, serviceApi, t, type Locale } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, conflict, notFound } from "../lib/errors.js";
import { getMerchantFeatures } from "./features.js";
import { localDate, reserveSmsCredits, smsAllowance } from "./messaging.js";
import { messageDeliveries } from "@ll/db";
import { inQuietHours } from "./notifications.js";
import { isSuppressed, optedOutSet, sendSms } from "./opt-out.js";

type Merchant = typeof merchants.$inferSelect;
const DAY_MS = 86_400_000;
const WINDOW_MONTHS = 24;
/** A customer who has not visited in this long is left alone. */
const MAX_AGE_DAYS = 730;
const UNANSWERED_LIMIT = 2;

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
  channel: "sms" | "push";
  canSend: boolean;
  memberId: string | null;
}

const addDaysLocal = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

export async function rebookingCandidates(ctx: AppContext, merchant: Merchant): Promise<Candidate[]> {
  const now = ctx.now();
  const today = localDate(now, merchant.timezone);
  const rules = await ctx.db.select().from(services).where(and(eq(services.merchantId, merchant.id), eq(services.active, true), isNotNull(services.rebookAfterDays)));
  if (!rules.length) return [];
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const since = new Date(now.getTime() - WINDOW_MONTHS * 30 * DAY_MS);

  // Last completed visit per (customer, service).
  const last = new Map<string, { userId: string; serviceId: string; at: Date }>();
  const note = (userId: string | null, serviceId: string | null | undefined, at: Date | null) => {
    if (!userId || !serviceId || !at || !ruleById.has(serviceId)) return;
    const k = `${userId}|${serviceId}`;
    const cur = last.get(k);
    if (!cur || cur.at < at) last.set(k, { userId, serviceId, at });
  };
  const done = await ctx.db
    .select({ userId: appointments.userId, items: appointments.items, at: appointments.completedAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(and(eq(appointments.merchantId, merchant.id), eq(appointments.status, "completed"), gte(appointments.endsAt, since)));
  for (const a of done) for (const it of a.items) note(a.userId, it.serviceId, a.at ?? a.endsAt);
  const paid = await ctx.db
    .select({ userId: invoices.userId, lines: invoices.lineItems, at: invoices.paidAt })
    .from(invoices)
    .where(and(eq(invoices.merchantId, merchant.id), eq(invoices.status, "paid"), gte(invoices.paidAt, since)));
  for (const p of paid) for (const l of p.lines) note(p.userId, l.serviceId, p.at);
  if (!last.size) return [];

  const userIds = [...new Set([...last.values()].map((v) => v.userId))];
  const [people, members, tokens, future, nudges] = await Promise.all([
    ctx.db.select({ id: users.id, name: users.name, phone: users.phone, locale: users.locale, deletedAt: users.deletedAt }).from(users).where(inArray(users.id, userIds)),
    ctx.db.select({ id: merchantMembers.id, userId: merchantMembers.userId, consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchant.id), inArray(merchantMembers.userId, userIds))),
    ctx.db.select({ userId: pushTokens.userId }).from(pushTokens).where(inArray(pushTokens.userId, userIds)),
    ctx.db
      .select({ userId: appointments.userId })
      .from(appointments)
      .where(and(eq(appointments.merchantId, merchant.id), inArray(appointments.status, ["booked", "arrived", "in_service"]), gte(appointments.startsAt, now), inArray(appointments.userId, userIds))),
    ctx.db.select().from(rebookingNudges).where(and(eq(rebookingNudges.merchantId, merchant.id), inArray(rebookingNudges.userId, userIds))).orderBy(desc(rebookingNudges.createdAt)),
  ]);
  const person = new Map(people.map((p) => [p.id, p]));
  const member = new Map(members.map((m) => [m.userId, m]));
  const hasPush = new Set(tokens.map((x) => x.userId));
  const hasFuture = new Set(future.map((f) => f.userId));
  // A number that replied STOP to any text is off the list, whatever the consent record says.
  const stopped = await optedOutSet(ctx.db, people.map((p) => p.phone), "sms");

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
    const channel: "sms" | "push" = hasPush.has(v.userId) ? "push" : "sms";
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
      channel,
      canSend: consented && (channel === "push" || (!!u.phone && !isSuppressed(stopped, u.phone))),
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
    settings: { auto: merchant.rebookAuto },
    stats: await rebookingStats(ctx, merchant, counts.due),
  };
}

async function rebookingStats(ctx: AppContext, merchant: Merchant, dueCount: number): Promise<serviceApi.RebookingResponse["stats"]> {
  const now = ctx.now();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const sent = await ctx.db.select().from(rebookingNudges).where(and(eq(rebookingNudges.merchantId, merchant.id), eq(rebookingNudges.action, "sent"), gte(rebookingNudges.createdAt, since)));
  let booked = 0;
  for (const n of sent) {
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
  return { dueThisWeek: dueCount, sentLast30: sent.length, sentSms: sent.filter((n) => n.channel === "sms").length, sentPush: sent.filter((n) => n.channel === "push").length, bookedWithin7Days: booked, nudgedCount: sent.length, optedOut: opt?.n ?? 0 };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function candidateFor(ctx: AppContext, merchant: Merchant, userId: string, serviceId: string): Promise<Candidate> {
  const c = (await rebookingCandidates(ctx, merchant)).find((x) => x.userId === userId && x.serviceId === serviceId);
  if (!c) throw conflict("That customer isn't due for this service right now.");
  return c;
}

/** The text a customer gets, in their language. Names the shop, ends with the STOP line for SMS. */
export function nudgeText(ctx: AppContext, merchant: Merchant, c: Pick<Candidate, "locale" | "customerName" | "serviceName" | "lastVisitAt" | "serviceId">, now: Date) {
  const weeks = Math.max(1, Math.round((now.getTime() - c.lastVisitAt.getTime()) / (7 * DAY_MS)));
  const vars = { name: (c.customerName ?? "").trim().split(/\s+/)[0] || "", service: c.serviceName, shop: merchant.name, weeks, url: `${ctx.config.publicWebUrl}/shops/${merchant.slug}/book?service=${c.serviceId}${c.locale === "en" ? "" : `&lang=${c.locale}`}` };
  return { title: t(c.locale, "sv.msg.rebookTitle", vars), body: t(c.locale, "sv.msg.rebook", vars).replace(/^\s*,\s*/, "") };
}

export async function sendNudge(ctx: AppContext, merchant: Merchant, userId: string, serviceId: string, opts: { quietHours?: boolean } = {}): Promise<{ channel: "sms" | "push" }> {
  return deliverNudge(ctx, merchant, await candidateFor(ctx, merchant, userId, serviceId), opts);
}

async function deliverNudge(ctx: AppContext, merchant: Merchant, c: Candidate, opts: { quietHours?: boolean }): Promise<{ channel: "sms" | "push" }> {
  const { userId, serviceId } = c;
  if (!c.canSend) throw new HttpError(409, "no_consent", "This customer hasn't agreed to messages from your shop, so we can't send this.");
  const now = ctx.now();
  const { title, body } = nudgeText(ctx, merchant, c, now);
  if (c.channel === "sms") {
    if (opts.quietHours && inQuietHours(now, merchant.timezone)) throw conflict("Quiet hours: we don't text overnight.");
    if (!(await reserveSmsCredits(ctx.db, merchant, 1))) throw new HttpError(402, "sms_credits_exhausted", `This needs 1 SMS credit but you have none left this month.`, { needed: 1, remaining: Math.max(0, smsAllowance(merchant) - merchant.smsCreditsUsed) });
    const [u] = await ctx.db.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
    let status = "sent";
    let providerId: string | null = null;
    let error: string | null = null;
    try {
      const r = await sendSms(ctx, u!.phone!, body);
      if (!r) {
        status = "skipped";
        error = "opted_out";
      } else providerId = r.id;
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message.slice(0, 500) : "send failed";
    }
    await ctx.db.insert(messageDeliveries).values({ userId, merchantId: merchant.id, channel: "sms", to: u!.phone!, body, kind: "marketing", status, providerId, error });
    if (status === "failed") throw new HttpError(502, "send_failed", "The text didn't go through. Try again in a minute.");
  } else {
    const toks = await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, userId));
    const res = await ctx.providers.push.send(toks.map((x) => ({ token: x.token, title, body: `${body} (${merchant.name} · mute this shop in the app to stop offers)`, data: { type: "rebook", merchantId: merchant.id, serviceId } })));
    for (const x of toks) await ctx.db.insert(messageDeliveries).values({ userId, merchantId: merchant.id, channel: "push", to: x.token, body, kind: "marketing", status: res.failed ? "failed" : "sent" });
  }
  await ctx.db.insert(rebookingNudges).values({ merchantId: merchant.id, userId, serviceId, action: "sent", channel: c.channel });
  return { channel: c.channel };
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
export async function sendAllDue(ctx: AppContext, merchant: Merchant, opts: { quietHours?: boolean } = {}): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  for (const c of await rebookingCandidates(ctx, merchant)) {
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

export async function setAuto(ctx: AppContext, merchant: Merchant, auto: boolean) {
  await ctx.db.update(merchants).set({ rebookAuto: auto, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  return { auto };
}

export async function listRules(ctx: AppContext, merchant: Merchant): Promise<serviceApi.RebookRuleDto[]> {
  const rows = await ctx.db.select().from(services).where(and(eq(services.merchantId, merchant.id), eq(services.active, true))).orderBy(services.sort, services.name);
  return rows.map((r) => ({ serviceId: r.id, name: r.name, rebookAfterDays: r.rebookAfterDays }));
}

export async function setRule(ctx: AppContext, merchant: Merchant, serviceId: string, body: z.infer<typeof serviceApi.rebookRuleBody>): Promise<serviceApi.RebookRuleDto> {
  const [row] = await ctx.db.update(services).set({ rebookAfterDays: body.rebookAfterDays, updatedAt: ctx.now() }).where(and(eq(services.id, serviceId), eq(services.merchantId, merchant.id))).returning();
  if (!row) throw notFound("Service");
  return { serviceId: row.id, name: row.name, rebookAfterDays: row.rebookAfterDays };
}

/** Job, hourly: at 10:00 shop time, send the due nudges for shops that turned automatic sending on. */
export async function runRebookNudges(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const shops = await ctx.db.select().from(merchants).where(and(eq(merchants.rebookAuto, true), inArray(merchants.status, ["onboarding", "active"])));
  let sent = 0;
  for (const m of shops) {
    const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: m.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
    if (hour !== 10) continue;
    if (!(await getMerchantFeatures(ctx.db, m))["service.rebooking"].enabled) continue;
    sent += (await sendAllDue(ctx, m, { quietHours: true })).sent;
  }
  return sent;
}
