/**
 * Inbound SMS keywords (Twilio webhook). CASL/CTIA: STOP must stop all
 * promotional texts immediately; HELP must answer with who we are.
 *
 * `handleInboundSmsLocal` was written before the messaging team's
 * `handleInboundSms` existed; it is still used for START (and kept as a
 * self-contained reference implementation of STOP/HELP).
 */
import { eq, inArray } from "drizzle-orm";
import { merchantMembers, users } from "@ll/db";
import { BRAND, normalizePhone } from "@ll/shared";
import type { AppContext } from "../context.js";
import { handleInboundSms } from "./messaging.js";

export const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "ARRET", "ARRÊT", "REVOKE", "OPTOUT"]);
export const START_WORDS = new Set(["START", "UNSTOP", "YES", "SUBSCRIBE"]);
export const HELP_WORDS = new Set(["HELP", "INFO", "AIDE"]);

export type InboundSmsResult = { action: "stop" | "start" | "help" | "none"; reply: string | null; membershipsUpdated: number };

export async function handleInboundSmsLocal(ctx: AppContext, from: string, body: string): Promise<InboundSmsResult> {
  const word = body.trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-ZÊ]/g, "") ?? "";
  const phone = normalizePhone(from);
  const userIds = async () => {
    if (!phone) return [];
    const rows = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
    return rows.map((r) => r.id);
  };
  if (STOP_WORDS.has(word)) {
    const ids = await userIds();
    const updated = ids.length
      ? await ctx.db
          .update(merchantMembers)
          .set({ muted: true, marketingConsentAt: null, marketingConsentSource: `sms_stop:${ctx.now().toISOString()}`, marketingConsentText: null })
          .where(inArray(merchantMembers.userId, ids))
          .returning({ id: merchantMembers.id })
      : [];
    // Twilio's Advanced Opt-Out sends the carrier-compliant confirmation itself.
    return { action: "stop", reply: null, membershipsUpdated: updated.length };
  }
  if (START_WORDS.has(word)) {
    const ids = await userIds();
    const updated = ids.length ? await ctx.db.update(merchantMembers).set({ muted: false }).where(inArray(merchantMembers.userId, ids)).returning({ id: merchantMembers.id }) : [];
    return { action: "start", reply: null, membershipsUpdated: updated.length };
  }
  if (HELP_WORDS.has(word)) {
    return {
      action: "help",
      reply: `${BRAND.name}: loyalty points and offers from local shops. Msg&data rates may apply. Reply STOP to opt out. Help: ${BRAND.supportEmail}`,
      membershipsUpdated: 0,
    };
  }
  return { action: "none", reply: null, membershipsUpdated: 0 };
}

/**
 * Route entry point. The messaging team's `handleInboundSms` (services/messaging.ts)
 * owns STOP/HELP (consent withdrawal + audit log). START isn't handled there, so
 * it falls through to the local handler (un-mute only; consent must be re-given).
 */
export async function dispatchInboundSms(ctx: AppContext, from: string, body: string): Promise<{ reply: string | null }> {
  const phone = normalizePhone(from) ?? from;
  const r = await handleInboundSms(ctx, phone, body);
  if (r.action !== "none") return { reply: r.reply };
  const local = await handleInboundSmsLocal(ctx, phone, body);
  return { reply: local.reply };
}
