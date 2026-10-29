/**
 * Add-ons at booking (phase-pro P5, docs/business/pro-value.md §3.2 P5, feature `booking.add_ons` on Pro).
 *
 * An add-on is a `services` row with kind "add_on": a name, a price, extra minutes and active. `service_add_ons` lists the
 * services that offer it; no rows means every service. On Free the owner can set them up (the services page shows the plan
 * line) but the booking page does not offer them and a booking that names one is refused (402).
 *
 * On an appointment an add-on is a line with `kind: "add_on"`, `addOnId` and `serviceId: null` (rebooking, "book again" and
 * reschedule read service lines only). Its minutes lengthen the slot; the deposit stays the base service's.
 */
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { appointments, serviceAddOns, services, type AppointmentAddOnItemRow, type DbOrTx } from "@ll/db";
import { appointmentsApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { isFeatureOn, requireFeature } from "./features.js";
import { recordSignal } from "./signals.js";
import type { Merchant } from "./appointments.js";

type ServiceRow = typeof services.$inferSelect;
const KIND = "add_on";

function dto(s: ServiceRow, offeredWith: string[]): appointmentsApi.AddOnDto {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    priceCents: s.priceCents,
    durationMin: s.durationMin,
    taxable: s.taxable,
    active: s.active,
    sort: s.sort,
    translations: s.translations ?? {},
    offeredWith,
  };
}

async function links(db: DbOrTx, merchantId: string, addOnIds?: string[]) {
  if (addOnIds && !addOnIds.length) return [];
  return db
    .select({ serviceId: serviceAddOns.serviceId, addOnId: serviceAddOns.addOnId })
    .from(serviceAddOns)
    .where(and(eq(serviceAddOns.merchantId, merchantId), addOnIds ? inArray(serviceAddOns.addOnId, addOnIds) : undefined))
    .orderBy(asc(serviceAddOns.sort), asc(serviceAddOns.createdAt));
}

/** Every add-on of a shop with the services that offer it, in the owner's order. */
export async function listAddOns(ctx: AppContext, merchant: Merchant): Promise<appointmentsApi.AddOnsResponse> {
  const [rows, l, offered] = await Promise.all([
    ctx.db.select().from(services).where(and(eq(services.merchantId, merchant.id), eq(services.kind, KIND))).orderBy(asc(services.sort), asc(services.name), asc(services.id)),
    links(ctx.db, merchant.id),
    isFeatureOn(ctx.db, merchant, "booking.add_ons"),
  ]);
  return { items: rows.map((r) => dto(r, l.filter((x) => x.addOnId === r.id).map((x) => x.serviceId))), offered };
}

async function getAddOn(db: DbOrTx, merchantId: string, id: string): Promise<ServiceRow> {
  const [s] = await db.select().from(services).where(and(eq(services.id, id), eq(services.merchantId, merchantId), eq(services.kind, KIND))).limit(1);
  if (!s) throw notFound("Add-on");
  return s;
}

/** Replace which services offer an add-on. Every id must be one of the shop's appointment services. */
async function setOfferedWith(db: DbOrTx, merchantId: string, addOnId: string, serviceIds: string[]): Promise<string[]> {
  const ids = [...new Set(serviceIds)];
  if (ids.length) {
    const found = await db.select({ id: services.id }).from(services).where(and(eq(services.merchantId, merchantId), eq(services.kind, "appointment"), inArray(services.id, ids)));
    if (found.length !== ids.length) throw badRequest("Pick services from your own list");
  }
  await db.delete(serviceAddOns).where(and(eq(serviceAddOns.merchantId, merchantId), eq(serviceAddOns.addOnId, addOnId)));
  if (ids.length) await db.insert(serviceAddOns).values(ids.map((serviceId, sort) => ({ merchantId, serviceId, addOnId, sort })));
  return ids;
}

export async function createAddOn(ctx: AppContext, merchant: Merchant, body: z.output<typeof appointmentsApi.createAddOnBody>): Promise<appointmentsApi.AddOnDto> {
  const { offeredWith, ...f } = body;
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(services)
      .values({ merchantId: merchant.id, kind: KIND, name: f.name, description: f.description ?? null, priceCents: f.priceCents, durationMin: f.durationMin, taxable: f.taxable, active: f.active, sort: f.sort, translations: f.translations ?? {} })
      .returning();
    return dto(row!, await setOfferedWith(tx, merchant.id, row!.id, offeredWith));
  });
}

export async function updateAddOn(ctx: AppContext, merchant: Merchant, id: string, body: z.output<typeof appointmentsApi.updateAddOnBody>): Promise<appointmentsApi.AddOnDto> {
  const cur = await getAddOn(ctx.db, merchant.id, id);
  const { offeredWith, ...f } = body;
  return ctx.db.transaction(async (tx) => {
    const fields = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
    const [row] = Object.keys(fields).length ? await tx.update(services).set({ ...fields, updatedAt: ctx.now() }).where(eq(services.id, cur.id)).returning() : [cur];
    const ids = offeredWith ? await setOfferedWith(tx, merchant.id, cur.id, offeredWith) : (await links(tx, merchant.id, [cur.id])).map((x) => x.serviceId);
    return dto(row!, ids);
  });
}

export async function deleteAddOn(ctx: AppContext, merchant: Merchant, id: string): Promise<void> {
  const cur = await getAddOn(ctx.db, merchant.id, id);
  await ctx.db.delete(services).where(eq(services.id, cur.id));
}

// ---------------------------------------------------------------------------
// Booking side
// ---------------------------------------------------------------------------
/** The add-ons each service offers on the public booking page, or null when the shop's plan doesn't offer them. */
export async function publicAddOnsByService(ctx: AppContext, merchant: Merchant, serviceIds: string[]): Promise<Map<string, appointmentsApi.PublicAddOnDto[]> | null> {
  if (!(await isFeatureOn(ctx.db, merchant, "booking.add_ons"))) return null;
  const rows = await ctx.db.select().from(services).where(and(eq(services.merchantId, merchant.id), eq(services.kind, KIND), eq(services.active, true))).orderBy(asc(services.sort), asc(services.name), asc(services.id));
  const out = new Map<string, appointmentsApi.PublicAddOnDto[]>();
  if (!rows.length) return out;
  const l = await links(ctx.db, merchant.id, rows.map((r) => r.id));
  const all = rows.map((r) => ({ ...r, offeredWith: l.filter((x) => x.addOnId === r.id).map((x) => x.serviceId) }));
  for (const sid of serviceIds) {
    out.set(
      sid,
      appointmentsApi.addOnsForServices(all, [sid]).map((a) => ({ id: a.id, name: a.name, description: a.description, priceCents: a.priceCents, durationMin: a.durationMin, translations: a.translations ?? {} })),
    );
  }
  return out;
}

export interface ResolvedAddOns {
  items: AppointmentAddOnItemRow[];
  /** Extra minutes the add-ons block. */
  extraMin: number;
  totalCents: number;
}

export const NO_ADD_ONS: ResolvedAddOns = { items: [], extraMin: 0, totalCents: 0 };

/**
 * The add-ons a client picked for these services, as appointment lines. Each must be one of the shop's active add-ons, offered
 * with at least one of the services. Throws 402 when the plan doesn't offer add-ons, 400 for one that isn't offered.
 */
export async function resolveAddOns(ctx: AppContext, merchant: Merchant, serviceIds: string[], addOnIds: readonly string[] | undefined): Promise<ResolvedAddOns> {
  const ids = [...new Set(addOnIds ?? [])];
  if (!ids.length) return NO_ADD_ONS;
  await requireFeature(ctx.db, merchant, "booking.add_ons");
  const rows = await ctx.db.select().from(services).where(and(eq(services.merchantId, merchant.id), eq(services.kind, KIND), inArray(services.id, ids)));
  const l = await links(ctx.db, merchant.id, ids);
  const withLinks = rows.map((r) => ({ ...r, offeredWith: l.filter((x) => x.addOnId === r.id).map((x) => x.serviceId) }));
  const offered = appointmentsApi.addOnsForServices(withLinks, serviceIds);
  if (offered.length !== ids.length) throw badRequest("One of those add-ons isn't offered with this service");
  // The client's order of picking is kept on the ticket.
  const picked = ids.map((id) => offered.find((o) => o.id === id)!);
  const items: AppointmentAddOnItemRow[] = picked.map((a) => ({ serviceId: null, addOnId: a.id, kind: "add_on", name: a.name, durationMin: a.durationMin, priceCents: a.priceCents }));
  const t = appointmentsApi.addOnTotals(items);
  return { items, extraMin: t.durationMin, totalCents: t.priceCents };
}

/** The add-on lines already on an appointment (reschedule keeps them and their minutes). */
export function addOnLinesOf(items: readonly AppointmentAddOnItemRow[]): ResolvedAddOns {
  const lines = items.filter((i) => i.kind === "add_on");
  const t = appointmentsApi.addOnTotals(lines);
  return { items: lines, extraMin: t.durationMin, totalCents: t.priceCents };
}

/** Checkout: count the add-ons sold on this visit for the weekly report (first checkout of a visit only). */
export async function recordAddOnsSold(ctx: AppContext, merchantId: string, items: readonly AppointmentAddOnItemRow[]): Promise<void> {
  const lines = items.filter((i) => i.kind === "add_on");
  if (!lines.length) return;
  await recordSignal(ctx, merchantId, "addons_sold", { count: lines.length, amountCents: lines.reduce((n, i) => n + i.priceCents, 0) });
}

/** Tax flag per add-on for checkout lines (an add-on line has no serviceId). */
export async function addOnTaxable(db: DbOrTx, merchantId: string, items: readonly AppointmentAddOnItemRow[]): Promise<Map<string, boolean>> {
  const ids = [...new Set(items.map((i) => i.addOnId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const rows = await db.select({ id: services.id, taxable: services.taxable }).from(services).where(and(eq(services.merchantId, merchantId), inArray(services.id, ids)));
  return new Map(rows.map((r) => [r.id, r.taxable] as const));
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
/** Average ticket and add-on attach rate over appointments completed in [from, to). */
export async function addOnTicketReport(db: DbOrTx, merchantId: string, from: Date, to: Date): Promise<appointmentsApi.AddOnTicketReport> {
  const lines = sql`jsonb_array_elements(${appointments.items})`;
  const [r] = await db
    .select({
      n: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum((select coalesce(sum((e->>'priceCents')::int), 0) from ${lines} e)), 0)::bigint`,
      withAddOn: sql<number>`count(*) filter (where exists (select 1 from ${lines} e where e->>'kind' = 'add_on'))::int`,
      addOns: sql<number>`coalesce(sum((select count(*) from ${lines} e where e->>'kind' = 'add_on')), 0)::int`,
      addOnCents: sql<number>`coalesce(sum((select coalesce(sum((e->>'priceCents')::int), 0) from ${lines} e where e->>'kind' = 'add_on')), 0)::bigint`,
    })
    .from(appointments)
    .where(and(eq(appointments.merchantId, merchantId), eq(appointments.status, "completed"), gte(appointments.startsAt, from), lt(appointments.startsAt, to)));
  const n = Number(r?.n ?? 0);
  return {
    avgTicketCents: n ? Math.round(Number(r?.total ?? 0) / n) : 0,
    addOnAttachRate: n ? Math.round((Number(r?.withAddOn ?? 0) / n) * 1000) / 1000 : 0,
    addOnsSold: Number(r?.addOns ?? 0),
    addOnsAmountCents: Number(r?.addOnCents ?? 0),
  };
}

/** Add the add-on lines to a booking's services: their minutes and price count; the deposit stays the services'. */
export function withAddOns<T extends { items: AppointmentAddOnItemRow[]; blockMin: number; totalCents: number; depositCents: number }>(r: T, extras: ResolvedAddOns): T {
  if (!extras.items.length) return r;
  return { ...r, items: [...r.items, ...extras.items], blockMin: r.blockMin + extras.extraMin, totalCents: r.totalCents + extras.totalCents };
}
