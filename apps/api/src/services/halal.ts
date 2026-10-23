/**
 * Shop-level halal certification (restaurant.dietary_tags).
 *
 * The record is the owner's own statement: certifier, scope, slaughter method, certificate number, expiry.
 * We print it as given and never verify it or badge a shop ourselves (CFIA does not regulate certifiers).
 * Per-dish `dietary.halalCertifier` is only an override for a dish certified by someone else.
 *
 * Expiry: owners are reminded 60 and 30 days before `validUntil`; after that day the public block says
 * "Certificate expired, ask the restaurant" and the certifier name and file are withheld until renewed.
 */
import { and, eq, isNotNull, or } from "drizzle-orm";
import { merchantStaff, merchants, users, type HalalCertification } from "@ll/db";
import { BRAND, restaurantWebApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { writeAudit } from "./admin-audit.js";
import { requireFeature } from "./features.js";
import { canSendTransactional, getSession, sendWhatsApp, windowOpen } from "./whatsapp.js";

type Merchant = typeof merchants.$inferSelect;
type Dto = restaurantWebApi.HalalCertificationDto;

/** YYYY-MM-DD in the shop's timezone. */
const localDateKey = (d: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export const REMINDER_DAYS = [60, 30] as const;

/** Whole days from the shop-local today to a YYYY-MM-DD date (negative once past). */
export function daysUntil(date: string, today: string): number {
  const utc = (d: string) => {
    const [y, m, day] = d.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((utc(date) - utc(today)) / 86_400_000);
}

export function certificationDto(c: HalalCertification, merchant: Pick<Merchant, "timezone">, now: Date): Dto {
  const today = localDateKey(now, merchant.timezone);
  const daysLeft = c.validUntil ? daysUntil(c.validUntil, today) : null;
  return {
    certifier: c.certifier,
    certificateNo: c.certificateNo ?? null,
    scope: c.scope,
    slaughter: c.slaughter,
    validUntil: c.validUntil ?? null,
    fileUrl: c.fileUrl ?? null,
    expired: daysLeft !== null && daysLeft < 0,
    daysLeft,
  };
}

/** What customers may see. After expiry the certifier and the certificate file are withheld. */
export function publicCertification(c: HalalCertification | null | undefined, merchant: Pick<Merchant, "timezone">, now: Date): restaurantWebApi.PublicHalalCertification | null {
  if (!c) return null;
  const d = certificationDto(c, merchant, now);
  return {
    scope: c.scope,
    slaughter: c.slaughter,
    certifier: d.expired ? null : c.certifier,
    validUntil: c.validUntil ?? null,
    fileUrl: d.expired ? null : (c.fileUrl ?? null),
    expired: d.expired,
  };
}

export async function getHalalCertification(ctx: AppContext, merchant: Merchant): Promise<restaurantWebApi.HalalCertificationResponse> {
  await requireFeature(ctx.db, merchant, "restaurant.dietary_tags");
  return { halalCertification: merchant.halalCertification ? certificationDto(merchant.halalCertification, merchant, ctx.now()) : null };
}

export async function setHalalCertification(ctx: AppContext, merchant: Merchant, actorUserId: string, input: restaurantWebApi.HalalCertificationBody): Promise<restaurantWebApi.HalalCertificationResponse> {
  await requireFeature(ctx.db, merchant, "restaurant.dietary_tags");
  const b = restaurantWebApi.halalCertificationBody.parse(input);
  const cert: HalalCertification = {
    certifier: b.certifier,
    scope: b.scope,
    slaughter: b.slaughter,
    ...(b.certificateNo ? { certificateNo: b.certificateNo } : {}),
    ...(b.validUntil ? { validUntil: b.validUntil } : {}),
    ...(b.fileUrl ? { fileUrl: b.fileUrl } : {}),
  };
  // A new expiry date starts the 60 and 30 day reminders over.
  const keep = merchant.halalReminders && merchant.halalReminders.validUntil === cert.validUntil ? merchant.halalReminders : null;
  await ctx.db.update(merchants).set({ halalCertification: cert, halalReminders: keep, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "halal.certification_saved", entity: "merchant", entityId: merchant.id, data: { certifier: cert.certifier, scope: cert.scope, slaughter: cert.slaughter, validUntil: cert.validUntil ?? null } });
  return { halalCertification: certificationDto(cert, merchant, ctx.now()) };
}

export async function clearHalalCertification(ctx: AppContext, merchant: Merchant, actorUserId: string): Promise<restaurantWebApi.HalalCertificationResponse> {
  await requireFeature(ctx.db, merchant, "restaurant.dietary_tags");
  await ctx.db.update(merchants).set({ halalCertification: null, halalReminders: null, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id));
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "halal.certification_removed", entity: "merchant", entityId: merchant.id });
  return { halalCertification: null };
}

// ---------------------------------------------------------------------------
// Expiry reminders (daily job)
// ---------------------------------------------------------------------------
const longDate = (d: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));

export function reminderText(shop: string, c: HalalCertification, daysLeft: number): string {
  const when = daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${longDate(c.validUntil!)})`;
  return `${shop}: your halal certificate from ${c.certifier} expires ${when}. Renew it, then update the date under Menu & dietary so guests keep seeing the certifier. After it expires we show "Certificate expired, ask the restaurant" and hide the certifier name.`;
}

/** Which reminder is due: 60 for 31 to 60 days left, 30 for 0 to 30. Null otherwise (or already sent). */
export function dueReminder(daysLeft: number, sent: { d60?: string; d30?: string }): 60 | 30 | null {
  if (daysLeft < 0) return null;
  if (daysLeft <= 30) return sent.d30 ? null : 30;
  if (daysLeft <= 60) return sent.d60 || sent.d30 ? null : 60;
  return null;
}

/** Owner and managers: WhatsApp when their number has opted in and the 24 hour window is open, otherwise email. */
async function notifyOwners(ctx: AppContext, merchant: Merchant, text: string, subject: string): Promise<"whatsapp" | "email" | null> {
  const staff = await ctx.db
    .select({ email: users.email, phone: users.phone })
    .from(merchantStaff)
    .innerJoin(users, eq(users.id, merchantStaff.userId))
    .where(and(eq(merchantStaff.merchantId, merchant.id), or(eq(merchantStaff.role, "owner"), eq(merchantStaff.role, "manager"))));
  for (const s of staff) {
    if (!s.phone || !merchant.whatsappNumber) continue;
    const session = await getSession(ctx, merchant.id, s.phone);
    if (canSendTransactional(session) && windowOpen(session, ctx.now())) {
      const r = await sendWhatsApp(ctx, merchant, s.phone, { text }, session);
      if (r.sent) return "whatsapp";
    }
  }
  const to = [...new Set([merchant.email, ...staff.map((s) => s.email)].filter((e): e is string => !!e))];
  for (const addr of to) await ctx.providers.email.send({ to: addr, subject, text: `${text}\n\n${BRAND.name}` }).catch(() => undefined);
  return to.length ? "email" : null;
}

/** One pass: remind owners 60 and 30 days before a certificate expires. Idempotent per validUntil. Returns how many were sent. */
export async function sendHalalExpiryReminders(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const shops = await ctx.db.select().from(merchants).where(and(isNotNull(merchants.halalCertification), isNotNull(merchants.restaurantTier)));
  let n = 0;
  for (const m of shops) {
    const c = m.halalCertification;
    if (!c?.validUntil || m.status === "closed") continue;
    const daysLeft = daysUntil(c.validUntil, localDateKey(now, m.timezone));
    const sent = m.halalReminders?.validUntil === c.validUntil ? m.halalReminders : { validUntil: c.validUntil };
    const stage = dueReminder(daysLeft, sent);
    if (!stage) continue;
    const via = await notifyOwners(ctx, m, reminderText(m.name, c, daysLeft), `Your halal certificate expires in ${daysLeft} days`);
    if (!via) continue;
    const next = { ...sent, validUntil: c.validUntil, [stage === 60 ? "d60" : "d30"]: now.toISOString(), ...(stage === 30 && !sent.d60 ? { d60: now.toISOString() } : {}) };
    await ctx.db.update(merchants).set({ halalReminders: next }).where(eq(merchants.id, m.id));
    await writeAudit(ctx.db, { actorUserId: null, merchantId: m.id, action: "halal.expiry_reminder", entity: "merchant", entityId: m.id, data: { stage, daysLeft, via } });
    n++;
  }
  return n;
}
