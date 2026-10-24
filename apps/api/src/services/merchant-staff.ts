/** Team management: invite, roles, PINs. Owners only (enforced in routes). */
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { merchantStaff, merchants, users, type DbOrTx } from "@ll/db";
import { BRAND, normalizeLocale, type Locale, type merchantApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { setStaffPin } from "./auth.js";
import { findOrCreateCustomerByPhone, generateMemberCode } from "./ledger.js";
import { recordMilestone } from "./onboarding.js";
import { writeAudit } from "./admin-audit.js";
import { requirePhone } from "./merchant.js";

type StaffRole = merchantApi.StaffRole;

/** merchant_staff.locale is free text in the DB; the API only ever exposes a supported code. */
export const localeOrEn = (v: string | null | undefined): Locale => normalizeLocale(v) ?? "en";

/** Find a user by email (case-insensitive) or create one. */
export async function findOrCreateUserByEmail(db: DbOrTx, email: string, name?: string | null) {
  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
  if (existing) {
    if (name && !existing.name) {
      const [u] = await db.update(users).set({ name }).where(eq(users.id, existing.id)).returning();
      return { user: u!, created: false };
    }
    return { user: existing, created: false };
  }
  const [created] = await db
    .insert(users)
    .values({ email, name: name ?? null, memberCode: await generateMemberCode(db) })
    .onConflictDoNothing()
    .returning();
  if (created) return { user: created, created: true };
  const [again] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
  return { user: again!, created: false };
}

/** Resolve (or create) the user behind an email and/or phone invite. */
export async function findOrCreateInvitee(db: DbOrTx, input: { email?: string | null; phone?: string | null; name?: string | null }) {
  const phone = input.phone ? requirePhone(input.phone) : null;
  if (input.email) {
    const r = await findOrCreateUserByEmail(db, input.email, input.name);
    if (phone && !r.user.phone) {
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
      if (!taken) await db.update(users).set({ phone }).where(eq(users.id, r.user.id));
    }
    return r.user;
  }
  if (phone) return (await findOrCreateCustomerByPhone(db, phone, input.name)).user;
  throw badRequest("Provide an email or phone number");
}

function serialize(row: { userId: string; name: string | null; email: string | null; phone: string | null; role: StaffRole; pinHash: string | null; locale: string; station: string | null; createdAt: Date }): merchantApi.StaffMember {
  return { userId: row.userId, name: row.name, email: row.email, phone: row.phone, role: row.role, hasPin: !!row.pinHash, locale: localeOrEn(row.locale), station: row.station, createdAt: row.createdAt.toISOString() };
}

const staffSelect = {
  userId: merchantStaff.userId,
  name: users.name,
  email: users.email,
  phone: users.phone,
  role: merchantStaff.role,
  pinHash: merchantStaff.pinHash,
  locale: merchantStaff.locale,
  station: merchantStaff.station,
  createdAt: merchantStaff.createdAt,
};

export async function listStaff(db: DbOrTx, merchantId: string): Promise<merchantApi.StaffMember[]> {
  const rows = await db
    .select(staffSelect)
    .from(merchantStaff)
    .innerJoin(users, eq(users.id, merchantStaff.userId))
    .where(eq(merchantStaff.merchantId, merchantId))
    .orderBy(asc(merchantStaff.createdAt));
  return rows.map(serialize);
}

async function getStaff(db: DbOrTx, merchantId: string, userId: string) {
  const [row] = await db
    .select(staffSelect)
    .from(merchantStaff)
    .innerJoin(users, eq(users.id, merchantStaff.userId))
    .where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Staff member");
  return row;
}

/** Send a transactional invite (email preferred, SMS fallback). Not marketing: no consent needed. */
export async function sendStaffInvite(ctx: AppContext, opts: { merchantName: string; role: StaffRole; email?: string | null; phone?: string | null }) {
  const loginUrl = `${ctx.config.publicWebUrl.replace(/\/$/, "")}/login`;
  const text = `You've been added as ${opts.role === "owner" ? "an owner" : `a ${opts.role}`} at ${opts.merchantName} on ${BRAND.name}. Sign in with this ${opts.email ? "email" : "phone number"}: ${loginUrl}`;
  if (opts.email) await ctx.providers.email.send({ to: opts.email, subject: `You're on the ${opts.merchantName} team`, text });
  else if (opts.phone) await ctx.providers.sms.send(opts.phone, text);
}

export async function inviteStaff(ctx: AppContext, merchantId: string, actorUserId: string, body: { email?: string; phone?: string; name?: string; role: StaffRole }) {
  const [m] = await ctx.db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const user = await ctx.db.transaction(async (tx) => {
    const u = await findOrCreateInvitee(tx, body);
    const [inserted] = await tx.insert(merchantStaff).values({ merchantId, userId: u.id, role: body.role }).onConflictDoNothing().returning();
    if (!inserted) throw conflict("This person is already on your team");
    await writeAudit(tx, { actorUserId, merchantId, action: "staff.invited", entity: "user", entityId: u.id, data: { role: body.role } });
    return u;
  });
  await sendStaffInvite(ctx, { merchantName: m.name, role: body.role, email: body.email ?? user.email, phone: body.email ? null : user.phone });
  await recordMilestone(ctx.db, merchantId, "staff_added", ctx.now());
  return serialize(await getStaff(ctx.db, merchantId, user.id));
}

async function ownerCount(db: DbOrTx, merchantId: string, excludingUserId?: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(merchantStaff)
    .where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.role, "owner"), excludingUserId ? ne(merchantStaff.userId, excludingUserId) : undefined));
  return Number(row?.n ?? 0);
}

export async function updateStaffRole(ctx: AppContext, merchantId: string, actorUserId: string, userId: string, role: StaffRole) {
  return updateStaffMember(ctx, merchantId, actorUserId, userId, { role });
}

/** Change a team member's role (owner only, enforced by the route), language and/or kitchen station. */
export async function updateStaffMember(
  ctx: AppContext,
  merchantId: string,
  actorUserId: string,
  userId: string,
  patch: { role?: StaffRole; locale?: Locale; station?: string | null },
) {
  return ctx.db.transaction(async (tx) => {
    const current = await getStaff(tx, merchantId, userId);
    const role = patch.role ?? current.role;
    if (current.role === "owner" && role !== "owner" && (await ownerCount(tx, merchantId, userId)) === 0) {
      throw conflict("A shop needs at least one owner. Make someone else an owner first.");
    }
    const set: Partial<typeof merchantStaff.$inferInsert> = {};
    if (patch.role !== undefined) set.role = role;
    if (patch.locale !== undefined) set.locale = patch.locale;
    if (patch.station !== undefined) set.station = patch.station?.trim() ? patch.station.trim() : null;
    await tx.update(merchantStaff).set(set).where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.userId, userId)));
    if (patch.role !== undefined && patch.role !== current.role) {
      await writeAudit(tx, { actorUserId, merchantId, action: "staff.role_changed", entity: "user", entityId: userId, data: { from: current.role, to: role } });
    }
    if (patch.locale !== undefined || patch.station !== undefined) {
      await writeAudit(tx, { actorUserId, merchantId, action: "staff.profile_changed", entity: "user", entityId: userId, data: { locale: set.locale ?? undefined, station: patch.station === undefined ? undefined : (set.station ?? null) } });
    }
    return serialize({ ...current, ...set, role });
  });
}

export async function removeStaff(ctx: AppContext, merchantId: string, actorUserId: string, userId: string) {
  await ctx.db.transaction(async (tx) => {
    const current = await getStaff(tx, merchantId, userId);
    if (current.role === "owner" && (await ownerCount(tx, merchantId, userId)) === 0) {
      throw conflict("You can't remove the last owner");
    }
    await tx.delete(merchantStaff).where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.userId, userId)));
    await writeAudit(tx, { actorUserId, merchantId, action: "staff.removed", entity: "user", entityId: userId, data: { role: current.role } });
  });
}

/**
 * Owner sets a 4–6 digit counter PIN for a team member. Hashing and the
 * "unique within a shop" rule live in services/auth.ts (shared with the
 * self-service PUT /merchants/:merchantId/staff-pin).
 */
export async function setStaffPinFor(ctx: AppContext, merchantId: string, actorUserId: string, userId: string, pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw badRequest("PIN must be 4–6 digits");
  await getStaff(ctx.db, merchantId, userId);
  await setStaffPin(ctx, merchantId, userId, pin);
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "staff.pin_set", entity: "user", entityId: userId });
}
