/**
 * Service tickets (Pro): intake at drop-off, item details, photos, status
 * timeline. Quotes live in quotes.ts and invoices in invoices.ts.
 */
import { and, asc, desc, eq, ilike, inArray, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { bookings, invoices, locations, merchantMembers, merchantStaff, merchants, quotes, serviceTickets, ticketEvents, users, type DbOrTx } from "@ll/db";
import { LIEN_FLAG_DAYS, TICKET_LINK_DAYS_AFTER_CLOSE, normalizeLocale, normalizePhone, serviceApi, t } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { decodeCursor, encodeCursor, iso, itemLabel, notifyCustomer } from "./commerceShared.js";
import { nextNumber } from "./counters.js";
import { UPLOAD_PATH, storageKeyFromUrl, toStoredUploadUrl, type UploadSigner, uploadSigner } from "../providers/storage.js";
import { invoiceDto } from "./invoices.js";
import { findOrCreateCustomerByPhone } from "./ledger.js";
import { quoteDto } from "./quotes.js";
import { customerLocale, withLang } from "./service-messages.js";

export type Ticket = typeof serviceTickets.$inferSelect;
type Merchant = typeof merchants.$inferSelect;
export type TicketStatus = serviceApi.TicketStatus;

export const TERMINAL_TICKET_STATUSES: TicketStatus[] = ["picked_up", "cancelled"];

export interface TicketExtras {
  forCustomer?: boolean;
  customer?: { name: string | null; phone: string | null; locale?: string | null };
  quote?: serviceApi.TicketDto["quote"];
  invoice?: serviceApi.TicketDto["invoice"];
  assignedStaff?: serviceApi.TicketDto["assignedStaff"];
  depositPaidCents?: number;
  publicWebUrl?: string;
  /** Turns stored upload paths in `photos` into short-lived signed URLs (read time). Without it the stored values are returned as they are. */
  signUpload?: UploadSigner;
  now?: Date;
  timezone?: string;
}

const DAY_MS = 86_400_000;
const localDay = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Overdue (promised time has passed) or due later today, for tickets still open on the shop's side. */
export function dueStateOf(t: Pick<Ticket, "promisedAt" | "status">, now: Date, timeZone: string): "overdue" | "today" | null {
  if (!t.promisedAt || t.status === "ready" || t.status === "picked_up" || t.status === "cancelled") return null;
  if (t.promisedAt <= now) return "overdue";
  return localDay(t.promisedAt, timeZone) === localDay(now, timeZone) ? "today" : null;
}

export function readyDays(t: Pick<Ticket, "readyAt" | "updatedAt" | "status">, now: Date): number | null {
  if (t.status !== "ready") return null;
  return Math.max(0, Math.floor((now.getTime() - (t.readyAt ?? t.updatedAt).getTime()) / DAY_MS));
}

/**
 * Photo values as stored: the permanent relative path of an upload (whatever signed or hosted URL the form sent back),
 * or a link the shop pasted, as given. Uploads are signed again each time they are read, so a key that belongs to
 * another shop would get a valid link: refuse it here.
 */
export function storePhotos(ctx: AppContext, merchantId: string, urls: string[]): string[] {
  return urls.map((u) => {
    const stored = toStoredUploadUrl(u, ctx.config.publicApiUrl);
    const key = storageKeyFromUrl(stored);
    if (!key) return stored;
    if (!key.startsWith(`${merchantId}/`)) throw badRequest("That photo belongs to another shop.");
    return `${UPLOAD_PATH}${key}`;
  });
}

export function ticketDto(t: Ticket, merchantName: string, opts: TicketExtras = {}): serviceApi.TicketDto {
  const staff = !opts.forCustomer;
  const now = opts.now;
  const days = now ? readyDays(t, now) : null;
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
    photos: opts.signUpload ? t.photos.map(opts.signUpload) : t.photos,
    status: t.status,
    assignedStaffId: t.assignedStaffId,
    promisedAt: iso(t.promisedAt),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    intakeChecklist: t.intakeChecklist,
    termsAcceptedAt: iso(t.termsAcceptedAt),
    shelfLocation: t.shelfLocation,
    readyAt: iso(t.readyAt),
    ...(opts.customer ? { customer: { name: opts.customer.name, phone: opts.customer.phone, language: normalizeLocale(opts.customer.locale) ?? "en" } } : {}),
    ...(staff
      ? {
          quote: opts.quote ?? null,
          invoice: opts.invoice ?? null,
          dueState: now ? dueStateOf(t, now, opts.timezone ?? "America/Toronto") : null,
          assignedStaff: opts.assignedStaff ?? null,
          statusUrl: t.statusToken && opts.publicWebUrl ? `${opts.publicWebUrl}/t/${t.statusToken}` : null,
          lienEligible: !!t.lienEligibleAt || (days !== null && days >= LIEN_FLAG_DAYS),
          lienNoticeSentAt: iso(t.lienNoticeSentAt),
          depositPaidCents: opts.depositPaidCents ?? 0,
        }
      : {}),
  };
}

/** Status link token, created when first needed (tickets made before the status page existed have none). */
export async function ensureStatusToken(db: DbOrTx, ticket: Ticket): Promise<Ticket & { statusToken: string }> {
  if (ticket.statusToken) return ticket as Ticket & { statusToken: string };
  const token = randomToken(18);
  const [row] = await db.update(serviceTickets).set({ statusToken: token }).where(and(eq(serviceTickets.id, ticket.id), isNull(serviceTickets.statusToken))).returning();
  if (row) return row as Ticket & { statusToken: string };
  const [cur] = await db.select().from(serviceTickets).where(eq(serviceTickets.id, ticket.id)).limit(1);
  return cur as Ticket & { statusToken: string };
}

function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
}

/** Latest live quote, latest invoice, deposit paid and assignee for a page of tickets (two queries, not one per ticket). */
async function enrich(db: DbOrTx, merchant: Merchant, rows: Ticket[]) {
  const ids = rows.map((r) => r.id);
  const out = new Map<string, Pick<TicketExtras, "quote" | "invoice" | "assignedStaff" | "depositPaidCents">>();
  if (!ids.length) return out;
  const [qs, invs, staffRows] = await Promise.all([
    db.select().from(quotes).where(and(inArray(quotes.ticketId, ids), notInArray(quotes.status, ["draft", "superseded"]))).orderBy(desc(quotes.createdAt)),
    db.select().from(invoices).where(and(inArray(invoices.ticketId, ids), notInArray(invoices.status, ["void"]))).orderBy(desc(invoices.createdAt)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, [...new Set(rows.map((r) => r.assignedStaffId).filter((x): x is string => !!x))].concat(["00000000-0000-0000-0000-000000000000"]))),
  ]);
  const names = new Map(staffRows.map((u) => [u.id, u.name]));
  for (const r of rows) {
    const q = qs.find((x) => x.ticketId === r.id);
    const inv = invs.find((x) => x.ticketId === r.id);
    const approved = qs.find((x) => x.ticketId === r.id && x.status === "approved");
    out.set(r.id, {
      quote: q ? { status: q.status, totalCents: q.totalCents, sentAt: iso(q.sentAt), firstViewedAt: iso(q.firstViewedAt), expiresAt: iso(q.expiresAt) } : null,
      invoice: inv ? { status: inv.status, amountDueCents: inv.amountDueCents, totalCents: inv.totalCents } : null,
      assignedStaff: r.assignedStaffId ? { id: r.assignedStaffId, initials: initialsOf(names.get(r.assignedStaffId)), name: names.get(r.assignedStaffId) ?? null } : null,
      depositPaidCents: approved?.depositPaidAt ? approved.depositCents : 0,
    });
  }
  return out;
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
  const patch: Partial<typeof serviceTickets.$inferInsert> = { status, updatedAt: now };
  if (status === "ready") Object.assign(patch, { readyAt: now, pickupReminderDay: 0, lienEligibleAt: null });
  const [row] = await db.update(serviceTickets).set(patch).where(eq(serviceTickets.id, ticket.id)).returning();
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

export async function createTicket(ctx: AppContext, staff: StaffContext, input: z.input<typeof serviceApi.createTicketBody>) {
  const body = serviceApi.createTicketBody.parse(input);
  const merchant = staff.merchant;
  const phone = normalizePhone(body.customer.phone);
  if (!phone) throw badRequest("Enter a valid phone number");
  await assertLocation(ctx.db, merchant.id, body.locationId);
  await assertStaffMember(ctx.db, merchant.id, body.assignedStaffId);
  const terms = merchant.intakeTerms?.trim();
  if (terms && !body.termsAccepted) throw new HttpError(400, "terms_required", "The customer needs to accept the drop-off terms first.");
  const details = { ...body.itemDetails, ...(body.items?.length ? { items: JSON.stringify(body.items.map((i) => ({ description: i.description, ...(i.tag ? { tag: i.tag } : {}) }))) } : {}) };
  const now = ctx.now();
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
        itemDetails: details,
        issue: body.issue,
        intakeNotes: body.intakeNotes ?? null,
        photos: storePhotos(ctx, merchant.id, body.photos),
        status: "intake",
        assignedStaffId: body.assignedStaffId ?? null,
        promisedAt: body.promisedAt ? new Date(body.promisedAt) : null,
        intakeChecklist: body.intakeChecklist,
        termsAcceptedAt: terms && body.termsAccepted ? now : null,
        shelfLocation: body.shelfLocation?.trim() || null,
        statusToken: randomToken(18),
      })
      .returning();
    const extras = [body.photos.length ? `${body.photos.length} photo${body.photos.length === 1 ? "" : "s"}` : null, terms && body.termsAccepted ? "terms signed" : null].filter(Boolean).join(", ");
    await addTicketEvent(tx, t!.id, { status: "intake", note: extras ? `Checked in. ${extras[0]!.toUpperCase()}${extras.slice(1)}` : "Checked in", visibleToCustomer: true, actorUserId: staff.user.id });
    if (body.bookingId) {
      // Check in from a drop-off booking: the booking is done and points at the ticket.
      const [b] = await tx.update(bookings).set({ ticketId: t!.id, status: "completed" }).where(and(eq(bookings.id, body.bookingId), eq(bookings.merchantId, merchant.id), eq(bookings.status, "booked"))).returning({ id: bookings.id });
      if (!b) throw conflict("That booking was already checked in or cancelled");
    }
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
    forCustomer ? Promise.resolve(undefined) : ctx.db.select({ name: users.name, phone: users.phone, locale: users.locale }).from(users).where(eq(users.id, ticket.userId)).limit(1).then((r) => r[0]),
  ]);
  const ex = forCustomer ? undefined : (await enrich(ctx.db, merchant, [ticket])).get(ticket.id);
  const summary = forCustomer ? undefined : await customerSummaryFor(ctx.db, merchant.id, ticket);
  const withToken = forCustomer ? ticket : await ensureStatusToken(ctx.db, ticket);
  return {
    ticket: ticketDto(withToken, merchant.name, { forCustomer, customer, ...ex, publicWebUrl: ctx.config.publicWebUrl, signUpload: uploadSigner(ctx), now: ctx.now(), timezone: merchant.timezone }),
    events: events.map((e) => ({ id: e.id, status: e.status, note: e.note, visibleToCustomer: e.visibleToCustomer, actorUserId: forCustomer ? null : e.actorUserId, createdAt: e.createdAt.toISOString() })),
    quotes: qs.map((q) => quoteDto(q, ctx.config.publicWebUrl, !forCustomer)),
    invoices: invs.map((i) => invoiceDto(i, ctx.config.publicWebUrl)),
    ...(summary ? { customerSummary: summary } : {}),
  };
}

async function customerSummaryFor(db: DbOrTx, merchantId: string, ticket: Ticket) {
  const [past] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number), last: sql<Date | null>`max(${serviceTickets.createdAt})` })
    .from(serviceTickets)
    .where(and(eq(serviceTickets.merchantId, merchantId), eq(serviceTickets.userId, ticket.userId), sql`${serviceTickets.id} <> ${ticket.id}`));
  const [m] = await db.select({ balance: merchantMembers.balance }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, ticket.userId))).limit(1);
  return { pastTickets: past?.n ?? 0, lastTicketAt: past?.last ? new Date(past.last).toISOString() : null, balance: m?.balance ?? null, visits: (past?.n ?? 0) + 1 };
}

export async function listTickets(db: DbOrTx, merchant: Merchant, q: z.infer<typeof serviceApi.listTicketsQuery>, ctx?: { now: () => Date; publicWebUrl: string; signUpload?: UploadSigner }) {
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
  if (q.assignedTo) conds.push(eq(serviceTickets.assignedStaffId, q.assignedTo));
  if (q.hasPhotos) conds.push(sql`jsonb_array_length(${serviceTickets.photos}) > 0`);
  const now = ctx?.now() ?? new Date();
  if (q.dueState === "overdue") conds.push(sql`${serviceTickets.promisedAt} <= ${now.toISOString()}::timestamptz`, notInArray(serviceTickets.status, ["ready", "picked_up", "cancelled"]));
  if (q.dueState === "today") {
    // Local calendar day of the shop, not UTC.
    conds.push(sql`(${serviceTickets.promisedAt} at time zone ${merchant.timezone})::date = (${now.toISOString()}::timestamptz at time zone ${merchant.timezone})::date`, notInArray(serviceTickets.status, ["ready", "picked_up", "cancelled"]));
  }
  const cur = decodeCursor(q.cursor);
  if (cur) conds.push(or(lt(serviceTickets.createdAt, cur.createdAt), and(eq(serviceTickets.createdAt, cur.createdAt), lt(serviceTickets.id, cur.id)))!);
  const rows = await db
    .select({ t: serviceTickets, name: users.name, phone: users.phone, locale: users.locale })
    .from(serviceTickets)
    .innerJoin(users, eq(users.id, serviceTickets.userId))
    .where(and(...conds))
    .orderBy(desc(serviceTickets.createdAt), desc(serviceTickets.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const extras = await enrich(db, merchant, page.map((r) => r.t));
  return {
    items: page.map((r) => ticketDto(r.t, merchant.name, { customer: { name: r.name, phone: r.phone, locale: r.locale }, ...extras.get(r.t.id), now, timezone: merchant.timezone, publicWebUrl: ctx?.publicWebUrl, signUpload: ctx?.signUpload })),
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!.t) : null,
  };
}

/** Numbers for the stat strip on the board: what needs the shop, what waits on the customer, what is overdue or uncollected. */
export async function ticketSummary(db: DbOrTx, merchant: Merchant, now: Date): Promise<serviceApi.TicketSummaryResponse> {
  const open = await db
    .select({ id: serviceTickets.id, status: serviceTickets.status, promisedAt: serviceTickets.promisedAt, readyAt: serviceTickets.readyAt, updatedAt: serviceTickets.updatedAt, lienEligibleAt: serviceTickets.lienEligibleAt })
    .from(serviceTickets)
    .where(and(eq(serviceTickets.merchantId, merchant.id), notInArray(serviceTickets.status, TERMINAL_TICKET_STATUSES)));
  const sent = await db.select({ totalCents: quotes.totalCents }).from(quotes).where(and(eq(quotes.merchantId, merchant.id), eq(quotes.status, "sent")));
  const out: serviceApi.TicketSummaryResponse = { needsYou: 0, waitingOnCustomer: 0, dueToday: 0, overdue: 0, readyUncollected: 0, oldestReadyDays: 0, openQuoteValueCents: sent.reduce((s, x) => s + x.totalCents, 0), openQuoteCount: sent.length, lienEligible: 0 };
  for (const r of open) {
    const due = dueStateOf(r, now, merchant.timezone);
    if (due === "overdue") out.overdue++;
    if (due === "today") out.dueToday++;
    if (r.status === "quote_sent") out.waitingOnCustomer++;
    else if (["intake", "diagnosing", "approved", "declined"].includes(r.status) || due === "overdue") out.needsYou++;
    if (r.status === "ready") {
      out.readyUncollected++;
      const d = readyDays(r as Ticket, now) ?? 0;
      out.oldestReadyDays = Math.max(out.oldestReadyDays, d);
      if (r.lienEligibleAt || d >= LIEN_FLAG_DAYS) out.lienEligible++;
    }
  }
  return out;
}

export async function listMyTickets(db: DbOrTx, userId: string, q: { limit: number; cursor?: string }, signUpload?: UploadSigner) {
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
    items: page.map((r) => ticketDto(r.t, r.merchantName, { forCustomer: true, signUpload })),
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
  if (body.photos !== undefined) patch.photos = storePhotos(ctx, staff.merchant.id, body.photos);
  if (body.promisedAt !== undefined) patch.promisedAt = body.promisedAt ? new Date(body.promisedAt) : null;
  if (body.assignedStaffId !== undefined) patch.assignedStaffId = body.assignedStaffId;
  if (body.intakeChecklist !== undefined) patch.intakeChecklist = body.intakeChecklist;
  if (body.shelfLocation !== undefined) patch.shelfLocation = body.shelfLocation?.trim() || null;
  const [row] = await ctx.db.update(serviceTickets).set(patch).where(eq(serviceTickets.id, ticket.id)).returning();
  return getTicketDetail(ctx, staff.merchant, row!, false);
}

/** Statuses that text the customer, with the catalog keys for the title and body. */
const STATUS_TEXTS: Partial<Record<TicketStatus, { title: "sv.msg.inProgressTitle" | "sv.msg.waitingPartsTitle" | "sv.msg.readyTitle"; body: "sv.msg.inProgress" | "sv.msg.waitingParts" | "sv.msg.ready" }>> = {
  in_progress: { title: "sv.msg.inProgressTitle", body: "sv.msg.inProgress" },
  waiting_parts: { title: "sv.msg.waitingPartsTitle", body: "sv.msg.waitingParts" },
  ready: { title: "sv.msg.readyTitle", body: "sv.msg.ready" },
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
  const customerFacing = body.status in STATUS_TEXTS || body.status === "picked_up" || body.status === "cancelled";
  const updated = await setTicketStatusRaw(ctx.db, ctx.now(), ticket, body.status, { note: body.note ?? null, visibleToCustomer: customerFacing, actorUserId: staff.user.id });
  const texts = STATUS_TEXTS[body.status];
  if (texts && body.notify) {
    const locale = await customerLocale(ctx.db, ticket.userId);
    const withToken = await ensureStatusToken(ctx.db, updated);
    const item = itemLabel(ticket.itemKind, ticket.itemDetails);
    const vars = { shop: merchant.name, item: texts.body === "sv.msg.ready" ? item.charAt(0).toUpperCase() + item.slice(1) : item, n: ticket.number, url: withLang(`${ctx.config.publicWebUrl}/t/${withToken.statusToken}`, locale) };
    let text = t(locale, texts.body, vars);
    if (body.note) text += ` ${body.note}`;
    if (body.status === "ready" && openInvoice && openInvoice.amountDueCents > 0) text += t(locale, "sv.msg.payAhead", { url: withLang(`${ctx.config.publicWebUrl}/i/${openInvoice.payToken}`, locale) });
    await notifyCustomer(ctx, { userId: ticket.userId, merchantId: merchant.id, title: t(locale, texts.title, { shop: merchant.name }), body: text, data: { type: "ticket_status", ticketId: ticket.id, status: body.status } });
  }
  return getTicketDetail(ctx, merchant, updated, false);
}

export async function addNote(ctx: AppContext, staff: StaffContext, ticketId: string, body: z.infer<typeof serviceApi.ticketEventBody>) {
  const ticket = await getMerchantTicket(ctx.db, staff.merchant.id, ticketId);
  const ev = await addTicketEvent(ctx.db, ticket.id, { note: body.note, visibleToCustomer: body.visibleToCustomer, actorUserId: staff.user.id });
  await ctx.db.update(serviceTickets).set({ updatedAt: ctx.now() }).where(eq(serviceTickets.id, ticket.id));
  return { id: ev.id, status: ev.status, note: ev.note, visibleToCustomer: ev.visibleToCustomer, actorUserId: ev.actorUserId, createdAt: ev.createdAt.toISOString() };
}

// ---------------------------------------------------------------------------
// Public status page (/t/<token>): no sign-in, nothing staff-only
// ---------------------------------------------------------------------------
/** When the ticket closed: its last picked_up / cancelled event, falling back to its last update. Null while it is open. */
export async function ticketClosedAt(db: DbOrTx, ticket: Pick<Ticket, "id" | "status" | "updatedAt">): Promise<Date | null> {
  if (!TERMINAL_TICKET_STATUSES.includes(ticket.status)) return null;
  const [last] = await db
    .select({ at: sql<Date | null>`max(${ticketEvents.createdAt})` })
    .from(ticketEvents)
    .where(and(eq(ticketEvents.ticketId, ticket.id), inArray(ticketEvents.status, TERMINAL_TICKET_STATUSES)));
  const at = last?.at ? new Date(last.at) : null;
  return at && !Number.isNaN(at.getTime()) ? at : ticket.updatedAt;
}

/**
 * Ticket for a public status link. Open tickets always resolve; a closed one resolves for
 * TICKET_LINK_DAYS_AFTER_CLOSE days, then 410 `link_expired` (the page shows the shop's name and phone so the customer can ask).
 */
export async function getTicketByStatusToken(db: DbOrTx, token: string, now: Date = new Date()): Promise<Ticket> {
  if (!token || token.length < 16) throw notFound("Ticket");
  const [row] = await db.select().from(serviceTickets).where(eq(serviceTickets.statusToken, token)).limit(1);
  if (!row) throw notFound("Ticket");
  const closedAt = await ticketClosedAt(db, row);
  if (closedAt && now.getTime() - closedAt.getTime() > TICKET_LINK_DAYS_AFTER_CLOSE * DAY_MS) {
    const [shop] = await db.select({ name: merchants.name, phone: merchants.phone }).from(merchants).where(eq(merchants.id, row.merchantId)).limit(1);
    throw new HttpError(410, "link_expired", "This status link has expired.", { shopName: shop?.name ?? null, shopPhone: shop?.phone ?? null });
  }
  return row;
}

export async function publicTicketStatus(ctx: AppContext, ticket: Ticket): Promise<serviceApi.PublicTicketStatusResponse> {
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, ticket.merchantId)).limit(1);
  if (!merchant) throw notFound("Ticket");
  const [events, qs, invs, loc] = await Promise.all([
    ctx.db.select().from(ticketEvents).where(and(eq(ticketEvents.ticketId, ticket.id), eq(ticketEvents.visibleToCustomer, true))).orderBy(asc(ticketEvents.createdAt)),
    ctx.db.select().from(quotes).where(and(eq(quotes.ticketId, ticket.id), notInArray(quotes.status, ["draft", "superseded"]))).orderBy(desc(quotes.createdAt)).limit(1),
    ctx.db.select().from(invoices).where(and(eq(invoices.ticketId, ticket.id), inArray(invoices.status, ["open", "paid"]))).orderBy(desc(invoices.createdAt)).limit(1),
    ticket.locationId ? ctx.db.select({ address: locations.address, lat: locations.lat, lng: locations.lng }).from(locations).where(eq(locations.id, ticket.locationId)).limit(1) : ctx.db.select({ address: locations.address, lat: locations.lat, lng: locations.lng }).from(locations).where(eq(locations.merchantId, merchant.id)).limit(1),
  ]);
  const q = qs[0];
  const inv = invs[0];
  const address = loc[0]?.address ?? null;
  return {
    merchant: { name: merchant.name, slug: merchant.slug, logoUrl: merchant.logoUrl, phone: merchant.phone, vertical: merchant.vertical, address, mapUrl: address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${merchant.name} ${address}`)}` : null },
    ticket: { number: ticket.number, itemKind: ticket.itemKind as serviceApi.ItemKind, itemLabel: itemLabel(ticket.itemKind, ticket.itemDetails), issue: ticket.issue, status: ticket.status, promisedAt: iso(ticket.promisedAt), readyAt: iso(ticket.readyAt), updatedAt: ticket.updatedAt.toISOString() },
    events: events.map((e) => ({ status: e.status, note: e.note, createdAt: e.createdAt.toISOString() })),
    invoice: inv ? { number: inv.number, amountDueCents: inv.amountDueCents, depositAppliedCents: inv.depositAppliedCents, payUrl: inv.status === "open" ? `${ctx.config.publicWebUrl}/i/${inv.payToken}` : null, status: inv.status } : null,
    quote: q ? { status: q.status, totalCents: q.totalCents, approvalUrl: q.status === "sent" ? `${ctx.config.publicWebUrl}/q/${q.approvalToken}` : null } : null,
    warrantyDays: merchant.warrantyDays ?? null,
  };
}
