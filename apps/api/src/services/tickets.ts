/**
 * Service tickets (Pro): intake at drop-off, item details, photos, status
 * timeline. Quotes live in quotes.ts and invoices in invoices.ts.
 */
import { and, asc, desc, eq, ilike, inArray, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { invoices, locations, merchantStaff, merchants, quotes, serviceTickets, ticketEvents, users, type DbOrTx } from "@ll/db";
import { normalizePhone, type serviceApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { decodeCursor, encodeCursor, iso, itemLabel, notifyCustomer } from "./commerceShared.js";
import { nextNumber } from "./counters.js";
import { invoiceDto } from "./invoices.js";
import { findOrCreateCustomerByPhone } from "./ledger.js";
import { quoteDto } from "./quotes.js";

export type Ticket = typeof serviceTickets.$inferSelect;
type Merchant = typeof merchants.$inferSelect;
export type TicketStatus = serviceApi.TicketStatus;

export const TERMINAL_TICKET_STATUSES: TicketStatus[] = ["picked_up", "cancelled"];

export function ticketDto(t: Ticket, merchantName: string, opts: { forCustomer?: boolean; customer?: { name: string | null; phone: string | null } } = {}): serviceApi.TicketDto {
  return {
    id: t.id,
    merchantId: t.merchantId,
    merchantName,
    locationId: t.locationId,
    userId: t.userId,
    number: t.number,
    itemKind: t.itemKind as serviceApi.ItemKind,
    itemDetails: t.itemDetails,
    issue: t.issue,
    intakeNotes: opts.forCustomer ? null : t.intakeNotes,
    photos: t.photos,
    status: t.status,
    assignedStaffId: t.assignedStaffId,
    promisedAt: iso(t.promisedAt),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    ...(opts.customer ? { customer: opts.customer } : {}),
  };
}

export async function addTicketEvent(
  db: DbOrTx,
  ticketId: string,
  ev: { status?: TicketStatus | null; note?: string | null; visibleToCustomer?: boolean; actorUserId?: string | null },
) {
  const [row] = await db
    .insert(ticketEvents)
    .values({ ticketId, status: ev.status ?? null, note: ev.note ?? null, visibleToCustomer: ev.visibleToCustomer ?? true, actorUserId: ev.actorUserId ?? null })
    .returning();
  return row!;
}

/** Set ticket status + timeline event in one go. */
export async function setTicketStatusRaw(db: DbOrTx, now: Date, ticket: Ticket, status: TicketStatus, ev: { note?: string | null; visibleToCustomer?: boolean; actorUserId?: string | null } = {}) {
  const [row] = await db.update(serviceTickets).set({ status, updatedAt: now }).where(eq(serviceTickets.id, ticket.id)).returning();
  await addTicketEvent(db, ticket.id, { status, ...ev });
  return row!;
}

async function assertStaffMember(db: DbOrTx, merchantId: string, userId: string | null | undefined) {
  if (!userId) return;
  const [s] = await db.select({ userId: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.userId, userId))).limit(1);
  if (!s) throw badRequest("Assigned staff member doesn't work here");
}

async function assertLocation(db: DbOrTx, merchantId: string, locationId: string | null | undefined) {
  if (!locationId) return;
  const [l] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.id, locationId), eq(locations.merchantId, merchantId))).limit(1);
  if (!l) throw badRequest("Unknown location");
}

export async function createTicket(ctx: AppContext, staff: StaffContext, body: z.infer<typeof serviceApi.createTicketBody>) {
  const merchant = staff.merchant;
  const phone = normalizePhone(body.customer.phone);
  if (!phone) throw badRequest("Enter a valid phone number");
  await assertLocation(ctx.db, merchant.id, body.locationId);
  await assertStaffMember(ctx.db, merchant.id, body.assignedStaffId);
  const ticket = await ctx.db.transaction(async (tx) => {
    const { user } = await findOrCreateCustomerByPhone(tx, phone, body.customer.name ?? null);
    const number = await nextNumber(tx, merchant.id, "ticket");
    const [t] = await tx
      .insert(serviceTickets)
      .values({
        merchantId: merchant.id,
        locationId: body.locationId ?? null,
        userId: user.id,
        number,
        itemKind: body.itemKind,
        itemDetails: body.itemDetails,
        issue: body.issue,
        intakeNotes: body.intakeNotes ?? null,
        photos: body.photos,
        status: "intake",
        assignedStaffId: body.assignedStaffId ?? null,
        promisedAt: body.promisedAt ? new Date(body.promisedAt) : null,
      })
      .returning();
    await addTicketEvent(tx, t!.id, { status: "intake", note: "Checked in", visibleToCustomer: true, actorUserId: staff.user.id });
    return t!;
  });
  return getTicketDetail(ctx, merchant, ticket, false);
}

export async function getMerchantTicket(db: DbOrTx, merchantId: string, ticketId: string): Promise<Ticket> {
  const [t] = await db.select().from(serviceTickets).where(and(eq(serviceTickets.id, ticketId), eq(serviceTickets.merchantId, merchantId))).limit(1);
  if (!t) throw notFound("Ticket");
  return t;
}

export async function getMyTicket(db: DbOrTx, userId: string, ticketId: string): Promise<{ ticket: Ticket; merchant: Merchant }> {
  const [row] = await db.select({ t: serviceTickets, m: merchants }).from(serviceTickets).innerJoin(merchants, eq(merchants.id, serviceTickets.merchantId)).where(and(eq(serviceTickets.id, ticketId), eq(serviceTickets.userId, userId))).limit(1);
  if (!row) throw notFound("Ticket");
  return { ticket: row.t, merchant: row.m };
}

export async function getTicketDetail(ctx: AppContext, merchant: Merchant, ticket: Ticket, forCustomer: boolean): Promise<serviceApi.TicketDetailResponse> {
  const evConds = [eq(ticketEvents.ticketId, ticket.id)];
  if (forCustomer) evConds.push(eq(ticketEvents.visibleToCustomer, true));
  const qConds = [eq(quotes.ticketId, ticket.id), eq(quotes.merchantId, merchant.id)];
  if (forCustomer) qConds.push(sql`${quotes.status} <> 'draft'`);
  const iConds = [eq(invoices.ticketId, ticket.id), eq(invoices.merchantId, merchant.id)];
  if (forCustomer) iConds.push(sql`${invoices.status} <> 'draft'`);
  const [events, qs, invs, customer] = await Promise.all([
    ctx.db.select().from(ticketEvents).where(and(...evConds)).orderBy(asc(ticketEvents.createdAt)),
    ctx.db.select().from(quotes).where(and(...qConds)).orderBy(desc(quotes.createdAt)),
    ctx.db.select().from(invoices).where(and(...iConds)).orderBy(desc(invoices.createdAt)),
    forCustomer ? Promise.resolve(undefined) : ctx.db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, ticket.userId)).limit(1).then((r) => r[0]),
  ]);
  return {
    ticket: ticketDto(ticket, merchant.name, { forCustomer, customer }),
    events: events.map((e) => ({ id: e.id, status: e.status, note: e.note, visibleToCustomer: e.visibleToCustomer, actorUserId: forCustomer ? null : e.actorUserId, createdAt: e.createdAt.toISOString() })),
    quotes: qs.map((q) => quoteDto(q, ctx.config.publicWebUrl, !forCustomer)),
    invoices: invs.map((i) => invoiceDto(i, ctx.config.publicWebUrl)),
  };
}

export async function listTickets(db: DbOrTx, merchant: Merchant, q: z.infer<typeof serviceApi.listTicketsQuery>) {
  const conds: SQL[] = [eq(serviceTickets.merchantId, merchant.id)];
  if (q.status) {
    const statuses = q.status.split(",").map((s) => s.trim()) as TicketStatus[];
    conds.push(inArray(serviceTickets.status, statuses));
  } else {
    conds.push(notInArray(serviceTickets.status, TERMINAL_TICKET_STATUSES));
  }
  if (q.q?.trim()) {
    const term = `%${q.q.trim().replace(/[%_]/g, "")}%`;
    const digits = q.q.replace(/\D/g, "");
    const ors: SQL[] = [ilike(users.name, term), ilike(serviceTickets.issue, term), sql`${serviceTickets.itemDetails}::text ilike ${term}`];
    if (digits.length >= 3) ors.push(ilike(users.phone, `%${digits}%`));
    if (/^#?\d+$/.test(q.q.trim())) ors.push(eq(serviceTickets.number, Number(q.q.trim().replace("#", ""))));
    conds.push(or(...ors)!);
  }
  const cur = decodeCursor(q.cursor);
  if (cur) conds.push(or(lt(serviceTickets.createdAt, cur.createdAt), and(eq(serviceTickets.createdAt, cur.createdAt), lt(serviceTickets.id, cur.id)))!);
  const rows = await db
    .select({ t: serviceTickets, name: users.name, phone: users.phone })
    .from(serviceTickets)
    .innerJoin(users, eq(users.id, serviceTickets.userId))
    .where(and(...conds))
    .orderBy(desc(serviceTickets.createdAt), desc(serviceTickets.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return {
    items: page.map((r) => ticketDto(r.t, merchant.name, { customer: { name: r.name, phone: r.phone } })),
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!.t) : null,
  };
}

export async function listMyTickets(db: DbOrTx, userId: string, q: { limit: number; cursor?: string }) {
  const conds: SQL[] = [eq(serviceTickets.userId, userId)];
  const cur = decodeCursor(q.cursor);
  if (cur) conds.push(or(lt(serviceTickets.createdAt, cur.createdAt), and(eq(serviceTickets.createdAt, cur.createdAt), lt(serviceTickets.id, cur.id)))!);
  const rows = await db
    .select({ t: serviceTickets, merchantName: merchants.name })
    .from(serviceTickets)
    .innerJoin(merchants, eq(merchants.id, serviceTickets.merchantId))
    .where(and(...conds))
    .orderBy(desc(serviceTickets.createdAt), desc(serviceTickets.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return {
    items: page.map((r) => ticketDto(r.t, r.merchantName, { forCustomer: true })),
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!.t) : null,
  };
}

export async function updateTicket(ctx: AppContext, staff: StaffContext, ticketId: string, body: z.infer<typeof serviceApi.updateTicketBody>) {
  const ticket = await getMerchantTicket(ctx.db, staff.merchant.id, ticketId);
  await assertLocation(ctx.db, staff.merchant.id, body.locationId);
  await assertStaffMember(ctx.db, staff.merchant.id, body.assignedStaffId);
  const patch: Partial<typeof serviceTickets.$inferInsert> = { updatedAt: ctx.now() };
  if (body.locationId !== undefined) patch.locationId = body.locationId;
  if (body.itemKind !== undefined) patch.itemKind = body.itemKind;
  if (body.itemDetails !== undefined) patch.itemDetails = body.itemDetails;
  if (body.issue !== undefined) patch.issue = body.issue;
  if (body.intakeNotes !== undefined) patch.intakeNotes = body.intakeNotes;
  if (body.photos !== undefined) patch.photos = body.photos;
  if (body.promisedAt !== undefined) patch.promisedAt = body.promisedAt ? new Date(body.promisedAt) : null;
  if (body.assignedStaffId !== undefined) patch.assignedStaffId = body.assignedStaffId;
  const [row] = await ctx.db.update(serviceTickets).set(patch).where(eq(serviceTickets.id, ticket.id)).returning();
  return getTicketDetail(ctx, staff.merchant, row!, false);
}

const STATUS_MESSAGES: Partial<Record<TicketStatus, (shop: string, item: string, n: number) => { title: string; body: string }>> = {
  in_progress: (shop, item, n) => ({ title: `${shop}: work started`, body: `${shop} has started work on ${item} (ticket #${n}).` }),
  waiting_parts: (shop, item, n) => ({ title: `${shop}: waiting on parts`, body: `${shop} is waiting on parts for ${item} (ticket #${n}). We'll update you when they arrive.` }),
  ready: (shop, item, n) => ({ title: `${shop}: ready for pickup`, body: `Good news! ${item[0]!.toUpperCase()}${item.slice(1)} is ready for pickup at ${shop} (ticket #${n}).` }),
};

export async function setTicketStatus(ctx: AppContext, staff: StaffContext, ticketId: string, body: z.infer<typeof serviceApi.ticketStatusBody>) {
  const merchant = staff.merchant;
  const ticket = await getMerchantTicket(ctx.db, merchant.id, ticketId);
  if (TERMINAL_TICKET_STATUSES.includes(ticket.status)) throw conflict(`Ticket is already ${ticket.status.replace("_", " ")}`);
  if (ticket.status === body.status) throw conflict(`Ticket is already ${body.status.replace("_", " ")}`);
  let openInvoice: typeof invoices.$inferSelect | undefined;
  [openInvoice] = await ctx.db.select().from(invoices).where(and(eq(invoices.ticketId, ticket.id), eq(invoices.merchantId, merchant.id), eq(invoices.status, "open"))).limit(1);
  if (body.status === "picked_up" && openInvoice && openInvoice.amountDueCents > 0 && !body.allowUnpaid) {
    throw conflict(`Invoice #${openInvoice.number} still has ${(openInvoice.amountDueCents / 100).toFixed(2)} due. Mark it paid or pass allowUnpaid.`);
  }
  const customerFacing = body.status in STATUS_MESSAGES || body.status === "picked_up" || body.status === "cancelled";
  const updated = await setTicketStatusRaw(ctx.db, ctx.now(), ticket, body.status, { note: body.note ?? null, visibleToCustomer: customerFacing, actorUserId: staff.user.id });
  const msg = STATUS_MESSAGES[body.status];
  if (msg && body.notify) {
    const m = msg(merchant.name, itemLabel(ticket.itemKind, ticket.itemDetails), ticket.number);
    let text = body.note ? `${m.body} ${body.note}` : m.body;
    if (body.status === "ready" && openInvoice && openInvoice.amountDueCents > 0) text += ` Pay ahead: ${ctx.config.publicWebUrl}/i/${openInvoice.payToken}`;
    await notifyCustomer(ctx, { userId: ticket.userId, merchantId: merchant.id, title: m.title, body: text, data: { type: "ticket_status", ticketId: ticket.id, status: body.status } });
  }
  return getTicketDetail(ctx, merchant, updated, false);
}

export async function addNote(ctx: AppContext, staff: StaffContext, ticketId: string, body: z.infer<typeof serviceApi.ticketEventBody>) {
  const ticket = await getMerchantTicket(ctx.db, staff.merchant.id, ticketId);
  const ev = await addTicketEvent(ctx.db, ticket.id, { note: body.note, visibleToCustomer: body.visibleToCustomer, actorUserId: staff.user.id });
  await ctx.db.update(serviceTickets).set({ updatedAt: ctx.now() }).where(eq(serviceTickets.id, ticket.id));
  return { id: ev.id, status: ev.status, note: ev.note, visibleToCustomer: ev.visibleToCustomer, actorUserId: ev.actorUserId, createdAt: ev.createdAt.toISOString() };
}
