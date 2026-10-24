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
import { BRAND, START_KEYWORDS, STOP_KEYWORDS, isStartKeyword, isStopKeyword, normalizePhone, normalizeReplyWord } from "@ll/shared";
import type { AppContext } from "../context.js";
import { handleInboundSms } from "./messaging.js";
import { recordPhoneOptOut, recordPhoneResubscribe } from "./opt-out.js";

export const STOP_WORDS = new Set<string>(STOP_KEYWORDS);
export const START_WORDS = new Set<string>(START_KEYWORDS);
export const HELP_WORDS = new Set(["HELP", "INFO", "AIDE"]);

export type InboundSmsResult = { action: "stop" | "start" | "help" | "none"; reply: string | null; membershipsUpdated: number };

export async function handleInboundSmsLocal(ctx: AppContext, from: string, body: string): Promise<InboundSmsResult> {
  const word = normalizeReplyWord(body);
  const phone = normalizePhone(from);
  const userIds = async () => {
    if (!phone) return [];
    const rows = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
    return rows.map((r) => r.id);
  };
  if (isStopKeyword(body)) {
    if (phone) await recordPhoneOptOut(ctx, phone, "sms", word, "sms_reply");
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
  if (isStartKeyword(body)) {
    if (phone) await recordPhoneResubscribe(ctx, phone, "sms");
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
