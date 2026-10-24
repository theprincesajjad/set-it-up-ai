/**
 * The do-not-contact list (comm_opt_outs), one row per phone number and channel.
 *
 * Written by the inbound handlers (SMS: integrations-sms.ts; WhatsApp: whatsapp.ts) when a number replies STOP,
 * ARRET, UNSUBSCRIBE, END, CANCEL, QUIT ... and cleared by START. Every sender that texts or WhatsApps a number
 * goes through `sendSms` / `isOptedOut` here, so one STOP covers campaigns, automations, onboarding nudges,
 * rebooking nudges, review requests and tiffin, catering and pickup reminders alike. The only texts that skip the
 * check are the ones the person is waiting for right now: the login code and a team invitation they asked for.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { commOptOuts, type DbOrTx } from "@ll/db";
import { normalizePhone } from "@ll/shared";
import type { AppContext } from "../context.js";

export type OptOutChannel = "sms" | "whatsapp";

const norm = (phone: string): string => normalizePhone(phone) ?? phone;

export async function recordPhoneOptOut(ctx: AppContext, phone: string, channel: OptOutChannel, keyword: string | null, source: "sms_reply" | "whatsapp_reply" | "link"): Promise<void> {
  const now = ctx.now();
  await ctx.db
    .insert(commOptOuts)
    .values({ phone: norm(phone), channel, keyword, source, optedOutAt: now, resubscribedAt: null, updatedAt: now })
    .onConflictDoUpdate({ target: [commOptOuts.phone, commOptOuts.channel], set: { keyword, source, optedOutAt: now, resubscribedAt: null, updatedAt: now } });
}

/** START: the number can be messaged again (marketing still needs the usual per-shop consent). */
export async function recordPhoneResubscribe(ctx: AppContext, phone: string, channel: OptOutChannel): Promise<boolean> {
  const now = ctx.now();
  const rows = await ctx.db
    .update(commOptOuts)
    .set({ resubscribedAt: now, updatedAt: now })
    .where(and(eq(commOptOuts.phone, norm(phone)), eq(commOptOuts.channel, channel), isNull(commOptOuts.resubscribedAt)))
    .returning({ id: commOptOuts.id });
  return rows.length > 0;
}

export async function isOptedOut(db: DbOrTx, phone: string | null | undefined, channel: OptOutChannel): Promise<boolean> {
  if (!phone) return false;
  const [r] = await db
    .select({ id: commOptOuts.id })
    .from(commOptOuts)
    .where(and(eq(commOptOuts.phone, norm(phone)), eq(commOptOuts.channel, channel), isNull(commOptOuts.resubscribedAt)))
    .limit(1);
  return !!r;
}

/** Normalised numbers (from `phones`) that are currently opted out of the channel. */
export async function optedOutSet(db: DbOrTx, phones: (string | null | undefined)[], channel: OptOutChannel): Promise<Set<string>> {
  const list = [...new Set(phones.filter((p): p is string => !!p).map(norm))];
  if (!list.length) return new Set();
  const rows = await db
    .select({ phone: commOptOuts.phone })
    .from(commOptOuts)
    .where(and(inArray(commOptOuts.phone, list), eq(commOptOuts.channel, channel), isNull(commOptOuts.resubscribedAt)));
  return new Set(rows.map((r) => r.phone));
}

export const isSuppressed = (set: Set<string>, phone: string | null | undefined): boolean => !!phone && set.has(norm(phone));

/**
 * Send a text unless the number has opted out. Returns null (and sends nothing) when it has. Use this for every
 * text except a login code or an invitation the person asked for a moment ago.
 */
export async function sendSms(ctx: AppContext, to: string, body: string): Promise<{ id: string } | null> {
  if (await isOptedOut(ctx.db, to, "sms")) return null;
  return ctx.providers.sms.send(to, body);
}
