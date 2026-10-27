/**
 * Appointments (Café & Retail: booking.appointments): the price list, staff hours and time off, computed
 * availability, and the staff side of the calendar (create, move, resize, status, walk-ins).
 * Customer booking, payments and jobs live in appointments-booking.ts; checkout in appointments-checkout.ts.
 *
 * Availability is computed, never stored per slot: free starts at 15-minute steps where one staff member
 * has working hours, no time off, no overlapping appointment and room for duration plus buffer. The database
 * also refuses overlaps (an exclusion constraint on staff_id and time range, migration 0011), so two people
 * racing for the same chair can't both win: the loser gets 409 slot_taken.
 */
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  appointments,
  locations,
  merchantCategories,
  merchantMembers,
  merchantStaff,
  merchants,
  services,
  staffHours,
  staffServices,
  staffTimeOff,
  users,
  type AppointmentItemRow,
  type DbOrTx,
} from "@ll/db";
import { appointmentsApi, normalizeLocale, salesTaxCopy, tipsEnabledFor } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { merchantProvince } from "./tax.js";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { addDays, zonedToUtc } from "./bookings.js";
import { iso } from "./commerceShared.js";
import { findOrCreateCustomerByPhone } from "./ledger.js";
import { requirePhone } from "./merchant.js";
import { assertNoPharmacyNotes, isPharmacy, pharmacyServiceFields } from "./pharmacy-guard.js";

export type Merchant = typeof merchants.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Service = typeof services.$inferSelect;

const { ACTIVE_APPOINTMENT_STATUSES, SLOT_STEP_MIN } = appointmentsApi;
const MIN = 60_000;
const ACTIVE = [...ACTIVE_APPOINTMENT_STATUSES] as string[];

// ---------------------------------------------------------------------------
// Time zone helpers
// ---------------------------------------------------------------------------
/** Local calendar date, minutes after local midnight and weekday (0 = Sunday) of an instant in a time zone. */
export function localParts(at: Date, timeZone: string): { date: string; minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const date = `${String(get("year")).padStart(4, "0")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;
  return { date, minutes: get("hour") * 60 + get("minute"), weekday: weekdayOf(date) };
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "09:00:00" or "9:00" to minutes after midnight. */
export function hhmmToMinutes(v: string): number {
  const [h, m] = v.split(":").map(Number) as [number, number];
  return h * 60 + m;
}
export const minutesToHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : (parts[0]![1] ?? ""))).toUpperCase();
}

/** Postgres exclusion violation (23P01) wrapped or not by the driver. */
export function isOverlapError(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23P01" || e?.cause?.code === "23P01";
}
export const slotTaken = () => new HttpError(409, "slot_taken", "That time was just taken. Pick another.");

/** Run a write that may collide with another appointment and turn the constraint error into 409 slot_taken. */
export async function guardOverlap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isOverlapError(err)) throw slotTaken();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Feature + merchant helpers
// ---------------------------------------------------------------------------
/** The location a booking is for: the one asked for, else the shop's first active location. */
export async function resolveLocation(db: DbOrTx, merchantId: string, locationId?: string | null) {
  const rows = await db.select().from(locations).where(and(eq(locations.merchantId, merchantId), eq(locations.active, true))).orderBy(asc(locations.createdAt), asc(locations.id));
  const loc = locationId ? rows.find((l) => l.id === locationId) : rows[0];
  if (!loc) throw locationId ? notFound("Location") : badRequest("Add a location first");
  return loc;
}

// ---------------------------------------------------------------------------
// Services (price list)
// ---------------------------------------------------------------------------
export function serviceDto(s: Service, staffIds: string[], categoryName: string | null): appointmentsApi.ServiceDto {
  return {
    id: s.id,
    merchantId: s.merchantId,
    kind: s.kind as appointmentsApi.ServiceKind,
    name: s.name,
    description: s.description,
    durationMin: s.durationMin,
    priceCents: s.priceCents,
    priceFrom: s.priceFrom,
    depositCents: s.depositCents,
    bufferMin: s.bufferMin,
    categoryId: s.categoryId,
    categoryName,
    rebookAfterDays: s.rebookAfterDays,
    taxable: s.taxable,
    active: s.active,
    sort: s.sort,
    translations: s.translations ?? {},
    staffIds,
  };
}

async function serviceDtos(db: DbOrTx, rows: Service[]): Promise<appointmentsApi.ServiceDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [assigned, cats] = await Promise.all([
    db.select({ serviceId: staffServices.serviceId, userId: staffServices.userId }).from(staffServices).where(inArray(staffServices.serviceId, ids)),
    db.select({ id: merchantCategories.id, name: merchantCategories.name }).from(merchantCategories).where(inArray(merchantCategories.id, rows.map((r) => r.categoryId).filter((c): c is string => !!c))),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  return rows.map((r) => serviceDto(r, assigned.filter((a) => a.serviceId === r.id).map((a) => a.userId), r.categoryId ? (catName.get(r.categoryId) ?? null) : null));
}

export async function listServices(db: DbOrTx, merchantId: string, q: z.infer<typeof appointmentsApi.listServicesQuery>): Promise<appointmentsApi.ServicesResponse> {
  const kind = q.kind ?? "appointment";
  const active = q.active === undefined ? undefined : q.active === "1" || q.active === "true";
  const rows = await db
    .select()
    .from(services)
    .where(and(eq(services.merchantId, merchantId), eq(services.kind, kind), active === undefined ? undefined : eq(services.active, active)))
    .orderBy(asc(services.sort), asc(services.name), asc(services.id));
  return { items: await serviceDtos(db, rows) };
}

async function assertCategory(db: DbOrTx, merchantId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const [c] = await db.select({ id: merchantCategories.id }).from(merchantCategories).where(and(eq(merchantCategories.id, categoryId), eq(merchantCategories.merchantId, merchantId))).limit(1);
  if (!c) throw badRequest("Unknown category");
}

async function assertBookableStaff(db: DbOrTx, merchantId: string, userIds: string[]) {
  if (!userIds.length) return;
  const rows = await db.select({ userId: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, merchantId), inArray(merchantStaff.userId, userIds)));
  if (rows.length !== new Set(userIds).size) throw badRequest("Unknown staff member");
}

async function setServiceStaff(db: DbOrTx, merchantId: string, serviceId: string, staffIds: string[]) {
  await assertBookableStaff(db, merchantId, staffIds);
  const existing = await db.select().from(staffServices).where(eq(staffServices.serviceId, serviceId));
  const keep = new Set(staffIds);
  const drop = existing.filter((e) => !keep.has(e.userId)).map((e) => e.userId);
  if (drop.length) await db.delete(staffServices).where(and(eq(staffServices.serviceId, serviceId), inArray(staffServices.userId, drop)));
  const have = new Set(existing.map((e) => e.userId));
  const add = [...keep].filter((u) => !have.has(u));
  if (add.length) await db.insert(staffServices).values(add.map((userId) => ({ merchantId, userId, serviceId })));
}

/** The shop's vertical: pharmacies get fixed appointment settings (see pharmacy-guard.ts). */
async function verticalOf(db: DbOrTx, merchantId: string) {
  const [m] = await db.select({ vertical: merchants.vertical }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  return m ?? { vertical: "" };
}

export async function createService(db: DbOrTx, merchantId: string, body: z.output<typeof appointmentsApi.createServiceBody>): Promise<appointmentsApi.ServiceDto> {
  await assertCategory(db, merchantId, body.categoryId);
  const { staffIds, ...rawFields } = body;
  const fields = isPharmacy(await verticalOf(db, merchantId)) ? { ...rawFields, ...(await pharmacyServiceFields(db, merchantId, rawFields)) } : rawFields;
  const [row] = await db.insert(services).values({ ...fields, merchantId, description: fields.description ?? null, categoryId: fields.categoryId ?? null, rebookAfterDays: fields.rebookAfterDays ?? null, translations: fields.translations ?? {} }).returning();
  if (staffIds?.length) await setServiceStaff(db, merchantId, row!.id, staffIds);
  return (await serviceDtos(db, [row!]))[0]!;
}

export async function getService(db: DbOrTx, merchantId: string, serviceId: string): Promise<Service> {
  const [s] = await db.select().from(services).where(and(eq(services.id, serviceId), eq(services.merchantId, merchantId))).limit(1);
  if (!s) throw notFound("Service");
  return s;
}

export async function updateService(ctx: AppContext, merchantId: string, serviceId: string, body: z.output<typeof appointmentsApi.updateServiceBody>): Promise<appointmentsApi.ServiceDto> {
  const cur = await getService(ctx.db, merchantId, serviceId);
  await assertCategory(ctx.db, merchantId, body.categoryId);
  const { staffIds, ...rawFields } = body;
  const fields = isPharmacy(await verticalOf(ctx.db, merchantId)) ? { ...rawFields, ...(await pharmacyServiceFields(ctx.db, merchantId, { name: rawFields.name ?? cur.name, description: rawFields.description !== undefined ? rawFields.description : cur.description })) } : rawFields;
  const next = { ...cur, ...fields };
  if (cur.kind === "appointment" && next.durationMin < 5) throw badRequest("An appointment service needs at least 5 minutes");
  if (next.priceCents > 0 && next.depositCents > next.priceCents) throw badRequest("The deposit can't be more than the price");
  const [row] = await ctx.db.update(services).set({ ...fields, updatedAt: ctx.now() }).where(eq(services.id, cur.id)).returning();
  if (staffIds) await setServiceStaff(ctx.db, merchantId, cur.id, staffIds);
  return (await serviceDtos(ctx.db, [row!]))[0]!;
}

export async function deleteService(db: DbOrTx, merchantId: string, serviceId: string): Promise<void> {
  const cur = await getService(db, merchantId, serviceId);
  await db.delete(services).where(eq(services.id, cur.id));
}

// ---------------------------------------------------------------------------
// Staff: bookable people, hours, time off, which services they do
// ---------------------------------------------------------------------------
type StaffUser = { userId: string; name: string; role: "owner" | "manager" | "staff" };

async function merchantStaffUsers(db: DbOrTx, merchantId: string): Promise<StaffUser[]> {
  const rows = await db
    .select({ userId: merchantStaff.userId, role: merchantStaff.role, name: users.name, email: users.email, phone: users.phone })
    .from(merchantStaff)
    .innerJoin(users, eq(users.id, merchantStaff.userId))
    .where(eq(merchantStaff.merchantId, merchantId))
    .orderBy(asc(merchantStaff.createdAt), asc(merchantStaff.userId));
  return rows.map((r) => ({ userId: r.userId, role: r.role, name: r.name?.trim() || r.email?.split("@")[0] || r.phone || "Staff" }));
}

const hoursDto = (h: typeof staffHours.$inferSelect): appointmentsApi.StaffHoursDto => ({ id: h.id, locationId: h.locationId, userId: h.userId, weekday: h.weekday, startsLocal: h.startsLocal.slice(0, 5), endsLocal: h.endsLocal.slice(0, 5) });
const timeOffDto = (t: typeof staffTimeOff.$inferSelect): appointmentsApi.TimeOffDto => ({ id: t.id, userId: t.userId, startsAt: t.startsAt.toISOString(), endsAt: t.endsAt.toISOString(), reason: t.reason });

/** Everyone who takes appointments (has weekly hours or a service list), with hours, time off and services. */
export async function listBookableStaff(db: DbOrTx, merchant: Merchant, now: Date, q: { from?: Date; to?: Date } = {}): Promise<appointmentsApi.CalendarStaffResponse> {
  const from = q.from ?? new Date(now.getTime() - 24 * 60 * MIN);
  const to = q.to ?? new Date(now.getTime() + 90 * 24 * 60 * MIN);
  const [people, hours, offs, svcs, locs, activeServices] = await Promise.all([
    merchantStaffUsers(db, merchant.id),
    db.select().from(staffHours).where(eq(staffHours.merchantId, merchant.id)).orderBy(asc(staffHours.weekday), asc(staffHours.startsLocal)),
    db.select().from(staffTimeOff).where(and(eq(staffTimeOff.merchantId, merchant.id), gt(staffTimeOff.endsAt, from), lt(staffTimeOff.startsAt, to))).orderBy(asc(staffTimeOff.startsAt)),
    db.select().from(staffServices).where(eq(staffServices.merchantId, merchant.id)),
    db.select().from(locations).where(and(eq(locations.merchantId, merchant.id), eq(locations.active, true))).orderBy(asc(locations.createdAt), asc(locations.id)),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(services).where(and(eq(services.merchantId, merchant.id), eq(services.kind, "appointment"), eq(services.active, true))),
  ]);
  const bookable = people.filter((p) => hours.some((h) => h.userId === p.userId) || svcs.some((s) => s.userId === p.userId));
  const items = bookable.map(
    (p): appointmentsApi.BookableStaffDto => ({
      userId: p.userId,
      name: p.name,
      initials: initialsOf(p.name),
      role: p.role,
      hours: hours.filter((h) => h.userId === p.userId).map(hoursDto),
      timeOff: offs.filter((o) => o.userId === p.userId).map(timeOffDto),
      services: svcs.filter((s) => s.userId === p.userId).map((s) => ({ serviceId: s.serviceId, durationMin: s.durationMin, priceCents: s.priceCents })),
    }),
  );
  const withHours = new Set(hours.map((h) => h.userId)).size;
  const serviceCount = activeServices[0]?.n ?? 0;
  return {
    items,
    setup: { services: serviceCount, staffWithHours: withHours, ready: serviceCount > 0 && withHours > 0 },
    timezone: merchant.timezone,
    locations: locs.map((l) => ({ id: l.id, name: l.name, hours: l.hours ?? null })),
  };
}

export async function putStaffHours(db: DbOrTx, merchant: Merchant, userId: string, body: z.output<typeof appointmentsApi.putStaffHoursBody>): Promise<appointmentsApi.StaffHoursDto[]> {
  await assertBookableStaff(db, merchant.id, [userId]);
  const loc = await resolveLocation(db, merchant.id, body.locationId);
  // Shifts on one day must not overlap each other.
  const byDay = new Map<number, [number, number][]>();
  for (const d of body.days) {
    const list = byDay.get(d.weekday) ?? [];
    const s = hhmmToMinutes(d.startsLocal);
    const e = hhmmToMinutes(d.endsLocal);
    if (list.some(([a, b]) => s < b && e > a)) throw badRequest("Shifts on the same day can't overlap");
    list.push([s, e]);
    byDay.set(d.weekday, list);
  }
  await db.delete(staffHours).where(and(eq(staffHours.merchantId, merchant.id), eq(staffHours.userId, userId), eq(staffHours.locationId, loc.id)));
  if (!body.days.length) return [];
  const rows = await db
    .insert(staffHours)
    .values(body.days.map((d) => ({ merchantId: merchant.id, locationId: loc.id, userId, weekday: d.weekday, startsLocal: d.startsLocal, endsLocal: d.endsLocal })))
    .returning();
  return rows.map(hoursDto).sort((a, b) => a.weekday - b.weekday || a.startsLocal.localeCompare(b.startsLocal));
}

export async function createTimeOff(db: DbOrTx, merchantId: string, userId: string, body: z.output<typeof appointmentsApi.createTimeOffBody>): Promise<appointmentsApi.TimeOffDto> {
  await assertBookableStaff(db, merchantId, [userId]);
  const [row] = await db.insert(staffTimeOff).values({ merchantId, userId, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), reason: body.reason ?? null }).returning();
  return timeOffDto(row!);
}

export async function deleteTimeOff(db: DbOrTx, merchantId: string, timeOffId: string): Promise<void> {
  const rows = await db.delete(staffTimeOff).where(and(eq(staffTimeOff.id, timeOffId), eq(staffTimeOff.merchantId, merchantId))).returning({ id: staffTimeOff.id });
  if (!rows.length) throw notFound("Time off");
}

export async function putStaffServices(db: DbOrTx, merchantId: string, userId: string, body: z.output<typeof appointmentsApi.putStaffServicesBody>): Promise<appointmentsApi.StaffServiceDto[]> {
  await assertBookableStaff(db, merchantId, [userId]);
  if (isPharmacy(await verticalOf(db, merchantId)) && body.services.some((s) => s.priceCents)) throw badRequest("Pharmacy appointments have no price");
  const ids = [...new Set(body.services.map((s) => s.serviceId))];
  if (ids.length) {
    const found = await db.select({ id: services.id }).from(services).where(and(eq(services.merchantId, merchantId), eq(services.kind, "appointment"), inArray(services.id, ids)));
    if (found.length !== ids.length) throw badRequest("Unknown service");
  }
  await db.delete(staffServices).where(and(eq(staffServices.merchantId, merchantId), eq(staffServices.userId, userId)));
  if (!body.services.length) return [];
  const rows = await db
    .insert(staffServices)
    .values(body.services.map((s) => ({ merchantId, userId, serviceId: s.serviceId, durationMin: s.durationMin ?? null, priceCents: s.priceCents ?? null })))
    .returning();
  return rows.map((r) => ({ serviceId: r.serviceId, durationMin: r.durationMin, priceCents: r.priceCents }));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function settingsDto(ctx: AppContext, m: Merchant): Promise<appointmentsApi.AppointmentSettingsDto> {
  return { cancelWindowHours: m.cancelWindowHours, noShowFeeCents: m.noShowFeeCents, tipsEnabled: m.tipsEnabled, tipsOn: tipsEnabledFor(m.vertical, m.tipsEnabled), tipPresets: m.tipPresets, tax: salesTaxCopy({ province: await merchantProvince(ctx.db, m), taxRegistered: m.taxRegistered }) };
}

export async function updateSettings(ctx: AppContext, merchant: Merchant, body: z.output<typeof appointmentsApi.appointmentSettingsBody>): Promise<appointmentsApi.AppointmentSettingsDto> {
  const patch: Partial<typeof merchants.$inferInsert> = {};
  if (body.cancelWindowHours !== undefined) patch.cancelWindowHours = body.cancelWindowHours;
  if (body.noShowFeeCents !== undefined) {
    if (isPharmacy(merchant) && body.noShowFeeCents > 0) throw badRequest("Pharmacy appointments have no no-show fee");
    patch.noShowFeeCents = body.noShowFeeCents;
  }
  if (body.tipsEnabled !== undefined) patch.tipsEnabled = body.tipsEnabled;
  if (body.tipPresets !== undefined) patch.tipPresets = body.tipPresets;
  if (!Object.keys(patch).length) return settingsDto(ctx, merchant);
  const [row] = await ctx.db.update(merchants).set({ ...patch, updatedAt: ctx.now() }).where(eq(merchants.id, merchant.id)).returning();
  return settingsDto(ctx, row!);
}

// ---------------------------------------------------------------------------
// Items: what a booking is made of for a given stylist
// ---------------------------------------------------------------------------
export interface ResolvedItems {
  items: AppointmentItemRow[];
  /** Sum of durations plus buffers: how long the chair is busy. */
  blockMin: number;
  totalCents: number;
  depositCents: number;
}

type StaffServiceRow = typeof staffServices.$inferSelect;

/** Items for these services as one stylist does them (their own duration and price, when set). */
export function itemsFor(svcs: Service[], staffId: string | null, overrides: StaffServiceRow[]): ResolvedItems {
  const items: AppointmentItemRow[] = [];
  let block = 0;
  let deposit = 0;
  for (const s of svcs) {
    const o = staffId ? overrides.find((x) => x.userId === staffId && x.serviceId === s.id) : undefined;
    const durationMin = o?.durationMin ?? s.durationMin;
    items.push({ serviceId: s.id, name: s.name, durationMin, priceCents: o?.priceCents ?? s.priceCents });
    block += durationMin + s.bufferMin;
    deposit += s.depositCents;
  }
  const totalCents = items.reduce((n, i) => n + i.priceCents, 0);
  return { items, blockMin: block, totalCents, depositCents: Math.min(deposit, totalCents) };
}

export async function loadAppointmentServices(db: DbOrTx, merchantId: string, serviceIds: string[], opts: { requireActive?: boolean } = {}): Promise<Service[]> {
  const ids = [...new Set(serviceIds)];
  if (!ids.length) return [];
  const rows = await db.select().from(services).where(and(eq(services.merchantId, merchantId), eq(services.kind, "appointment"), inArray(services.id, ids)));
  if (rows.length !== ids.length || (opts.requireActive && rows.some((r) => !r.active))) throw badRequest("One of those services isn't available");
  // Keep the caller's order.
  return serviceIds.filter((id, i) => serviceIds.indexOf(id) === i).map((id) => rows.find((r) => r.id === id)!);
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------
interface ShiftRow {
  userId: string;
  weekday: number;
  start: number;
  end: number;
}

/** An unconfirmed online booking whose hold ran out no longer blocks the chair. */
const liveHold = (now: Date) => or(isNull(appointments.holdExpiresAt), gt(appointments.holdExpiresAt, now));

/** Active appointments for these people overlapping a window. */
async function busyFor(db: DbOrTx, merchantId: string, userIds: string[], from: Date, to: Date, now: Date, excludeId?: string) {
  if (!userIds.length) return [];
  return db
    .select({ id: appointments.id, staffId: appointments.staffId, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.merchantId, merchantId),
        inArray(appointments.staffId, userIds),
        inArray(appointments.status, ACTIVE),
        lt(appointments.startsAt, to),
        gt(appointments.endsAt, from),
        liveHold(now),
        excludeId ? ne(appointments.id, excludeId) : undefined,
      ),
    );
}

export interface AvailabilityOptions {
  /** Ignore this appointment when checking busy time (rescheduling it). */
  excludeAppointmentId?: string;
  /** Include times that have already started (staff tools). */
  includePast?: boolean;
}

const MAX_DAYS = 31;

/**
 * Free starts for a set of services, per local day. A specific stylist, or "any" (each time carries the
 * stylist the shop would assign: the one with the least booked time that day, then by id).
 */
export async function computeAvailability(
  ctx: AppContext,
  merchant: Merchant,
  q: { serviceIds: string[]; staffId: "any" | string; from: string; to: string; locationId?: string | null },
  opts: AvailabilityOptions = {},
): Promise<appointmentsApi.AvailabilityResponse> {
  const now = ctx.now();
  const tz = merchant.timezone;
  const svcs = await loadAppointmentServices(ctx.db, merchant.id, q.serviceIds, { requireActive: true });
  const loc = await resolveLocation(ctx.db, merchant.id, q.locationId);
  const days: string[] = [];
  for (let d = q.from; d <= q.to && days.length <= MAX_DAYS; d = addDays(d, 1)) days.push(d);
  if (!days.length || days.length > MAX_DAYS) throw badRequest(`Ask for between 1 and ${MAX_DAYS} days`);

  const [hours, assignments, people] = await Promise.all([
    ctx.db.select().from(staffHours).where(and(eq(staffHours.merchantId, merchant.id), eq(staffHours.locationId, loc.id))),
    ctx.db.select().from(staffServices).where(eq(staffServices.merchantId, merchant.id)),
    merchantStaffUsers(ctx.db, merchant.id),
  ]);
  const staffIds = new Set(people.map((p) => p.userId));
  // Who can do all the chosen services: if a service has a staff list, they must be on it.
  const eligible = [...new Set(hours.map((h) => h.userId))].filter((u) => {
    if (!staffIds.has(u)) return false;
    if (q.staffId !== "any" && u !== q.staffId) return false;
    return svcs.every((s) => {
      const assigned = assignments.filter((a) => a.serviceId === s.id);
      return assigned.length === 0 || assigned.some((a) => a.userId === u);
    });
  });
  const windowStart = zonedToUtc(days[0]!, 0, tz);
  const windowEnd = zonedToUtc(addDays(days[days.length - 1]!, 1), 0, tz);
  const [busy, off] = await Promise.all([
    busyFor(ctx.db, merchant.id, eligible, windowStart, windowEnd, now, opts.excludeAppointmentId),
    eligible.length ? ctx.db.select().from(staffTimeOff).where(and(eq(staffTimeOff.merchantId, merchant.id), inArray(staffTimeOff.userId, eligible), lt(staffTimeOff.startsAt, windowEnd), gt(staffTimeOff.endsAt, windowStart))) : Promise.resolve([]),
  ]);

  const shifts: ShiftRow[] = hours.filter((h) => eligible.includes(h.userId)).map((h) => ({ userId: h.userId, weekday: h.weekday, start: hhmmToMinutes(h.startsLocal), end: hhmmToMinutes(h.endsLocal) }));
  const blockFor = (userId: string) => itemsFor(svcs, userId, assignments).blockMin;
  const bookedMinutes = (userId: string, date: string) =>
    busy.filter((b) => b.staffId === userId && localParts(b.startsAt, tz).date === date).reduce((n, b) => n + (b.endsAt.getTime() - b.startsAt.getTime()) / MIN, 0);

  const out: appointmentsApi.AvailabilityResponse["days"] = [];
  for (const date of days) {
    const weekday = weekdayOf(date);
    const picks = new Map<number, { startsAt: Date; staffId: string; booked: number }>();
    for (const userId of eligible) {
      const block = blockFor(userId);
      const myBusy = busy.filter((b) => b.staffId === userId);
      const myOff = off.filter((o) => o.userId === userId);
      for (const sh of shifts.filter((s) => s.userId === userId && s.weekday === weekday)) {
        const shiftEnd = zonedToUtc(date, sh.end, tz).getTime();
        let lastMs = -1;
        for (let m = Math.ceil(sh.start / SLOT_STEP_MIN) * SLOT_STEP_MIN; m < sh.end; m += SLOT_STEP_MIN) {
          const startMs = zonedToUtc(date, m, tz).getTime();
          if (startMs <= lastMs) continue; // a local time skipped or repeated by a clock change
          lastMs = startMs;
          const endMs = startMs + block * MIN;
          if (endMs > shiftEnd) break;
          if (!opts.includePast && startMs <= now.getTime()) continue;
          if (myBusy.some((b) => b.startsAt.getTime() < endMs && b.endsAt.getTime() > startMs)) continue;
          if (myOff.some((o) => o.startsAt.getTime() < endMs && o.endsAt.getTime() > startMs)) continue;
          const booked = bookedMinutes(userId, date);
          const cur = picks.get(startMs);
          if (!cur || booked < cur.booked || (booked === cur.booked && userId < cur.staffId)) picks.set(startMs, { startsAt: new Date(startMs), staffId: userId, booked });
        }
      }
    }
    const times = [...picks.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).map((p) => ({ startsAt: p.startsAt.toISOString(), staffId: p.staffId }));
    out.push({ date, times });
  }
  const blockMin = q.staffId !== "any" ? blockFor(q.staffId) : itemsFor(svcs, null, assignments).blockMin;
  return { timezone: tz, blockMin, days: out };
}

/**
 * Is this start free for these services? Returns the stylist to use (the requested one, or the one the shop
 * assigns for "any"). Throws 409 slot_taken otherwise.
 */
export async function assertBookable(
  ctx: AppContext,
  merchant: Merchant,
  args: { serviceIds: string[]; staffId: string | null; startsAt: Date; locationId?: string | null },
  opts: AvailabilityOptions = {},
): Promise<{ staffId: string }> {
  const date = localParts(args.startsAt, merchant.timezone).date;
  const av = await computeAvailability(ctx, merchant, { serviceIds: args.serviceIds, staffId: args.staffId ?? "any", from: date, to: date, locationId: args.locationId }, opts);
  const hit = av.days[0]?.times.find((t) => new Date(t.startsAt).getTime() === args.startsAt.getTime());
  if (!hit) throw slotTaken();
  return { staffId: hit.staffId };
}

// ---------------------------------------------------------------------------
// Working-hours check for staff-made bookings
// ---------------------------------------------------------------------------
/** Why this person can't take [start, end), or null when they can. */
export async function offReason(db: DbOrTx, merchant: Merchant, locationId: string, staffId: string, start: Date, end: Date): Promise<string | null> {
  const tz = merchant.timezone;
  const s = localParts(start, tz);
  const e = localParts(new Date(end.getTime() - 1), tz);
  const [who] = await db.select({ name: users.name }).from(users).where(eq(users.id, staffId)).limit(1);
  const name = who?.name?.split(" ")[0] ?? "They";
  if (s.date !== e.date) return `${name} isn't working through midnight`;
  const rows = await db.select().from(staffHours).where(and(eq(staffHours.merchantId, merchant.id), eq(staffHours.userId, staffId), eq(staffHours.locationId, locationId), eq(staffHours.weekday, s.weekday)));
  const startM = s.minutes;
  const endM = e.minutes + 1;
  if (!rows.some((r) => hhmmToMinutes(r.startsLocal) <= startM && hhmmToMinutes(r.endsLocal) >= endM)) return `${name} isn't working then`;
  const [off] = await db.select({ id: staffTimeOff.id }).from(staffTimeOff).where(and(eq(staffTimeOff.merchantId, merchant.id), eq(staffTimeOff.userId, staffId), lt(staffTimeOff.startsAt, end), gt(staffTimeOff.endsAt, start))).limit(1);
  if (off) return `${name} has time off then`;
  return null;
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
export function totalOf(items: AppointmentItemRow[]): number {
  return items.reduce((n, i) => n + i.priceCents, 0);
}

export async function appointmentDtos(db: DbOrTx, rows: Appointment[]): Promise<appointmentsApi.AppointmentDto[]> {
  if (!rows.length) return [];
  const userIds = [...new Set(rows.flatMap((r) => [r.userId, r.staffId]).filter((u): u is string => !!u))];
  const us = userIds.length ? await db.select({ id: users.id, name: users.name, phone: users.phone, locale: users.locale }).from(users).where(inArray(users.id, userIds)) : [];
  const byId = new Map(us.map((u) => [u.id, u]));
  return rows.map((r): appointmentsApi.AppointmentDto => {
    const cust = r.userId ? byId.get(r.userId) : undefined;
    const staff = r.staffId ? byId.get(r.staffId) : undefined;
    return {
      id: r.id,
      merchantId: r.merchantId,
      locationId: r.locationId,
      customer: { id: r.userId, name: cust?.name?.trim() || r.customerName || "Walk-in", phone: cust?.phone ?? null, language: normalizeLocale(cust?.locale) ?? "en" },
      staffId: r.staffId,
      staffName: staff?.name?.trim() ?? null,
      requestedStaff: r.requestedStaff,
      source: r.source as appointmentsApi.AppointmentSource,
      items: r.items,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status as appointmentsApi.AppointmentStatus,
      groupId: r.groupId,
      notes: r.notes,
      clientNote: r.clientNote,
      totalCents: totalOf(r.items),
      depositCents: r.depositCents,
      depositPaidAt: iso(r.depositPaidAt),
      hasCardOnFile: !!r.paymentMethodId,
      noShowFeeCents: r.noShowFeeCents,
      feeChargedAt: iso(r.feeChargedAt),
      cancelledAt: iso(r.cancelledAt),
      cancelReason: r.cancelReason,
      arrivedAt: iso(r.arrivedAt),
      startedAt: iso(r.startedAt),
      completedAt: iso(r.completedAt),
      invoiceId: r.invoiceId,
      holdExpiresAt: iso(r.holdExpiresAt),
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function appointmentDto(db: DbOrTx, row: Appointment): Promise<appointmentsApi.AppointmentDto> {
  return (await appointmentDtos(db, [row]))[0]!;
}

export async function getAppointment(db: DbOrTx, merchantId: string, id: string): Promise<Appointment> {
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.merchantId, merchantId))).limit(1);
  if (!a) throw notFound("Appointment");
  return a;
}

export async function listAppointments(db: DbOrTx, merchant: Merchant, q: z.output<typeof appointmentsApi.listAppointmentsQuery>, now: Date): Promise<appointmentsApi.AppointmentsResponse> {
  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.merchantId, merchant.id),
        lt(appointments.startsAt, new Date(q.to)),
        gt(appointments.endsAt, new Date(q.from)),
        q.staffId ? eq(appointments.staffId, q.staffId) : undefined,
        q.locationId ? eq(appointments.locationId, q.locationId) : undefined,
        q.status ? eq(appointments.status, q.status) : ne(appointments.status, "cancelled"),
        // An online booking still waiting on its deposit after the hold ran out is as good as gone.
        liveHold(now),
      ),
    )
    .orderBy(asc(appointments.startsAt), asc(appointments.id))
    .limit(1000);
  return { items: await appointmentDtos(db, rows) };
}

/** The appointment plus the client's last completed visits, for the right-hand sheet. */
export async function appointmentDetail(db: DbOrTx, merchant: Merchant, id: string) {
  const a = await getAppointment(db, merchant.id, id);
  const lastVisits = a.userId
    ? await db
        .select({ id: appointments.id, startsAt: appointments.startsAt, items: appointments.items, staffId: appointments.staffId })
        .from(appointments)
        .where(and(eq(appointments.merchantId, merchant.id), eq(appointments.userId, a.userId), eq(appointments.status, "completed"), ne(appointments.id, a.id)))
        .orderBy(desc(appointments.startsAt))
        .limit(3)
    : [];
  const [member] = a.userId ? await db.select({ balance: merchantMembers.balance, visitCount: merchantMembers.visitCount }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchant.id), eq(merchantMembers.userId, a.userId))).limit(1) : [];
  return {
    appointment: await appointmentDto(db, a),
    lastVisits: lastVisits.map((v) => ({ id: v.id, startsAt: v.startsAt.toISOString(), summary: v.items.map((i) => i.name).join(", ") })),
    member: member ?? null,
  };
}

// ---------------------------------------------------------------------------
// Create, move, resize
// ---------------------------------------------------------------------------
function requireManagerForForce(staff: StaffContext, force: boolean) {
  if (force && staff.role === "staff") throw forbidden("A manager can book outside working hours");
}

async function resolveCustomer(ctx: AppContext, c: z.infer<typeof appointmentsApi.appointmentCustomerBody> | undefined): Promise<{ userId: string | null; customerName: string | null }> {
  if (!c) return { userId: null, customerName: null };
  if (c.userId) {
    const [u] = await ctx.db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, c.userId)).limit(1);
    if (!u) throw notFound("Customer");
    return { userId: u.id, customerName: u.name };
  }
  if (c.phone) {
    const { user } = await findOrCreateCustomerByPhone(ctx.db, requirePhone(c.phone), c.name ?? null);
    return { userId: user.id, customerName: user.name ?? c.name ?? null };
  }
  return { userId: null, customerName: c.name?.trim() || null };
}

async function assertStaffMember(db: DbOrTx, merchantId: string, staffId: string | null | undefined) {
  if (!staffId) return;
  const [m] = await db.select({ userId: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.userId, staffId))).limit(1);
  if (!m) throw badRequest("Unknown staff member");
}

export async function createAppointment(ctx: AppContext, staff: StaffContext, body: z.output<typeof appointmentsApi.createAppointmentBody>): Promise<appointmentsApi.AppointmentDto> {
  const merchant = staff.merchant;
  requireManagerForForce(staff, body.force);
  assertNoPharmacyNotes(merchant, body.notes, body.clientNote);
  // Custom lines (a free-text name and price) would put anything on the appointment: a pharmacy books its appointment types only.
  if (isPharmacy(merchant) && body.items.length) throw badRequest("Pharmacy appointments use the appointment types only");
  const now = ctx.now();
  const walkIn = body.source === "walk_in";
  const loc = await resolveLocation(ctx.db, merchant.id, body.locationId);
  await assertStaffMember(ctx.db, merchant.id, body.staffId);
  const svcs = await loadAppointmentServices(ctx.db, merchant.id, body.serviceIds);
  const overrides = body.staffId && svcs.length ? await ctx.db.select().from(staffServices).where(and(eq(staffServices.merchantId, merchant.id), eq(staffServices.userId, body.staffId))) : [];
  const resolved = itemsFor(svcs, body.staffId ?? null, overrides);
  const items = [...resolved.items, ...body.items];
  const block = resolved.blockMin + body.items.reduce((n, i) => n + i.durationMin, 0);
  const startsAt = walkIn ? now : new Date(body.startsAt!);
  const endsAt = body.endsAt ? new Date(body.endsAt) : new Date(startsAt.getTime() + Math.max(5, block) * MIN);
  if (endsAt.getTime() <= startsAt.getTime()) throw badRequest("The appointment must end after it starts");
  if (body.staffId && !walkIn && !body.force) {
    const why = await offReason(ctx.db, merchant, loc.id, body.staffId, startsAt, endsAt);
    if (why) throw new HttpError(409, "outside_hours", why);
  }
  const customer = await resolveCustomer(ctx, body.customer);
  const row = await guardOverlap(async () => {
    const [a] = await ctx.db
      .insert(appointments)
      .values({
        merchantId: merchant.id,
        locationId: loc.id,
        userId: customer.userId,
        customerName: customer.customerName,
        staffId: body.staffId ?? null,
        requestedStaff: body.requestedStaff,
        source: body.source,
        items,
        startsAt,
        endsAt,
        status: walkIn ? "arrived" : "booked",
        arrivedAt: walkIn ? now : null,
        groupId: body.groupId ?? null,
        notes: body.notes ?? null,
        clientNote: body.clientNote ?? null,
        noShowFeeCents: isPharmacy(merchant) ? null : merchant.noShowFeeCents || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return a!;
  });
  return appointmentDto(ctx.db, row);
}

export async function updateAppointment(ctx: AppContext, staff: StaffContext, id: string, body: z.output<typeof appointmentsApi.updateAppointmentBody>): Promise<appointmentsApi.AppointmentDto> {
  const merchant = staff.merchant;
  requireManagerForForce(staff, body.force);
  assertNoPharmacyNotes(merchant, body.notes, body.clientNote);
  if (isPharmacy(merchant) && body.items) throw badRequest("Pharmacy appointments use the appointment types only");
  const cur = await getAppointment(ctx.db, merchant.id, id);
  if (!ACTIVE.includes(cur.status)) throw conflict(`This appointment is ${cur.status.replace("_", " ")}`);
  const staffChanged = body.staffId !== undefined && body.staffId !== cur.staffId;
  if (staffChanged) await assertStaffMember(ctx.db, merchant.id, body.staffId);
  if (staffChanged && cur.requestedStaff && cur.staffId && !body.confirmStaffChange) {
    throw new HttpError(409, "requested_staff", "This client asked for this stylist by name. Confirm to move them to someone else.");
  }
  const nextStaff = body.staffId !== undefined ? body.staffId : cur.staffId;
  let items = cur.items;
  let blockMin: number | null = null;
  if (body.serviceIds) {
    const svcs = await loadAppointmentServices(ctx.db, merchant.id, body.serviceIds);
    const overrides = nextStaff ? await ctx.db.select().from(staffServices).where(and(eq(staffServices.merchantId, merchant.id), eq(staffServices.userId, nextStaff))) : [];
    const r = itemsFor(svcs, nextStaff, overrides);
    items = r.items;
    blockMin = r.blockMin;
  } else if (body.items) {
    items = body.items;
    blockMin = body.items.reduce((n, i) => n + i.durationMin, 0);
  }
  const startsAt = body.startsAt ? new Date(body.startsAt) : cur.startsAt;
  const oldLen = cur.endsAt.getTime() - cur.startsAt.getTime();
  const endsAt = body.endsAt ? new Date(body.endsAt) : new Date(startsAt.getTime() + (blockMin !== null ? Math.max(5, blockMin) * MIN : oldLen));
  if (endsAt.getTime() <= startsAt.getTime()) throw badRequest("The appointment must end after it starts");
  const moved = startsAt.getTime() !== cur.startsAt.getTime() || endsAt.getTime() !== cur.endsAt.getTime() || staffChanged;
  if (moved && nextStaff && !body.force) {
    const why = await offReason(ctx.db, merchant, cur.locationId, nextStaff, startsAt, endsAt);
    if (why) throw new HttpError(409, "outside_hours", why);
  }
  const patch: Partial<typeof appointments.$inferInsert> = { items, startsAt, endsAt, staffId: nextStaff ?? null, updatedAt: ctx.now() };
  if (staffChanged) patch.requestedStaff = false;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.clientNote !== undefined) patch.clientNote = body.clientNote;
  const row = await guardOverlap(async () => (await ctx.db.update(appointments).set(patch).where(eq(appointments.id, cur.id)).returning())[0]!);
  return appointmentDto(ctx.db, row);
}

/** Cancel online holds whose 10 minutes ran out, freeing the chair. Returns how many. */
export async function expireHolds(ctx: AppContext, opts: { merchantId?: string } = {}): Promise<number> {
  const now = ctx.now();
  const rows = await ctx.db
    .update(appointments)
    .set({ status: "cancelled", cancelledAt: now, cancelReason: "hold_expired", holdExpiresAt: null, updatedAt: now })
    .where(and(eq(appointments.status, "booked"), lte(appointments.holdExpiresAt, now), opts.merchantId ? eq(appointments.merchantId, opts.merchantId) : undefined))
    .returning({ id: appointments.id });
  return rows.length;
}

