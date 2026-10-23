/**
 * Festival campaigns (restaurant.festival_campaigns, Growth): the calendar lives in @ll/shared (festivals.ts).
 * This service answers "what is coming for this shop" (ranked by the shop's cuisine and community, with the owner's
 * moved lunar dates applied), turns a suggested template into a campaign draft through the existing messaging service
 * (CASL rules, segments, scheduling), and remembers what was drafted or scheduled so the planner can show it.
 * Sends are never scheduled between 9 pm and 8 am, and "Schedule" never sends immediately.
 */
import { and, eq, inArray } from "drizzle-orm";
import { festivalSends, merchants, messages } from "@ll/db";
import { CUISINES, FESTIVALS, addDays, daysBetween, festivalOccurrences, festivalRelevance, formatFestivalDate, getFestival, resolveFestivalDates, whatsappApi, type FestivalOccurrence, type FestivalRelevance, type FestivalTemplate, type restaurantApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireFeature } from "./features.js";
import { createCampaign, localDate } from "./messaging.js";
import { inQuietHours } from "./notifications.js";
import { senderFor } from "./whatsapp.js";

type Merchant = typeof merchants.$inferSelect;

export interface UpcomingFestival extends FestivalOccurrence {
  templates: { id: string; label: string }[];
  /** How much this festival matters for the shop's cuisine and community. */
  relevance: FestivalRelevance;
  /** What is already drafted or scheduled for this occurrence. */
  sendStatus: restaurantApi.FestivalSendStatus[];
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

export async function upcomingFestivals(ctx: AppContext, merchant: Merchant, days: number): Promise<UpcomingFestivals> {
  await requireFeature(ctx.db, merchant, "restaurant.festival_campaigns");
  const today = localDate(ctx.now(), merchant.timezone);
  const sends = await sendsFor(ctx, merchant.id);
  const items = festivalOccurrences(today, addDays(today, days), merchant.festivalOverrides).map((o) => {
    const def = getFestival(o.festivalId)!;
    return {
      ...o,
      templates: def.templates.map((t) => ({ id: t.id, label: t.label })),
      relevance: festivalRelevance(def, merchant.cuisines),
      sendStatus: sends.get(`${o.festivalId}:${o.year}`) ?? [],
    };
  });
  return { today, languages: merchant.languages, cuisines: merchant.cuisines, cuisineOptions: CUISINES.map((c) => ({ id: c.id, label: c.label })), items };
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
  const festival = getFestival(festivalId);
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
