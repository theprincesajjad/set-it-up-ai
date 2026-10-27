/**
 * Auto care (docs/research/auto-care.md): vehicles under their owner, odometer readings, service reminders by km or months
 * (whichever comes first, from an estimated km a day), the shop's service intervals and the reminder texts.
 * Tires live in auto-tires.ts and the wash in auto-wash.ts.
 *
 * A vehicle belongs to its owner (a user) and follows them across shops; a shop sees only vehicles of its own members.
 * The plate is optional, is shown to staff of the owner's shops and to the owner, and is never in a message. No VIN is stored.
 */
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  autoSettings,
  invoices,
  merchantMembers,
  merchants as merchantsTable,
  messageDeliveries,
  quotes,
  serviceTickets,
  tireSets,
  users,
  vehicleNudges,
  vehicleReadings,
  vehicleServices,
  vehicleShop,
  vehicles,
} from "@ll/db";
import {
  DEFAULT_SERVICES,
  MAX_VEHICLES_PER_OWNER,
  type ServiceDef,
  autoApi,
  formatDate,
  intervalFor,
  kmPerDay,
  normalizeLocale,
  normalizePlate,
  percentOver,
  reminderState,
  textHourOk,
  translator,
  type Locale,
} from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { AuthUser, StaffContext } from "../lib/auth.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { localDate, reserveSmsCredits } from "./messaging.js";
import { isSuppressed, optedOutSet, sendSms } from "./opt-out.js";
import { isFeatureOn } from "./features.js";

type Merchant = typeof merchantsTable.$inferSelect;
type VehicleRow = typeof vehicles.$inferSelect;
type SettingsRow = typeof autoSettings.$inferSelect;
export const DEFAULT_TZ = "America/Toronto";
const todayFor = (ctx: AppContext, tz: string) => localDate(ctx.now(), tz);
const fmtInt = (n: number) => n.toLocaleString("en-CA");

export const vehicleLabel = (v: Pick<VehicleRow, "year" | "make" | "model">): string => [v.year, v.make, v.model].filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getSettingsRow(ctx: AppContext, merchantId: string): Promise<SettingsRow> {
  const [row] = await ctx.db.select().from(autoSettings).where(eq(autoSettings.merchantId, merchantId)).limit(1);
  if (row) return row;
  const [made] = await ctx.db.insert(autoSettings).values({ merchantId }).onConflictDoNothing().returning();
  if (made) return made;
  const [again] = await ctx.db.select().from(autoSettings).where(eq(autoSettings.merchantId, merchantId)).limit(1);
  return again!;
}

export function servicesOf(s: Pick<SettingsRow, "services">): ServiceDef[] {
  return s.services.length ? s.services.map((x) => ({ ...x })) : DEFAULT_SERVICES.map((x) => ({ ...x }));
}

export function settingsDto(s: SettingsRow): autoApi.AutoSettingsDto {
  return {
    services: servicesOf(s).map((x) => ({ key: x.key, label: x.label, everyKm: x.everyKm, everyMonths: x.everyMonths, severeKm: x.severeKm ?? null, severeMonths: x.severeMonths ?? null, active: x.active })),
    autoReminders: s.autoReminders,
    defaultKmPerDay: s.defaultKmPerDay,
    bays: s.bays,
    hoursPerDay: s.hoursPerDay,
    minutesPerSwap: s.minutesPerSwap,
    swapsPerDay: Math.max(0, Math.floor((s.bays * s.hoursPerDay * 60) / Math.max(1, s.minutesPerSwap))),
    fallStart: s.fallStart,
    fallEnd: s.fallEnd,
    springStart: s.springStart,
    springEnd: s.springEnd,
    pickupLeadDays: s.pickupLeadDays,
    washMaxPerDay: s.washMaxPerDay,
  };
}

export async function getSettings(ctx: AppContext, merchantId: string): Promise<autoApi.AutoSettingsDto> {
  return settingsDto(await getSettingsRow(ctx, merchantId));
}

export async function saveSettings(ctx: AppContext, merchantId: string, body: z.output<typeof autoApi.autoSettingsBody>): Promise<autoApi.AutoSettingsDto> {
  await getSettingsRow(ctx, merchantId);
  const patch: Partial<typeof autoSettings.$inferInsert> = { updatedAt: ctx.now() };
  if (body.services) {
    const keys = new Set<string>();
    for (const x of body.services) {
      if (keys.has(x.key)) throw badRequest(`Service "${x.key}" is listed twice.`);
      keys.add(x.key);
      if (x.active && x.everyKm == null && x.everyMonths == null) throw badRequest(`${x.label} needs a km or a months interval.`);
    }
    patch.services = body.services.map((x) => ({ key: x.key, label: x.label, everyKm: x.everyKm, everyMonths: x.everyMonths, severeKm: x.severeKm ?? null, severeMonths: x.severeMonths ?? null, active: x.active }));
  }
  for (const k of ["autoReminders", "defaultKmPerDay", "bays", "hoursPerDay", "minutesPerSwap", "fallStart", "fallEnd", "springStart", "springEnd", "pickupLeadDays", "washMaxPerDay"] as const) {
    if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k];
  }
  if ((body.fallStart ?? "") > (body.fallEnd ?? "99-99") && body.fallStart && body.fallEnd) throw badRequest("The fall window ends before it starts.");
  if (body.springStart && body.springEnd && body.springStart > body.springEnd) throw badRequest("The spring window ends before it starts.");
  const [row] = await ctx.db.update(autoSettings).set(patch).where(eq(autoSettings.merchantId, merchantId)).returning();
  return settingsDto(row!);
}

// ---------------------------------------------------------------------------
// Readings, km a day and reminders for one car at one shop
// ---------------------------------------------------------------------------
async function readingsFor(ctx: AppContext, vehicleIds: string[], merchantId: string | null) {
  if (!vehicleIds.length) return [];
  const conds = [inArray(vehicleReadings.vehicleId, vehicleIds)];
  if (merchantId) conds.push(or(isNull(vehicleReadings.merchantId), eq(vehicleReadings.merchantId, merchantId))!);
  return ctx.db.select().from(vehicleReadings).where(and(...conds)).orderBy(asc(vehicleReadings.day), asc(vehicleReadings.createdAt));
}

function latestOf(rows: { km: number; day: string }[]): { km: number; day: string } | null {
  let best: { km: number; day: string } | null = null;
  for (const r of rows) if (!best || r.day > best.day || (r.day === best.day && r.km > best.km)) best = r;
  return best;
}

function everyText(s: ServiceDef, use: "personal" | "rideshare"): string {
  const iv = intervalFor(s, use);
  const parts = [iv.km ? `${fmtInt(iv.km)} km` : null, iv.months ? `${iv.months} month${iv.months === 1 ? "" : "s"}` : null].filter(Boolean);
  return parts.join(" or ");
}

interface CarCalc {
  perDay: number;
  basis: "override" | "readings" | "default";
  latest: { km: number; day: string } | null;
  reminders: autoApi.ReminderDto[];
}

/** Reminder rows for a car at a shop, from the shop's intervals and its service log. `logs` are all vehicle_services rows for the car at the shop. */
function calcCar(args: { vehicle: VehicleRow; settings: SettingsRow; override: number | null; readings: { km: number; day: string }[]; logs: (typeof vehicleServices.$inferSelect)[]; today: string }): CarCalc {
  const { perDay, basis } = ((): { perDay: number; basis: CarCalc["basis"] } => {
    const k = kmPerDay(args.readings, args.settings.defaultKmPerDay, args.override);
    return { perDay: k.value, basis: k.basis };
  })();
  const latest = latestOf(args.readings);
  const use = args.vehicle.use === "rideshare" ? "rideshare" : "personal";
  const reminders: autoApi.ReminderDto[] = [];
  for (const s of servicesOf(args.settings)) {
    if (!s.active) continue;
    const mine = args.logs.filter((l) => l.serviceKey === s.key).sort((a, b) => (a.doneOn < b.doneOn ? 1 : a.doneOn > b.doneOn ? -1 : 0));
    const last = mine[0] ? { day: mine[0].doneOn, km: mine[0].km } : null;
    const st = reminderState({ service: s, use, last, latest, perDay, today: args.today });
    reminders.push({
      serviceKey: s.key,
      label: s.label,
      every: everyText(s, use),
      lastDoneOn: last?.day ?? null,
      lastKm: last?.km ?? null,
      status: st.status,
      dueOn: st.dueOn,
      basis: st.basis,
      dueByKmOn: st.dueByKmOn,
      dueByMonthsOn: st.dueByMonthsOn,
      dueAtKm: st.dueAtKm,
      daysToDue: st.daysToDue,
    });
  }
  return { perDay, basis, latest, reminders };
}

const RANK: Record<autoApi.ReminderStatusDto, number> = { overdue: 0, due_soon: 1, ok: 2, unknown: 3 };
const worstOf = (r: autoApi.ReminderDto[]): autoApi.ReminderStatusDto => r.reduce<autoApi.ReminderStatusDto>((w, x) => (RANK[x.status] < RANK[w] ? x.status : w), "unknown");

// ---------------------------------------------------------------------------
// The owner's side
// ---------------------------------------------------------------------------
function baseDto(v: VehicleRow, ownerName: string | null): autoApi.VehicleDto {
  return { id: v.id, year: v.year, make: v.make, model: v.model, use: v.use === "rideshare" ? "rideshare" : "personal", plate: v.plate, ownerId: v.userId, ownerName, label: vehicleLabel(v) };
}

async function ownedVehicle(ctx: AppContext, userId: string, id: string): Promise<VehicleRow> {
  const [v] = await ctx.db.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.userId, userId))).limit(1);
  if (!v) throw notFound("Vehicle");
  return v;
}

async function createVehicleFor(ctx: AppContext, ownerId: string, body: { year?: number | null; make: string; model: string; use?: "personal" | "rideshare"; plate?: string | null }): Promise<VehicleRow> {
  const [n] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(vehicles).where(eq(vehicles.userId, ownerId));
  if ((n?.n ?? 0) >= MAX_VEHICLES_PER_OWNER) throw conflict(`Up to ${MAX_VEHICLES_PER_OWNER} vehicles per owner.`);
  const plateNorm = normalizePlate(body.plate);
  if (body.plate?.trim() && !plateNorm) throw badRequest("A plate is 2 to 8 letters and numbers.");
  const [row] = await ctx.db
    .insert(vehicles)
    .values({ userId: ownerId, year: body.year ?? null, make: body.make.trim(), model: body.model.trim(), use: body.use ?? "personal", plate: plateNorm ? body.plate!.trim().toUpperCase() : null, plateNorm })
    .returning();
  return row!;
}

export async function createMyVehicle(ctx: AppContext, user: AuthUser, body: z.output<typeof autoApi.vehicleBody>): Promise<autoApi.VehicleDto> {
  const v = await createVehicleFor(ctx, user.id, body);
  const [me] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, user.id)).limit(1);
  return baseDto(v, me?.name ?? null);
}

export async function updateMyVehicle(ctx: AppContext, user: AuthUser, id: string, body: Partial<z.output<typeof autoApi.vehicleBody>>): Promise<{ ok: true }> {
  await ownedVehicle(ctx, user.id, id);
  await ctx.db.update(vehicles).set(vehiclePatch(ctx, body)).where(eq(vehicles.id, id));
  return { ok: true };
}

function vehiclePatch(ctx: AppContext, body: Partial<z.output<typeof autoApi.vehicleBody>>): Partial<typeof vehicles.$inferInsert> {
  const patch: Partial<typeof vehicles.$inferInsert> = { updatedAt: ctx.now() };
  if (body.year !== undefined) patch.year = body.year ?? null;
  if (body.make !== undefined) patch.make = body.make.trim();
  if (body.model !== undefined) patch.model = body.model.trim();
  if (body.use !== undefined) patch.use = body.use;
  if (body.plate !== undefined) {
    const n = normalizePlate(body.plate);
    if (body.plate?.trim() && !n) throw badRequest("A plate is 2 to 8 letters and numbers.");
    patch.plate = n ? body.plate!.trim().toUpperCase() : null;
    patch.plateNorm = n;
  }
  return patch;
}

/** The vehicle, its readings, service log, nudges, tire sets and swaps go with it (tickets keep their own text). */
export async function deleteMyVehicle(ctx: AppContext, user: AuthUser, id: string): Promise<{ ok: true }> {
  await ownedVehicle(ctx, user.id, id);
  await ctx.db.delete(vehicles).where(eq(vehicles.id, id));
  return { ok: true };
}

export async function addMyReading(ctx: AppContext, user: AuthUser, id: string, body: z.output<typeof autoApi.readingBody>): Promise<autoApi.ReadingDto> {
  await ownedVehicle(ctx, user.id, id);
  const day = body.day ?? todayFor(ctx, DEFAULT_TZ);
  if (day > todayFor(ctx, DEFAULT_TZ)) throw badRequest("A reading cannot be from a future day.");
  return insertReading(ctx, id, null, body.km, day, "owner");
}

async function insertReading(ctx: AppContext, vehicleId: string, merchantId: string | null, km: number, day: string, source: string): Promise<autoApi.ReadingDto> {
  const [row] = await ctx.db.insert(vehicleReadings).values({ vehicleId, merchantId, km, day, source }).returning();
  return { id: row!.id, km: row!.km, day: row!.day, source: row!.source };
}

/** Everything the owner sees on /me/vehicles: each car with the reminders of each shop that tracks it (tire shops are added by auto-tires). */
export async function listMyVehicles(ctx: AppContext, user: AuthUser): Promise<Pick<autoApi.MyVehiclesResponse, "vehicles">> {
  const rows = await ctx.db.select().from(vehicles).where(eq(vehicles.userId, user.id)).orderBy(asc(vehicles.createdAt));
  if (!rows.length) return { vehicles: [] };
  const ids = rows.map((r) => r.id);
  const allReadings = await readingsFor(ctx, ids, null);
  const logs = await ctx.db.select().from(vehicleServices).where(inArray(vehicleServices.vehicleId, ids));
  const shopIds = [...new Set(logs.map((l) => l.merchantId))];
  const shops = shopIds.length ? await ctx.db.select().from(merchantsTable).where(inArray(merchantsTable.id, shopIds)) : [];
  const out: autoApi.MyVehicleDto[] = [];
  for (const v of rows) {
    const mine = allReadings.filter((r) => r.vehicleId === v.id);
    const latest = latestOf(mine);
    const shopsOut: autoApi.MyVehicleShopDto[] = [];
    for (const m of shops) {
      const vl = logs.filter((l) => l.vehicleId === v.id && l.merchantId === m.id);
      if (!vl.length || !(await isFeatureOn(ctx.db, m, "auto.vehicles"))) continue;
      const st = await getSettingsRow(ctx, m.id);
      const [vs] = await ctx.db.select().from(vehicleShop).where(and(eq(vehicleShop.vehicleId, v.id), eq(vehicleShop.merchantId, m.id))).limit(1);
      const calc = calcCar({ vehicle: v, settings: st, override: vs?.kmPerDayOverride ?? null, readings: mine.filter((r) => !r.merchantId || r.merchantId === m.id), logs: vl, today: todayFor(ctx, m.timezone) });
      shopsOut.push({ merchantId: m.id, shopName: m.name, slug: m.slug, reminders: calc.reminders });
    }
    out.push({ id: v.id, year: v.year, make: v.make, model: v.model, use: v.use === "rideshare" ? "rideshare" : "personal", plate: v.plate, label: vehicleLabel(v), odometerKm: latest?.km ?? null, odometerOn: latest?.day ?? null, shops: shopsOut });
  }
  return { vehicles: out };
}

// ---------------------------------------------------------------------------
// The shop's side
// ---------------------------------------------------------------------------
async function shopVehicle(ctx: AppContext, merchant: Merchant, id: string) {
  const [r] = await ctx.db
    .select({ v: vehicles, ownerName: users.name, phone: users.phone, member: merchantMembers })
    .from(vehicles)
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, vehicles.userId), eq(merchantMembers.merchantId, merchant.id)))
    .innerJoin(users, eq(users.id, vehicles.userId))
    .where(eq(vehicles.id, id))
    .limit(1);
  if (!r) throw notFound("Vehicle");
  return r;
}
export { shopVehicle };

export async function listVehicles(ctx: AppContext, merchant: Merchant, q: z.output<typeof autoApi.vehicleListQuery>): Promise<autoApi.VehicleListResponse> {
  const term = q.q?.toLowerCase();
  const normTerm = normalizePlate(q.q);
  const rows = await ctx.db
    .select({ v: vehicles, ownerName: users.name })
    .from(vehicles)
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, vehicles.userId), eq(merchantMembers.merchantId, merchant.id)))
    .innerJoin(users, eq(users.id, vehicles.userId))
    .orderBy(asc(vehicles.make), asc(vehicles.model))
    .limit(500);
  const filtered = rows
    .filter((r) => !term || vehicleLabel(r.v).toLowerCase().includes(term) || (r.ownerName ?? "").toLowerCase().includes(term) || (normTerm && r.v.plateNorm === normTerm))
    .slice(0, q.limit);
  const ids = filtered.map((r) => r.v.id);
  const st = await getSettingsRow(ctx, merchant.id);
  const readings = await readingsFor(ctx, ids, merchant.id);
  const logs = ids.length ? await ctx.db.select().from(vehicleServices).where(and(eq(vehicleServices.merchantId, merchant.id), inArray(vehicleServices.vehicleId, ids))) : [];
  const shopRows = ids.length ? await ctx.db.select().from(vehicleShop).where(and(eq(vehicleShop.merchantId, merchant.id), inArray(vehicleShop.vehicleId, ids))) : [];
  const today = todayFor(ctx, merchant.timezone);
  return {
    items: filtered.map((r) => {
      const calc = calcCar({ vehicle: r.v, settings: st, override: shopRows.find((s) => s.vehicleId === r.v.id)?.kmPerDayOverride ?? null, readings: readings.filter((x) => x.vehicleId === r.v.id), logs: logs.filter((l) => l.vehicleId === r.v.id), today });
      const due = calc.reminders.filter((x) => x.dueOn).sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : 1))[0];
      return { ...baseDto(r.v, r.ownerName), odometerKm: calc.latest?.km ?? null, odometerOn: calc.latest?.day ?? null, worst: worstOf(calc.reminders), nextDue: due ? { label: due.label, dueOn: due.dueOn!, status: due.status } : null };
    }),
  };
}

export async function getVehicle(ctx: AppContext, merchant: Merchant, id: string): Promise<autoApi.VehicleDetailDto> {
  const { v, ownerName, member, phone } = await shopVehicle(ctx, merchant, id);
  const st = await getSettingsRow(ctx, merchant.id);
  const readings = await readingsFor(ctx, [v.id], merchant.id);
  const logs = await ctx.db.select().from(vehicleServices).where(and(eq(vehicleServices.merchantId, merchant.id), eq(vehicleServices.vehicleId, v.id)));
  const [vs] = await ctx.db.select().from(vehicleShop).where(and(eq(vehicleShop.vehicleId, v.id), eq(vehicleShop.merchantId, merchant.id))).limit(1);
  const today = todayFor(ctx, merchant.timezone);
  const calc = calcCar({ vehicle: v, settings: st, override: vs?.kmPerDayOverride ?? null, readings, logs, today });
  const stopped = await optedOutSet(ctx.db, [phone], "sms");
  return {
    ...baseDto(v, ownerName),
    kmPerDay: calc.perDay,
    kmPerDayBasis: calc.basis,
    odometerKm: calc.latest?.km ?? null,
    odometerOn: calc.latest?.day ?? null,
    note: vs?.note ?? null,
    ownerPhone: phone,
    canText: !!member.marketingConsentAt && !member.muted && !!phone && !isSuppressed(stopped, phone),
    reminders: calc.reminders,
    readings: readings.slice(-8).reverse().map((r) => ({ id: r.id, km: r.km, day: r.day, source: r.source })),
    visits: await vehicleVisits(ctx, merchant, v.id),
    tireSets: await vehicleTireSets(ctx, merchant, v.id),
  };
}

/** Tickets that name this car (itemDetails.vehicleId), with the estimate and the invoice side by side. */
async function vehicleVisits(ctx: AppContext, merchant: Merchant, vehicleId: string): Promise<autoApi.VehicleVisitDto[]> {
  const ts = await ctx.db
    .select()
    .from(serviceTickets)
    .where(and(eq(serviceTickets.merchantId, merchant.id), sql`${serviceTickets.itemDetails}->>'vehicleId' = ${vehicleId}`))
    .orderBy(desc(serviceTickets.createdAt))
    .limit(10);
  if (!ts.length) return [];
  const ids = ts.map((t) => t.id);
  const qs = await ctx.db.select().from(quotes).where(and(inArray(quotes.ticketId, ids), eq(quotes.status, "approved"))).orderBy(desc(quotes.respondedAt));
  const ivs = await ctx.db.select().from(invoices).where(and(inArray(invoices.ticketId, ids), inArray(invoices.status, ["open", "paid"]))).orderBy(desc(invoices.createdAt));
  return ts.map((t) => {
    const q = qs.find((x) => x.ticketId === t.id);
    const i = ivs.find((x) => x.ticketId === t.id);
    return { ticketId: t.id, number: t.number, at: t.createdAt.toISOString(), issue: t.issue, status: t.status, mileageIn: t.itemDetails.mileage ?? null, estimateCents: q?.totalCents ?? null, invoiceCents: i?.totalCents ?? null, percentOver: q && i ? percentOver(q.totalCents, i.totalCents) : null };
  });
}

async function vehicleTireSets(ctx: AppContext, merchant: Merchant, vehicleId: string): Promise<autoApi.TireSetDto[]> {
  const { tireSetDtos } = await import("./auto-tires.js");
  const rows = await ctx.db.select().from(tireSets).where(and(eq(tireSets.merchantId, merchant.id), eq(tireSets.vehicleId, vehicleId), eq(tireSets.status, "stored")));
  return tireSetDtos(ctx, merchant, rows);
}

export async function createVehicleForMember(ctx: AppContext, staff: StaffContext, body: z.output<typeof autoApi.staffVehicleBody>): Promise<autoApi.VehicleDetailDto> {
  const merchant = staff.merchant;
  const [m] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.id, body.memberId), eq(merchantMembers.merchantId, merchant.id))).limit(1);
  if (!m) throw notFound("Customer");
  const v = await createVehicleFor(ctx, m.userId, body);
  if (body.odometerKm != null) await insertReading(ctx, v.id, merchant.id, body.odometerKm, todayFor(ctx, merchant.timezone), "staff");
  return getVehicle(ctx, merchant, v.id);
}

export async function updateVehicle(ctx: AppContext, staff: StaffContext, id: string, body: z.output<typeof autoApi.updateVehicleBody>): Promise<autoApi.VehicleDetailDto> {
  const merchant = staff.merchant;
  await shopVehicle(ctx, merchant, id);
  const { kmPerDayOverride, note, ...rest } = body;
  await ctx.db.update(vehicles).set(vehiclePatch(ctx, rest)).where(eq(vehicles.id, id));
  if (kmPerDayOverride !== undefined || note !== undefined) {
    const patch: Partial<typeof vehicleShop.$inferInsert> = {};
    if (kmPerDayOverride !== undefined) patch.kmPerDayOverride = kmPerDayOverride ?? null;
    if (note !== undefined) patch.note = note?.trim() || null;
    await ctx.db
      .insert(vehicleShop)
      .values({ vehicleId: id, merchantId: merchant.id, ...patch })
      .onConflictDoUpdate({ target: [vehicleShop.vehicleId, vehicleShop.merchantId], set: patch });
  }
  return getVehicle(ctx, merchant, id);
}

export async function addReading(ctx: AppContext, staff: StaffContext, id: string, body: z.output<typeof autoApi.readingBody>): Promise<autoApi.VehicleDetailDto> {
  const merchant = staff.merchant;
  await shopVehicle(ctx, merchant, id);
  const day = body.day ?? todayFor(ctx, merchant.timezone);
  if (day > todayFor(ctx, merchant.timezone)) throw badRequest("A reading cannot be from a future day.");
  await insertReading(ctx, id, merchant.id, body.km, day, "staff");
  return getVehicle(ctx, merchant, id);
}

/** A reading from a ticket's odometer: recorded once per ticket and day, so a re-sent form does not stack readings. */
export async function readingFromTicket(ctx: AppContext, merchant: Merchant, vehicleId: string, kmText: string | null | undefined): Promise<void> {
  const km = Number((kmText ?? "").replace(/[^\d]/g, ""));
  if (!km || km > 1_500_000) return;
  const day = todayFor(ctx, merchant.timezone);
  const [dup] = await ctx.db.select({ id: vehicleReadings.id }).from(vehicleReadings).where(and(eq(vehicleReadings.vehicleId, vehicleId), eq(vehicleReadings.day, day), eq(vehicleReadings.km, km))).limit(1);
  if (!dup) await insertReading(ctx, vehicleId, merchant.id, km, day, "ticket");
}

/** Marks a service as done today (or on `doneOn`): the reminder counts from it. */
export async function logService(ctx: AppContext, staff: StaffContext, id: string, body: z.output<typeof autoApi.serviceDoneBody>): Promise<autoApi.VehicleDetailDto> {
  const merchant = staff.merchant;
  await shopVehicle(ctx, merchant, id);
  const st = await getSettingsRow(ctx, merchant.id);
  if (!servicesOf(st).some((s) => s.key === body.serviceKey)) throw badRequest("That service is not on this shop's list.");
  const today = todayFor(ctx, merchant.timezone);
  const doneOn = body.doneOn ?? today;
  if (doneOn > today) throw badRequest("A service cannot be done in the future.");
  const readings = await readingsFor(ctx, [id], merchant.id);
  // Without a km given, use the newest reading on or before that day.
  const km = body.km ?? latestOf(readings.filter((r) => r.day <= doneOn))?.km ?? null;
  await ctx.db.insert(vehicleServices).values({ vehicleId: id, merchantId: merchant.id, serviceKey: body.serviceKey, doneOn, km });
  if (body.km != null) {
    const [dup] = await ctx.db.select({ id: vehicleReadings.id }).from(vehicleReadings).where(and(eq(vehicleReadings.vehicleId, id), eq(vehicleReadings.day, doneOn), eq(vehicleReadings.km, body.km))).limit(1);
    if (!dup) await insertReading(ctx, id, merchant.id, body.km, doneOn, "staff");
  }
  return getVehicle(ctx, merchant, id);
}

// ---------------------------------------------------------------------------
// Reminder texts
// ---------------------------------------------------------------------------
interface Candidate {
  vehicle: VehicleRow;
  ownerName: string | null;
  phone: string | null;
  locale: Locale;
  userId: string;
  reminder: autoApi.ReminderDto & { status: "overdue" | "due_soon"; dueOn: string; basis: "km" | "months"; daysToDue: number };
  canSend: boolean;
  cannotWhy: string | null;
  lastTextOn: string | null;
}

async function candidates(ctx: AppContext, merchant: Merchant): Promise<{ list: Candidate[]; texted7d: number; noReading: number }> {
  const today = todayFor(ctx, merchant.timezone);
  const rows = await ctx.db
    .select({ v: vehicles, name: users.name, phone: users.phone, locale: users.locale, deletedAt: users.deletedAt, member: merchantMembers })
    .from(vehicles)
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, vehicles.userId), eq(merchantMembers.merchantId, merchant.id)))
    .innerJoin(users, eq(users.id, vehicles.userId));
  if (!rows.length) return { list: [], texted7d: 0, noReading: 0 };
  const ids = rows.map((r) => r.v.id);
  const st = await getSettingsRow(ctx, merchant.id);
  const readings = await readingsFor(ctx, ids, merchant.id);
  const logs = await ctx.db.select().from(vehicleServices).where(and(eq(vehicleServices.merchantId, merchant.id), inArray(vehicleServices.vehicleId, ids)));
  const shopRows = await ctx.db.select().from(vehicleShop).where(and(eq(vehicleShop.merchantId, merchant.id), inArray(vehicleShop.vehicleId, ids)));
  const nudges = await ctx.db.select().from(vehicleNudges).where(and(eq(vehicleNudges.merchantId, merchant.id), inArray(vehicleNudges.vehicleId, ids)));
  const stopped = await optedOutSet(ctx.db, rows.map((r) => r.phone), "sms");
  const sixMonthsAgo = new Date(ctx.now().getTime() - 183 * 86_400_000);
  const list: Candidate[] = [];
  let noReading = 0;
  for (const r of rows) {
    if (r.deletedAt) continue;
    const mine = readings.filter((x) => x.vehicleId === r.v.id);
    const latest = latestOf(mine);
    if (!latest || latest.day < localDate(sixMonthsAgo, merchant.timezone)) noReading++;
    const calc = calcCar({ vehicle: r.v, settings: st, override: shopRows.find((s) => s.vehicleId === r.v.id)?.kmPerDayOverride ?? null, readings: mine, logs: logs.filter((l) => l.vehicleId === r.v.id), today });
    for (const rem of calc.reminders) {
      if ((rem.status !== "overdue" && rem.status !== "due_soon") || !rem.dueOn || !rem.basis || rem.daysToDue == null) continue;
      // One text (or one skip) per car, service and due date.
      if (nudges.some((n) => n.vehicleId === r.v.id && n.serviceKey === rem.serviceKey && n.dueOn === rem.dueOn)) continue;
      const m = r.member;
      const why = !r.phone ? "No phone number" : !m.marketingConsentAt || m.muted ? "No text consent" : isSuppressed(stopped, r.phone) ? "Said STOP" : null;
      const lastNudge = nudges.filter((n) => n.vehicleId === r.v.id && n.action === "sent").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      list.push({ vehicle: r.v, ownerName: r.name, phone: r.phone, locale: normalizeLocale(r.locale) ?? "en", userId: r.v.userId, reminder: rem as Candidate["reminder"], canSend: !why, cannotWhy: why, lastTextOn: lastNudge ? localDate(lastNudge.createdAt, merchant.timezone) : null });
    }
  }
  list.sort((a, b) => a.reminder.dueOn.localeCompare(b.reminder.dueOn) || vehicleLabel(a.vehicle).localeCompare(vehicleLabel(b.vehicle)));
  const weekAgo = new Date(ctx.now().getTime() - 7 * 86_400_000);
  const texted7d = nudges.filter((n) => n.action === "sent" && n.createdAt >= weekAgo).length;
  return { list, texted7d, noReading };
}

export function serviceDueText(ctx: AppContext, merchant: Pick<Merchant, "name" | "slug">, c: { locale: Locale; vehicle: string; service: string; dueOn: string }) {
  const tr = translator(c.locale);
  const url = `${ctx.config.publicWebUrl.replace(/\/$/, "")}/shops/${merchant.slug}/book${c.locale === "en" ? "" : `?lang=${c.locale}`}`;
  const vars = { shop: merchant.name, vehicle: c.vehicle, service: c.service.toLowerCase(), date: formatDate(c.locale, `${c.dueOn}T12:00:00Z`, { month: "short", day: "numeric" }, "UTC"), url };
  return { title: tr("auto.msg.dueTitle", vars), body: tr("auto.msg.due", vars) };
}

/** The vehicle name in a text: year, make and model only. Never the plate. */
const textName = (v: Pick<VehicleRow, "year" | "make" | "model">) => vehicleLabel(v);

export async function remindersOverview(ctx: AppContext, merchant: Merchant): Promise<autoApi.RemindersResponse> {
  const { list, texted7d, noReading } = await candidates(ctx, merchant);
  const sample = list[0];
  return {
    items: list.map((c) => ({ vehicleId: c.vehicle.id, vehicleLabel: vehicleLabel(c.vehicle), ownerName: c.ownerName, serviceKey: c.reminder.serviceKey, label: c.reminder.label, status: c.reminder.status, dueOn: c.reminder.dueOn, basis: c.reminder.basis, daysToDue: c.reminder.daysToDue, lastTextOn: c.lastTextOn, canSend: c.canSend, cannotWhy: c.cannotWhy })),
    counts: { dueSoon: list.filter((c) => c.reminder.status === "due_soon").length, overdue: list.filter((c) => c.reminder.status === "overdue").length, texted7d, noReading },
    previewText: serviceDueText(ctx, merchant, { locale: "en", vehicle: sample ? textName(sample.vehicle) : "2019 Honda Civic", service: sample?.reminder.label ?? "Oil and filter", dueOn: sample?.reminder.dueOn ?? "2026-12-08" }).body,
  };
}

/** One text through the shop's SMS credits. Returns why it did not go. Never overnight; never to a number that said STOP. */
export async function sendShopText(ctx: AppContext, merchant: Merchant, to: { userId: string; phone: string | null }, body: string): Promise<"sent" | "quiet" | "no_credits" | "skipped"> {
  if (!to.phone) return "skipped";
  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: merchant.timezone, hour: "2-digit", hourCycle: "h23" }).format(ctx.now()));
  if (!textHourOk(hour)) return "quiet";
  if (!(await reserveSmsCredits(ctx.db, merchant, 1))) return "no_credits";
  let status = "sent";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    const r = await sendSms(ctx, to.phone, body);
    if (!r) {
      status = "skipped";
      error = "opted_out";
    } else providerId = r.id;
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message.slice(0, 500) : "send failed";
  }
  await ctx.db.insert(messageDeliveries).values({ userId: to.userId, merchantId: merchant.id, channel: "sms", to: to.phone, body, kind: "marketing", status, providerId, error });
  return status === "sent" ? "sent" : "skipped";
}

async function sendOne(ctx: AppContext, merchant: Merchant, c: Candidate): Promise<"sent" | "quiet" | "no_credits" | "skipped"> {
  if (!c.canSend) return "skipped";
  const { body } = serviceDueText(ctx, merchant, { locale: c.locale, vehicle: textName(c.vehicle), service: c.reminder.label, dueOn: c.reminder.dueOn });
  const r = await sendShopText(ctx, merchant, { userId: c.userId, phone: c.phone }, body);
  if (r === "sent") await ctx.db.insert(vehicleNudges).values({ merchantId: merchant.id, vehicleId: c.vehicle.id, serviceKey: c.reminder.serviceKey, dueOn: c.reminder.dueOn, action: "sent" }).onConflictDoNothing();
  return r;
}

/** Texts the listed reminders (all due when none are listed), or skips them. Stops when the month's texts run out; never overnight. */
export async function sendReminders(ctx: AppContext, merchant: Merchant, body: z.output<typeof autoApi.remindersSendBody>): Promise<autoApi.RemindersSendResponse> {
  const { list } = await candidates(ctx, merchant);
  const pool = list.filter((c) => !body.items || body.items.some((i) => i.vehicleId === c.vehicle.id && i.serviceKey === c.reminder.serviceKey));
  let sent = 0;
  let skipped = 0;
  if (body.skip) {
    for (const c of pool) {
      await ctx.db.insert(vehicleNudges).values({ merchantId: merchant.id, vehicleId: c.vehicle.id, serviceKey: c.reminder.serviceKey, dueOn: c.reminder.dueOn, action: "skipped" }).onConflictDoNothing();
      skipped++;
    }
    return { sent, skipped };
  }
  for (const c of pool) {
    const r = await sendOne(ctx, merchant, c);
    if (r === "sent") sent++;
    else skipped++;
    if (r === "no_credits" || r === "quiet") break;
  }
  if (body.items && !sent && !skipped) throw conflict("Nobody in that list is due for a text right now.");
  return { sent, skipped };
}

/** Job, hourly: at 10:00 shop time, text due cars for shops that switched automatic reminders on. */
export async function runServiceReminders(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const shops = await ctx.db
    .select({ m: merchantsTable })
    .from(autoSettings)
    .innerJoin(merchantsTable, eq(merchantsTable.id, autoSettings.merchantId))
    .where(and(eq(autoSettings.autoReminders, true), inArray(merchantsTable.status, ["onboarding", "active"])));
  let sent = 0;
  for (const { m } of shops) {
    const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: m.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
    if (hour !== 10) continue;
    if (!(await isFeatureOn(ctx.db, m, "auto.vehicles"))) continue;
    sent += (await sendReminders(ctx, m, { skip: false })).sent;
  }
  return sent;
}

/** Vehicles whose owner just left a shop or deleted their account go with the user (cascade); this is the export view of one owner. */
export async function exportVehicles(ctx: AppContext, userId: string) {
  const rows = await ctx.db.select().from(vehicles).where(eq(vehicles.userId, userId));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const readings = await ctx.db.select().from(vehicleReadings).where(inArray(vehicleReadings.vehicleId, ids));
  const logs = await ctx.db.select().from(vehicleServices).where(inArray(vehicleServices.vehicleId, ids));
  const sets = await ctx.db.select().from(tireSets).where(eq(tireSets.userId, userId));
  return rows.map((v) => ({
    id: v.id,
    year: v.year,
    make: v.make,
    model: v.model,
    use: v.use,
    plate: v.plate,
    readings: readings.filter((r) => r.vehicleId === v.id).map((r) => ({ km: r.km, day: r.day, source: r.source })),
    services: logs.filter((l) => l.vehicleId === v.id).map((l) => ({ service: l.serviceKey, doneOn: l.doneOn, km: l.km })),
    tireSets: sets.filter((s) => s.vehicleId === v.id).map((s) => ({ rack: s.rack, season: s.season, label: s.label, storedOn: s.storedOn, status: s.status })),
  }));
}
