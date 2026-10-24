/**
 * Festival campaigns (restaurant.festival_campaigns, Growth): the calendar lives in @ll/shared (festivals.ts).
 * This service answers "what is coming for this shop" (ranked by the shop's cuisine and community, with the owner's
 * moved lunar dates applied), turns a suggested template into a campaign draft through the existing messaging service
 * (CASL rules, segments, scheduling), and remembers what was drafted or scheduled so the planner can show it.
 * Sends are never scheduled between 9 pm and 8 am, and "Schedule" never sends immediately.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { festivalSends, merchantOccasions, merchants, messages, users } from "@ll/db";
import { CUISINES, FESTIVALS, addDays, customOccasionDef, daysBetween, festivalOccurrences, festivalRelevance, formatFestivalDate, getFestival, isCustomFestivalId, resolveFestivalDates, restaurantApi, whatsappApi, type CustomOccasion, type FestivalDef, type FestivalOccurrence, type FestivalRelevance, type FestivalTemplate } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest, conflict, notFound, tooMany } from "../lib/errors.js";
import { requireFeature } from "./features.js";
import { TEST_SENDS_PER_DAY, createCampaign, deliverTestToSelf, localDate, testSendsUsedToday } from "./messaging.js";
import { inQuietHours } from "./notifications.js";
import { writeAudit } from "./admin-audit.js";
import { senderFor, sendWhatsApp } from "./whatsapp.js";

type Merchant = typeof merchants.$inferSelect;

export interface UpcomingFestival extends FestivalOccurrence {
  templates: { id: string; label: string }[];
  /** How much this festival matters for the shop's cuisine and community. */
  relevance: FestivalRelevance;
  /** What is already drafted or scheduled for this occurrence. */
  sendStatus: restaurantApi.FestivalSendStatus[];
  /** Set for a date the owner added: the texts, so the planner can show and send them. */
  custom?: CustomOccasion;
}

export interface UpcomingFestivals {
  /** Today's date in the shop's time zone. */
  today: string;
  languages: string[];
  /** The shop's cuisine tags (empty = not set, nothing is hidden). */
  cuisines: string[];
  cuisineOptions: { id: string; label: string }[];
  items: UpcomingFestival[];
}

async function sendsFor(ctx: AppContext, merchantId: string): Promise<Map<string, restaurantApi.FestivalSendStatus[]>> {
  const rows = await ctx.db.select().from(festivalSends).where(eq(festivalSends.merchantId, merchantId));
  const out = new Map<string, restaurantApi.FestivalSendStatus[]>();
  for (const r of rows) {
    const key = `${r.festivalId}:${r.year}`;
    out.set(key, [...(out.get(key) ?? []), { templateId: r.templateId, channel: r.channel, status: r.status === "scheduled" ? "scheduled" : "draft", scheduledAt: r.scheduledAt?.toISOString() ?? null }]);
  }
  return out;
}

/** The shop's own dates as occasions. */
export async function listOccasions(ctx: AppContext, merchantId: string): Promise<CustomOccasion[]> {
  const rows = await ctx.db.select().from(merchantOccasions).where(eq(merchantOccasions.merchantId, merchantId)).orderBy(asc(merchantOccasions.date), asc(merchantOccasions.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, date: r.date, subject: r.subject, body: r.body, sms: r.sms, whatsapp: r.whatsapp }));
}

/** A calendar festival or one of the shop's own dates. */
async function festivalDefFor(ctx: AppContext, merchant: Merchant, festivalId: string): Promise<FestivalDef | undefined> {
  if (!isCustomFestivalId(festivalId)) return getFestival(festivalId);
  const mine = (await listOccasions(ctx, merchant.id)).find((o) => `custom-${o.id}` === festivalId);
  return mine ? customOccasionDef(mine) : undefined;
}

export async function upcomingFestivals(ctx: AppContext, merchant: Merchant, days: number): Promise<UpcomingFestivals> {
  await requireFeature(ctx.db, merchant, "restaurant.festival_campaigns");
  const today = localDate(ctx.now(), merchant.timezone);
  const sends = await sendsFor(ctx, merchant.id);
  const mine = await listOccasions(ctx, merchant.id);
  const custom = new Map<string, CustomOccasion>(mine.map((o) => [`custom-${o.id}`, o]));
  const defs = new Map<string, FestivalDef>([...FESTIVALS, ...mine.map(customOccasionDef)].map((f) => [f.id, f]));
  const occurrences = festivalOccurrences(today, addDays(today, days), merchant.festivalOverrides, [...defs.values()]);
  const items = occurrences.map((o) => {
    const def = defs.get(o.festivalId)!;
    const own = custom.get(o.festivalId);
    return {
      ...o,
      templates: def.templates.map((t) => ({ id: t.id, label: t.label })),
      // A date the owner added matters to them: it always leads the list.
      relevance: own ? ("high" as const) : festivalRelevance(def, merchant.cuisines),
      sendStatus: sends.get(`${o.festivalId}:${o.year}`) ?? [],
      ...(own ? { custom: own } : {}),
    };
  });
  return { today, languages: merchant.languages, cuisines: merchant.cuisines, cuisineOptions: CUISINES.map((c) => ({ id: c.id, label: c.label })), items };
}

/** "Add my own date": a named occasion with its message, planned like a festival (a send three days before and a reminder the day before). */
export async function addOccasion(ctx: AppContext, merchant: Merchant, actorUserId: string, b: z.output<typeof restaurantApi.customOccasionBody>): Promise<CustomOccasion> {
  await requireFeature(ctx.db, merchant, "restaurant.festival_campaigns");
  const today = localDate(ctx.now(), merchant.timezone);
  if (b.date < today) throw badRequest("Pick a date that has not passed.");
  const existing = await listOccasions(ctx, merchant.id);
  if (existing.length >= 30) throw badRequest("You can keep up to 30 dates of your own. Remove one you no longer need.");
  const [row] = await ctx.db
    .insert(merchantOccasions)
    .values({ merchantId: merchant.id, name: b.name, date: b.date, subject: b.subject, body: b.body, sms: b.sms ?? b.body, whatsapp: b.whatsapp ?? b.body, createdAt: ctx.now() })
    .returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "festival.occasion_added", entity: "occasion", entityId: row!.id, data: { name: b.name, date: b.date } });
  return { id: row!.id, name: row!.name, date: row!.date, subject: row!.subject, body: row!.body, sms: row!.sms, whatsapp: row!.whatsapp };
}

export async function removeOccasion(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string): Promise<{ ok: true }> {
  await requireFeature(ctx.db, merchant, "restaurant.festival_campaigns");
  const [row] = await ctx.db.delete(merchantOccasions).where(and(eq(merchantOccasions.id, id), eq(merchantOccasions.merchantId, merchant.id))).returning();
  if (!row) throw notFound("Date");
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "festival.occasion_removed", entity: "occasion", entityId: id, data: { name: row.name, date: row.date } });
  return { ok: true };
}

export function listFestivalCatalog() {
  return FESTIVALS.map((f) => ({ id: f.id, name: f.name, tradition: f.tradition, approximate: f.approximate, dateNote: f.dateNote, greeting: f.greeting, dates: f.dates, communities: f.communities, templates: f.templates }));
}

/** Which kind of food the shop serves, so festivals are ranked for its community (hyderabadi, punjabi, ...). */
export async function setCuisines(ctx: AppContext, merchant: Merchant, cuisines: string[]): Promise<{ cuisines: string[] }> {
  await requireFeature(ctx.db, merchant, "restaurant.festival_campaigns");
  const known = new Set(CUISINES.map((c) => c.id));
  const unique = [...new Set(cuisines)].filter((c) => known.has(c));
  if (unique.length !== new Set(cuisines).size) throw badRequest("Pick cuisines from the list");
  await ctx.db.update(merchants).set({ cuisines: unique, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  return { cuisines: unique };
}

/**
 * The owner moves a lunar date (Eid by a day after moon sighting). Every planned send date follows, and messages already
 * scheduled for it move by the same number of days.
 */
export async function setDateOverride(ctx: AppContext, merchant: Merchant, festivalId: string, body: restaurantApi.FestivalDateOverrideBody): Promise<{ festivalId: string; year: number; start: string; moved: boolean; shiftedMessages: number }> {
  await requireFeature(ctx.db, merchant, "restaurant.festival_campaigns");
  if (isCustomFestivalId(festivalId)) throw badRequest("Your own dates don't move with the moon. Remove it and add it again with the new date.");
  const festival = getFestival(festivalId);
  if (!festival) throw notFound("Festival");
  const d = festival.dates[String(body.year)];
  if (!d) throw badRequest(`${festival.name} has no ${body.year} date in the calendar`);
  const before = resolveFestivalDates(festival, String(body.year), merchant.festivalOverrides)!;
  const next = { ...merchant.festivalOverrides, [festivalId]: { ...(merchant.festivalOverrides[festivalId] ?? {}) } };
  if (body.start === null || body.start === d.start) delete next[festivalId]![String(body.year)];
  else {
    if (Math.abs(daysBetween(d.start, body.start)) > 3) throw badRequest("Moon sighting moves a date by a day or two. Pick a date within three days of the calendar.");
    next[festivalId]![String(body.year)] = body.start;
  }
  if (!Object.keys(next[festivalId]!).length) delete next[festivalId];
  await ctx.db.update(merchants).set({ festivalOverrides: next, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  const after = resolveFestivalDates(festival, String(body.year), next)!;
  const delta = daysBetween(before.start, after.start);
  let shifted = 0;
  if (delta !== 0) {
    // Scheduled drafts that have not gone out move with the festival, keeping their local time of day.
    const rows = await ctx.db.select().from(festivalSends).where(and(eq(festivalSends.merchantId, merchant.id), eq(festivalSends.festivalId, festivalId), eq(festivalSends.year, body.year), eq(festivalSends.status, "scheduled")));
    for (const r of rows) {
      if (!r.scheduledAt || !r.messageId) continue;
      const [msg] = await ctx.db.select().from(messages).where(and(eq(messages.id, r.messageId), inArray(messages.status, ["scheduled", "draft"]))).limit(1);
      if (!msg) continue;
      const at = new Date(r.scheduledAt.getTime() + delta * 86_400_000);
      if (at.getTime() <= ctx.now().getTime()) continue;
      await ctx.db.update(messages).set({ scheduledAt: at }).where(eq(messages.id, msg.id));
      await ctx.db.update(festivalSends).set({ scheduledAt: at }).where(eq(festivalSends.id, r.id));
      shifted++;
    }
  }
  return { festivalId, year: body.year, start: after.start, moved: after.moved, shiftedMessages: shifted };
}

const fill = (text: string, date: string) => text.replace(/\{\{festival_date\}\}/g, formatFestivalDate(date));

export async function createFestivalDraft(ctx: AppContext, merchant: Merchant, actorUserId: string, festivalId: string, input: whatsappApi.FestivalDraftBody): Promise<whatsappApi.FestivalDraftResult> {
  await requireFeature(ctx.db, merchant, "restaurant.festival_campaigns");
  const body = whatsappApi.festivalDraftBody.parse(input);
  const festival = await festivalDefFor(ctx, merchant, festivalId);
  if (!festival) throw notFound("Festival");
  const template: FestivalTemplate | undefined = festival.templates.find((t) => t.id === body.templateId);
  if (!template) throw notFound("Template");

  const today = localDate(ctx.now(), merchant.timezone);
  const resolved = Object.keys(festival.dates)
    .sort()
    .map((y) => ({ year: y, ...resolveFestivalDates(festival, y, merchant.festivalOverrides)! }));
  const entry = body.year ? resolved.find((r) => Number(r.year) === body.year) : resolved.find((r) => (r.end ?? r.start) >= today);
  if (!entry) throw badRequest(`${festival.name} has no upcoming date in the calendar. Pick a year.`);
  const year = entry.year;
  const start = entry.start;
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  // Owners review and schedule every send; nothing goes out overnight.
  if (scheduledAt && inQuietHours(scheduledAt, merchant.timezone)) throw badRequest("We never send between 9 pm and 8 am. Pick a time between 8 am and 9 pm.");
  const subject = fill(body.subject ?? template.subject, start);

  let messageId: string | null = null;
  let text: string;
  let whatsapp: whatsappApi.FestivalDraftResult["whatsapp"] = null;
  if (body.channel === "whatsapp") {
    // WhatsApp broadcasts use an approved template; the free-form text works for replies inside the 24 hour window.
    text = fill(body.body ?? template.whatsapp, start);
    const sender = await senderFor(ctx, merchant);
    whatsapp = { templateName: template.whatsappTemplateName, freeFormText: text, approved: !!sender?.approvedTemplates.includes(template.whatsappTemplateName) };
  } else {
    text = fill(body.body ?? (body.channel === "email" ? template.body : template.sms), start);
    const m = await createCampaign(ctx, merchant, actorUserId, {
      channel: body.channel,
      subject: body.channel === "sms" ? null : subject,
      body: text,
      segment: body.segment,
      scheduledAt: body.scheduledAt ?? null,
      sendNow: false,
    });
    messageId = m.id;
  }
  await ctx.db.insert(festivalSends).values({ merchantId: merchant.id, festivalId, year: Number(year), templateId: template.id, channel: body.channel, status: scheduledAt ? "scheduled" : "draft", scheduledAt, messageId, createdAt: ctx.now() });
  return { festivalId, year: Number(year), channel: body.channel, messageId, subject: body.channel === "sms" || body.channel === "whatsapp" ? null : subject, body: text, whatsapp, approximate: festival.approximate, dateNote: festival.dateNote };
}

/**
 * "Send me a test": the template as the owner would send it, to the signed-in owner only (their own email, phone or phones
 * signed in to the app), by the chosen channel. Nothing is saved as a draft, no guest is contacted, no consent check is
 * needed, and it counts toward the same 10 tests a day as message tests. SMS uses one credit.
 */
export async function sendFestivalTest(ctx: AppContext, merchant: Merchant, actorUserId: string, festivalId: string, body: z.output<typeof restaurantApi.festivalTestBody>): Promise<restaurantApi.FestivalTestResult> {
  await requireFeature(ctx.db, merchant, "restaurant.festival_campaigns");
  const festival = await festivalDefFor(ctx, merchant, festivalId);
  if (!festival) throw notFound("Festival");
  const template = festival.templates.find((t) => t.id === body.templateId);
  if (!template) throw notFound("Template");
  const today = localDate(ctx.now(), merchant.timezone);
  const resolved = Object.keys(festival.dates).sort().map((y) => ({ year: y, ...resolveFestivalDates(festival, y, merchant.festivalOverrides)! }));
  const entry = body.year ? resolved.find((r) => Number(r.year) === body.year) : resolved.find((r) => (r.end ?? r.start) >= today) ?? resolved[resolved.length - 1];
  if (!entry) throw badRequest(`${festival.name} has no date in the calendar for that year.`);
  const start = entry.start;

  if (body.channel !== "whatsapp") {
    const text = fill(body.body ?? (body.channel === "email" ? template.body : template.sms), start);
    const subject = body.channel === "sms" ? null : fill(body.subject ?? template.subject, start);
    const r = await deliverTestToSelf(ctx, merchant, actorUserId, { channel: body.channel, subject, body: text, entityId: festivalId, entity: "festival" });
    return { channel: body.channel, sent: r.sent, to: r.to, smsCreditsUsed: r.smsCreditsUsed, testsRemainingToday: r.testsRemainingToday };
  }

  await requireFeature(ctx.db, merchant, "restaurant.whatsapp_marketing");
  const used = await testSendsUsedToday(ctx, merchant.id, actorUserId);
  if (used >= TEST_SENDS_PER_DAY) throw tooMany(`You can send ${TEST_SENDS_PER_DAY} tests a day. Try again tomorrow.`);
  const [me] = await ctx.db.select({ phone: users.phone }).from(users).where(eq(users.id, actorUserId)).limit(1);
  if (!me?.phone) throw badRequest("Your account needs a phone number to receive a WhatsApp test");
  const sender = await senderFor(ctx, merchant);
  if (!sender) throw conflict("Connect your WhatsApp Business number first");
  const text = fill(body.body ?? template.whatsapp, start);
  const approved = sender.approvedTemplates.includes(template.whatsappTemplateName);
  const out = await sendWhatsApp(ctx, merchant, me.phone, { sender: "system", text, ...(approved && body.params ? { template: { name: template.whatsappTemplateName, params: body.params } } : {}) });
  if (!out.sent) {
    const why =
      out.reason === "outside_window"
        ? "WhatsApp only lets us send free text to a number that messaged your shop in the last 24 hours, and this template isn't approved yet. Send the test by text or email, or message your shop number from your phone first."
        : out.reason === "no_credits"
          ? "You've used this month's WhatsApp messages."
          : "WhatsApp couldn't deliver the test. Check your connection in WhatsApp settings.";
    throw conflict(why);
  }
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "message.test_sent", entity: "festival", entityId: festivalId, data: { channel: "whatsapp", addresses: 1, sent: 1 } });
  return { channel: "whatsapp", sent: 1, to: [me.phone], smsCreditsUsed: 0, testsRemainingToday: TEST_SENDS_PER_DAY - used - 1 };
}
