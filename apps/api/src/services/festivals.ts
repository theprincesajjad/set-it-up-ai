/**
 * Festival campaigns (restaurant.festival_campaigns, Growth): the calendar
 * lives in @ll/shared (festivals.ts). This service answers "what is coming
 * for this shop" and turns a suggested template into a campaign draft through
 * the existing messaging service (CASL rules, segments, scheduling).
 */
import { FESTIVALS, formatFestivalDate, festivalOccurrences, getFestival, addDays, whatsappApi, type FestivalOccurrence, type FestivalTemplate } from "@ll/shared";
import { merchants } from "@ll/db";
import type { AppContext } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireFeature } from "./features.js";
import { createCampaign, localDate } from "./messaging.js";
import { senderFor } from "./whatsapp.js";

type Merchant = typeof merchants.$inferSelect;

export interface UpcomingFestival extends FestivalOccurrence {
  templates: { id: string; label: string }[];
}

export interface UpcomingFestivals {
  /** Today's date in the shop's time zone. */
  today: string;
  languages: string[];
  items: UpcomingFestival[];
}

export async function upcomingFestivals(ctx: AppContext, merchant: Merchant, days: number): Promise<UpcomingFestivals> {
  await requireFeature(ctx.db, merchant, "restaurant.festival_campaigns");
  const today = localDate(ctx.now(), merchant.timezone);
  const items = festivalOccurrences(today, addDays(today, days)).map((o) => ({
    ...o,
    templates: getFestival(o.festivalId)!.templates.map((t) => ({ id: t.id, label: t.label })),
  }));
  return { today, languages: merchant.languages, items };
}

export function listFestivalCatalog() {
  return FESTIVALS.map((f) => ({ id: f.id, name: f.name, tradition: f.tradition, approximate: f.approximate, dateNote: f.dateNote, greeting: f.greeting, dates: f.dates, templates: f.templates }));
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
  const entry = body.year
    ? Object.entries(festival.dates).find(([y]) => Number(y) === body.year)
    : Object.entries(festival.dates)
        .sort(([a], [b]) => a.localeCompare(b))
        .find(([, d]) => (d.end ?? d.start) >= today);
  if (!entry) throw badRequest(`${festival.name} has no upcoming date in the calendar. Pick a year.`);
  const [year, dates] = entry;
  const subject = fill(body.subject ?? template.subject, dates.start);

  let messageId: string | null = null;
  let text: string;
  let whatsapp: whatsappApi.FestivalDraftResult["whatsapp"] = null;
  if (body.channel === "whatsapp") {
    // WhatsApp broadcasts use an approved template; the free-form text works for replies inside the 24 hour window.
    text = fill(body.body ?? template.whatsapp, dates.start);
    const sender = await senderFor(ctx, merchant);
    whatsapp = { templateName: template.whatsappTemplateName, freeFormText: text, approved: !!sender?.approvedTemplates.includes(template.whatsappTemplateName) };
  } else {
    text = fill(body.body ?? (body.channel === "email" ? template.body : template.sms), dates.start);
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
  return { festivalId, year: Number(year), channel: body.channel, messageId, subject: body.channel === "sms" || body.channel === "whatsapp" ? null : subject, body: text, whatsapp, approximate: festival.approximate, dateNote: festival.dateNote };
}
