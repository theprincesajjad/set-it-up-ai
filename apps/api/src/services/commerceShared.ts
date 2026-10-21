/**
 * Helpers shared by the paid commerce/service areas: transactional customer
 * notifications, staff permissions (Pro), in-app payment readiness, cursors,
 * money/time formatting.
 */
import { and, eq } from "drizzle-orm";
import { merchantStaff, merchants, messageDeliveries, pushTokens, users, type DbOrTx } from "@ll/db";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, forbidden } from "../lib/errors.js";
import { getMerchantFeatures, requireFeature } from "./features.js";

type Merchant = typeof merchants.$inferSelect;

// ---------------------------------------------------------------------------
// Notifications (transactional: no marketing consent needed, CASL-exempt)
// ---------------------------------------------------------------------------
export interface NotifyArgs {
  userId: string;
  merchantId: string;
  title: string;
  body: string;
  /** SMS text; defaults to body. */
  smsBody?: string;
  data?: Record<string, unknown>;
  push?: boolean;
  sms?: boolean;
}

/**
 * Send a transactional push (every registered device) and SMS (if the
 * customer has a phone). Never throws: a failed notification must not undo
 * the status change that triggered it. Each send is logged to message_deliveries.
 */
export async function notifyCustomer(ctx: AppContext, args: NotifyArgs): Promise<{ push: number; sms: boolean }> {
  const out = { push: 0, sms: false };
  try {
    const [user] = await ctx.db.select({ phone: users.phone, deletedAt: users.deletedAt }).from(users).where(eq(users.id, args.userId)).limit(1);
    if (!user || user.deletedAt) return out;
    const log = (channel: "sms" | "push", to: string, body: string, status: string, providerId?: string | null, error?: string | null) =>
      ctx.db.insert(messageDeliveries).values({ userId: args.userId, merchantId: args.merchantId, channel, to, body, kind: "transactional", status, providerId: providerId ?? null, error: error ?? null });

    if (args.push !== false) {
      const tokens = await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, args.userId));
      if (tokens.length) {
        try {
          const r = await ctx.providers.push.send(tokens.map((t) => ({ token: t.token, title: args.title, body: args.body, data: args.data })));
          out.push = r.ok;
          for (const t of tokens) await log("push", t.token, `${args.title}: ${args.body}`, "sent");
        } catch (err) {
          for (const t of tokens) await log("push", t.token, `${args.title}: ${args.body}`, "failed", null, (err as Error).message);
        }
      }
    }
    if (args.sms !== false && user.phone) {
      const body = args.smsBody ?? args.body;
      try {
        const r = await ctx.providers.sms.send(user.phone, body);
        out.sms = true;
        await log("sms", user.phone, body, "sent", r.id);
      } catch (err) {
        await log("sms", user.phone, body, "failed", null, (err as Error).message);
      }
    }
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[notifyCustomer]", err);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Staff permissions (Pro: staff.permissions)
// ---------------------------------------------------------------------------
export const STAFF_PERMISSIONS = [
  "catalog.manage",
  "orders.manage",
  "orders.refund",
  "bookings.manage",
  "tickets.manage",
  "quotes.send",
  "invoices.manage",
  "invoices.void",
] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

/** Defaults when a staff member has no custom permission list (or staff.permissions is off). */
const ROLE_DEFAULTS: Record<"staff" | "manager" | "owner", readonly StaffPermission[]> = {
  staff: ["orders.manage", "bookings.manage", "tickets.manage", "quotes.send", "invoices.manage"],
  manager: STAFF_PERMISSIONS,
  owner: STAFF_PERMISSIONS,
};

/**
 * Check a granular permission. Owners, admins and the merchant's rep always
 * pass. Custom lists (merchant_staff.permissions) apply only while the
 * merchant has staff.permissions (Pro); otherwise role defaults apply.
 */
export async function requirePermission(ctx: AppContext, staff: StaffContext, perm: StaffPermission): Promise<void> {
  if (staff.impersonated || staff.role === "owner") return;
  let allowed: readonly string[] = ROLE_DEFAULTS[staff.role];
  const [row] = await ctx.db
    .select({ permissions: merchantStaff.permissions })
    .from(merchantStaff)
    .where(and(eq(merchantStaff.merchantId, staff.merchant.id), eq(merchantStaff.userId, staff.user.id)))
    .limit(1);
  if (row?.permissions) {
    const features = await getMerchantFeatures(ctx.db, staff.merchant);
    if (features["staff.permissions"].enabled) allowed = row.permissions;
  }
  if (!allowed.includes(perm)) throw forbidden(`Missing permission: ${perm}`);
}

// ---------------------------------------------------------------------------
// In-app payments readiness
// ---------------------------------------------------------------------------
export const paymentsNotSetUp = () =>
  new HttpError(409, "payments_not_set_up", "This shop hasn't finished setting up in-app payments yet. You can pay at the counter.");

/** payments.in_app must be enabled and the Connect account able to take charges. */
export async function requirePaymentsReady(db: DbOrTx, merchant: Merchant): Promise<string> {
  await requireFeature(db, merchant, "payments.in_app");
  if (!merchant.stripeAccountId || !merchant.stripeChargesEnabled) throw paymentsNotSetUp();
  return merchant.stripeAccountId;
}

export async function paymentsReady(db: DbOrTx, merchant: Merchant): Promise<boolean> {
  if (!merchant.stripeAccountId || !merchant.stripeChargesEnabled) return false;
  const f = await getMerchantFeatures(db, merchant);
  return f["payments.in_app"].enabled;
}

export async function loadMerchant(db: DbOrTx, merchantId: string): Promise<Merchant | null> {
  const [m] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  return m ?? null;
}

// ---------------------------------------------------------------------------
// Cursors, formatting
// ---------------------------------------------------------------------------
/** Opaque keyset cursor over (createdAt desc, id desc). */
export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const d = new Date(iso ?? "");
  if (!id || Number.isNaN(d.getTime())) throw badRequest("Invalid cursor");
  return { createdAt: d, id };
}

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/** "3:30 p.m." style local time for reminder texts. */
export function formatLocalTime(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, hour: "numeric", minute: "2-digit" }).format(d);
}

export function formatLocalDateTime(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

/** Short description of a serviced item, e.g. "Apple iPhone 13" or "your vehicle". */
export function itemLabel(itemKind: string, details: Record<string, string>): string {
  const name = [details.year, details.make, details.model].filter(Boolean).join(" ").trim();
  if (name) return name;
  return itemKind === "vehicle" ? "your vehicle" : itemKind === "garment" ? "your garment" : itemKind === "device" ? "your device" : "your item";
}
