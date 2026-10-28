/**
 * Barbershops, threading bars and beauty supply (docs/research/barbers-beauty.md): the walk-in line, "my barber",
 * family members under one card, how each barber is paid and the payouts report.
 *
 * The line feeds the existing calendar: starting a person creates a walk-in appointment for the barber (source walk_in,
 * in_service), so checkout, the tip to that barber, points and rebooking are all the existing ones. Nothing here moves money.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { appointments, familyMembers, invoices, merchantStaff, merchants, preferredStaff, queueEntries, services, staffPay, staffServices, users, walkinQueues } from "@ll/db";
import { QUEUE_DEFAULT_MINUTES, QUEUE_LIVE, QUEUE_MAX_FAMILY, QUEUE_SKIP_BACK, estimateWaitMin, normalizeLocale, translator, type barberApi, type Locale, type QueueChair, type QueuePerson } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { AuthUser, StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { createAppointment, getAppointment, localParts } from "./appointments.js";
import { setStatus } from "./appointments-booking.js";
import { addDays, zonedToUtc } from "./bookings.js";
import { notifyCustomer } from "./commerceShared.js";
import { findOrCreateCustomerByPhone } from "./ledger.js";
import { requirePhone } from "./merchant.js";
import { autoSetPreferred } from "./preferred-staff.js";

export { autoSetPreferred };

type Merchant = typeof merchants.$inferSelect;
type Entry = typeof queueEntries.$inferSelect;
const MIN = 60_000;
const live = [...QUEUE_LIVE] as string[];

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getSettings(ctx: AppContext, merchantId: string): Promise<barberApi.QueueSettingsDto> {
  const [r] = await ctx.db.select().from(walkinQueues).where(eq(walkinQueues.merchantId, merchantId)).limit(1);
  return { open: r?.open ?? false, minutesPerCut: r?.minutesPerCut ?? QUEUE_DEFAULT_MINUTES, textNext: r?.textNext ?? true, maxWaiting: r?.maxWaiting ?? 30, callHoldMinutes: r?.callHoldMinutes ?? 5 };
}

export async function saveSettings(ctx: AppContext, merchantId: string, body: z.infer<typeof barberApi.queueSettingsBody>): Promise<barberApi.QueueSettingsDto> {
  const now = ctx.now();
  const cur = await getSettings(ctx, merchantId);
  const next = { ...cur, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) } as barberApi.QueueSettingsDto;
  await ctx.db
    .insert(walkinQueues)
    .values({ merchantId, ...next, updatedAt: now })
    .onConflictDoUpdate({ target: walkinQueues.merchantId, set: { ...next, updatedAt: now } });
  // Closing the line does not throw people out: they stay until served, skipped or they leave. It only stops new joins.
  return next;
}

// ---------------------------------------------------------------------------
// Team, chairs and pay
// ---------------------------------------------------------------------------
interface Barber {
  id: string;
  name: string;
  role: string;
  takesWalkIns: boolean;
  ownClientsOnly: boolean;
}

async function team(ctx: AppContext, merchantId: string): Promise<Barber[]> {
  const rows = await ctx.db
    .select({ id: users.id, name: users.name, email: users.email, role: merchantStaff.role, takes: staffPay.takesWalkIns, own: staffPay.ownClientsOnly })
    .from(merchantStaff)
    .innerJoin(users, eq(users.id, merchantStaff.userId))
    .leftJoin(staffPay, and(eq(staffPay.merchantId, merchantStaff.merchantId), eq(staffPay.userId, merchantStaff.userId)))
    .where(eq(merchantStaff.merchantId, merchantId))
    .orderBy(asc(users.name));
  return rows.map((r) => ({ id: r.id, name: r.name ?? r.email ?? "Barber", role: r.role, takesWalkIns: r.takes ?? true, ownClientsOnly: r.own ?? false }));
}

/** True for a team member who sees only their own chair (a chair renter who asked for privacy). Owners and managers never are. */
export async function isOwnClientsOnly(ctx: AppContext, staff: StaffContext): Promise<boolean> {
  if (staff.role !== "staff" || staff.impersonated) return false;
  const [p] = await ctx.db.select({ own: staffPay.ownClientsOnly }).from(staffPay).where(and(eq(staffPay.merchantId, staff.merchant.id), eq(staffPay.userId, staff.user.id))).limit(1);
  return p?.own === true;
}

export async function assertNotOwnClientsOnly(ctx: AppContext, staff: StaffContext): Promise<void> {
  if (await isOwnClientsOnly(ctx, staff)) throw new HttpError(403, "own_clients_only", "You see your own clients only. Your regulars and payouts are on the Payouts page.");
}

export async function getStaffPay(ctx: AppContext, merchantId: string, userId: string): Promise<barberApi.StaffPayDto> {
  const [m] = await ctx.db.select({ id: users.id, name: users.name, email: users.email }).from(merchantStaff).innerJoin(users, eq(users.id, merchantStaff.userId)).where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.userId, userId))).limit(1);
  if (!m) throw notFound("Team member");
  const [p] = await ctx.db.select().from(staffPay).where(and(eq(staffPay.merchantId, merchantId), eq(staffPay.userId, userId))).limit(1);
  return { userId, name: m.name ?? m.email ?? "Barber", model: (p?.model as barberApi.PayModel) ?? "employee", shopShareBps: p?.shopShareBps ?? 0, rentCentsWeek: p?.rentCentsWeek ?? 0, ownClientsOnly: p?.ownClientsOnly ?? false, takesWalkIns: p?.takesWalkIns ?? true };
}

export async function listStaffPay(ctx: AppContext, merchantId: string): Promise<{ items: barberApi.StaffPayDto[] }> {
  const t = await team(ctx, merchantId);
  const rows = await ctx.db.select().from(staffPay).where(eq(staffPay.merchantId, merchantId));
  return {
    items: t.map((b) => {
      const p = rows.find((r) => r.userId === b.id);
      return { userId: b.id, name: b.name, model: (p?.model as barberApi.PayModel) ?? "employee", shopShareBps: p?.shopShareBps ?? 0, rentCentsWeek: p?.rentCentsWeek ?? 0, ownClientsOnly: p?.ownClientsOnly ?? false, takesWalkIns: p?.takesWalkIns ?? true };
    }),
  };
}

export async function putStaffPay(ctx: AppContext, merchantId: string, userId: string, body: z.output<typeof barberApi.staffPayBody>): Promise<barberApi.StaffPayDto> {
  await getStaffPay(ctx, merchantId, userId); // 404 for someone not on the team
  if (body.model === "commission" && body.shopShareBps <= 0) throw badRequest("Set the share the shop keeps, more than 0%");
  const v = {
    model: body.model,
    shopShareBps: body.model === "commission" ? body.shopShareBps : 0,
    rentCentsWeek: body.model === "chair_rent" ? body.rentCentsWeek : 0,
    // Privacy is the default for a renter; a shop can untick it.
    ownClientsOnly: body.ownClientsOnly,
    takesWalkIns: body.takesWalkIns,
    updatedAt: ctx.now(),
  };
  await ctx.db.insert(staffPay).values({ merchantId, userId, ...v }).onConflictDoUpdate({ target: [staffPay.merchantId, staffPay.userId], set: v });
  return getStaffPay(ctx, merchantId, userId);
}

// ---------------------------------------------------------------------------
// The line
// ---------------------------------------------------------------------------
const dto = (e: Entry, pos: number | null, names: Map<string, string>, parents: Map<string, string>, now: Date): barberApi.QueueEntryDto => ({
  id: e.id,
  position: pos,
  name: e.name,
  withName: e.familyMemberId && e.userId ? (parents.get(e.userId) ?? null) : null,
  serviceName: e.serviceName,
  durationMin: e.durationMin,
  requestedStaffId: e.requestedStaffId,
  requestedStaffName: e.requestedStaffId ? (names.get(e.requestedStaffId) ?? null) : null,
  status: e.status as barberApi.QueueEntryDto["status"],
  source: e.source,
  joinedAt: e.joinedAt.toISOString(),
  calledAt: e.calledAt?.toISOString() ?? null,
  calledStaffId: e.calledStaffId,
  waitedMin: Math.max(0, Math.round(((e.finishedAt ?? now).getTime() - e.joinedAt.getTime()) / MIN)),
  textedNext: !!e.notifiedNextAt,
  skips: e.skips,
  appointmentId: e.appointmentId,
  partyId: e.partyId,
});

/** An in-service entry whose visit was completed (checkout) or dropped in the calendar is done. */
async function syncDone(ctx: AppContext, merchantId: string): Promise<void> {
  const open = await ctx.db.select({ id: queueEntries.id, appointmentId: queueEntries.appointmentId }).from(queueEntries).where(and(eq(queueEntries.merchantId, merchantId), eq(queueEntries.status, "in_service"), isNotNull(queueEntries.appointmentId)));
  if (!open.length) return;
  const appts = await ctx.db.select({ id: appointments.id, status: appointments.status, completedAt: appointments.completedAt }).from(appointments).where(inArray(appointments.id, open.map((o) => o.appointmentId!)));
  const now = ctx.now();
  for (const a of appts) {
    if (a.status === "completed") await ctx.db.update(queueEntries).set({ status: "done", finishedAt: a.completedAt ?? now, updatedAt: now }).where(and(eq(queueEntries.appointmentId, a.id), eq(queueEntries.status, "in_service")));
    else if (a.status === "cancelled" || a.status === "no_show") await ctx.db.update(queueEntries).set({ status: "left", finishedAt: now, updatedAt: now }).where(and(eq(queueEntries.appointmentId, a.id), eq(queueEntries.status, "in_service")));
  }
}

/** Minutes of the day's median recent service, so the estimate learns the shop's real pace. Null until there are 8 done entries. */
async function paceMin(ctx: AppContext, merchantId: string): Promise<number | null> {
  const rows = await ctx.db
    .select({ s: queueEntries.startedAt, f: queueEntries.finishedAt })
    .from(queueEntries)
    .where(and(eq(queueEntries.merchantId, merchantId), eq(queueEntries.status, "done"), isNotNull(queueEntries.startedAt), isNotNull(queueEntries.finishedAt)))
    .orderBy(desc(queueEntries.finishedAt))
    .limit(20);
  const mins = rows.map((r) => (r.f!.getTime() - r.s!.getTime()) / MIN).filter((m) => m >= 5 && m <= 120).sort((a, b) => a - b);
  if (mins.length < 8) return null;
  return Math.round(mins[Math.floor(mins.length / 2)]!);
}

interface Snapshot {
  settings: barberApi.QueueSettingsDto;
  team: Barber[];
  waiting: Entry[];
  called: Entry[];
  inService: Entry[];
  chairs: (barberApi.QueueChairDto & { busyMin: number })[];
  names: Map<string, string>;
  parents: Map<string, string>;
  merchantId: string;
}

async function snapshot(ctx: AppContext, merchant: Merchant): Promise<Snapshot> {
  await syncDone(ctx, merchant.id);
  const now = ctx.now();
  const [settings, t, entries] = await Promise.all([
    getSettings(ctx, merchant.id),
    team(ctx, merchant.id),
    ctx.db.select().from(queueEntries).where(and(eq(queueEntries.merchantId, merchant.id), inArray(queueEntries.status, live))).orderBy(asc(queueEntries.positionAt), asc(queueEntries.joinedAt), asc(queueEntries.id)),
  ]);
  const names = new Map(t.map((b) => [b.id, b.name]));
  const parentIds = [...new Set(entries.filter((e) => e.familyMemberId && e.userId).map((e) => e.userId!))];
  const parents = new Map<string, string>();
  if (parentIds.length) for (const u of await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, parentIds))) parents.set(u.id, (u.name ?? "").split(" ")[0] ?? "");
  const waiting = entries.filter((e) => e.status === "waiting");
  const called = entries.filter((e) => e.status === "called");
  const inService = entries.filter((e) => e.status === "in_service");
  // What each chair is doing right now: an arrived or in-service appointment, or a called client on the way.
  const busy = await ctx.db
    .select({ staffId: appointments.staffId, customerName: appointments.customerName, startsAt: appointments.startsAt, endsAt: appointments.endsAt, id: appointments.id, items: appointments.items })
    .from(appointments)
    .where(and(eq(appointments.merchantId, merchant.id), inArray(appointments.status, ["arrived", "in_service"]), isNotNull(appointments.staffId), lte(appointments.startsAt, now), gt(appointments.endsAt, now)));
  const chairs = t.map((b) => {
    const a = busy.find((x) => x.staffId === b.id);
    const c = called.find((x) => x.calledStaffId === b.id);
    const entry = inService.find((x) => x.appointmentId === a?.id) ?? null;
    let state: barberApi.QueueChairDto["state"] = "free";
    let busyMin = 0;
    let doing: string | null = null;
    if (!b.takesWalkIns) state = "away";
    else if (a) {
      state = "busy";
      busyMin = Math.max(0, Math.ceil((a.endsAt.getTime() - now.getTime()) / MIN));
      doing = [a.customerName, a.items[0]?.name].filter(Boolean).join(", ") || null;
    } else if (c) {
      state = "called";
      busyMin = c.durationMin;
      doing = `${c.name} is on the way`;
    }
    return { staffId: b.id, name: b.name, takesWalkIns: b.takesWalkIns, state, doing, entryId: entry?.id ?? c?.id ?? null, appointmentId: a?.id ?? null, minutesIn: a ? Math.max(0, Math.round((now.getTime() - a.startsAt.getTime()) / MIN)) : null, waitingForThem: waiting.filter((w) => w.requestedStaffId === b.id).length, busyMin };
  });
  return { settings, team: t, waiting, called, inService, chairs, names, parents, merchantId: merchant.id };
}

const chairsForEstimate = (s: Snapshot): QueueChair[] => s.chairs.filter((c) => c.takesWalkIns).map((c) => ({ staffId: c.staffId, busyMin: c.busyMin }));
const personOf = (e: Entry, pace: number | null): QueuePerson => ({ durationMin: pace && !e.serviceId ? pace : e.durationMin, requestedStaffId: e.requestedStaffId });

async function estimateFor(ctx: AppContext, s: Snapshot, aheadEntries: Entry[], staffId: string | null): Promise<number | null> {
  const pace = await paceMin(ctx, s.merchantId);
  return estimateWaitMin(aheadEntries.map((e) => personOf(e, pace)), chairsForEstimate(s), staffId);
}

export async function board(ctx: AppContext, staff: StaffContext): Promise<barberApi.QueueBoardResponse> {
  const merchant = staff.merchant;
  const s = await snapshot(ctx, merchant);
  const restricted = await isOwnClientsOnly(ctx, staff);
  const now = ctx.now();
  const day0 = zonedToUtc(localParts(now, merchant.timezone).date, 0, merchant.timezone);
  const [today] = await ctx.db
    .select({
      served: sql<number>`count(*) filter (where ${queueEntries.status} = 'done')::int`,
      noShows: sql<number>`count(*) filter (where ${queueEntries.status} = 'no_show')::int`,
    })
    .from(queueEntries)
    .where(and(eq(queueEntries.merchantId, merchant.id), gte(queueEntries.joinedAt, day0)));
  const visible = (e: Entry) => !restricted || !e.requestedStaffId || e.requestedStaffId === staff.user.id;
  const waiting = s.waiting.filter(visible);
  const chairs = s.chairs.filter((c) => !restricted || c.staffId === staff.user.id).map(({ busyMin: _b, ...c }) => c);
  const rank = new Map(s.waiting.map((e, i) => [e.id, i + 1]));
  const services_ = await ctx.db.select({ id: services.id, name: services.name, durationMin: services.durationMin }).from(services).where(and(eq(services.merchantId, merchant.id), eq(services.kind, "appointment"), eq(services.active, true))).orderBy(asc(services.sort), asc(services.name));
  const longest = s.waiting.reduce((m, e) => Math.max(m, Math.round((now.getTime() - e.joinedAt.getTime()) / MIN)), 0);
  const estimate = await estimateFor(ctx, s, s.waiting, null);
  return {
    settings: s.settings,
    waiting: waiting.map((e) => dto(e, rank.get(e.id) ?? null, s.names, s.parents, now)),
    called: s.called.filter(visible).map((e) => dto(e, null, s.names, s.parents, now)),
    inService: s.inService.filter((e) => !restricted || e.calledStaffId === staff.user.id).map((e) => dto(e, null, s.names, s.parents, now)),
    chairs,
    stats: { waiting: waiting.length, longestWaitMin: longest, estimateMin: estimate, chairsTaking: s.chairs.filter((c) => c.takesWalkIns).length, chairsTotal: s.chairs.length, servedToday: today?.served ?? 0, noShowsToday: today?.noShows ?? 0 },
    services: services_,
  };
}

// ---- public
export async function publicQueue(ctx: AppContext, merchant: Merchant): Promise<barberApi.PublicQueueResponse> {
  const s = await snapshot(ctx, merchant);
  const svc = await ctx.db.select({ id: services.id, name: services.name, durationMin: services.durationMin, priceCents: services.priceCents }).from(services).where(and(eq(services.merchantId, merchant.id), eq(services.kind, "appointment"), eq(services.active, true))).orderBy(asc(services.sort), asc(services.name));
  const everyone = await estimateFor(ctx, s, s.waiting, null);
  const barbers = [];
  const own = await ctx.db.select({ userId: staffServices.userId, serviceId: staffServices.serviceId, priceCents: staffServices.priceCents }).from(staffServices).where(eq(staffServices.merchantId, merchant.id));
  for (const c of s.chairs.filter((c) => c.takesWalkIns)) {
    const prices: Record<string, number> = {};
    for (const r of own) if (r.userId === c.staffId && r.priceCents !== null) { const list = svc.find((x) => x.id === r.serviceId); if (list && list.priceCents !== r.priceCents) prices[r.serviceId] = r.priceCents; }
    barbers.push({ id: c.staffId, name: c.name, estimateMin: await estimateFor(ctx, s, s.waiting, c.staffId), prices });
  }
  return { shop: { name: merchant.name, slug: merchant.slug }, open: s.settings.open, waiting: s.waiting.length + s.called.length, estimateMin: everyone, barbers, services: svc };
}

async function statusOf(ctx: AppContext, merchant: Merchant, e: Entry, s?: Snapshot): Promise<barberApi.QueueStatusResponse> {
  const snap = s ?? (await snapshot(ctx, merchant));
  const idx = snap.waiting.findIndex((w) => w.id === e.id);
  const ahead = idx >= 0 ? snap.waiting.slice(0, idx) : [];
  const estimate = e.status === "waiting" ? await estimateFor(ctx, snap, ahead, e.requestedStaffId) : null;
  const partyRows = e.partyId ? await ctx.db.select().from(queueEntries).where(and(eq(queueEntries.partyId, e.partyId), ne(queueEntries.id, e.id))) : [];
  // A family is served one after another at a named barber: the whole party is done when the last cut is. Waiting members only.
  let partyDoneMin: number | null = null;
  if (e.status === "waiting" && estimate !== null) {
    const rest = partyRows.filter((p) => snap.waiting.some((w) => w.id === p.id));
    if (rest.length) {
      const last = rest[rest.length - 1]!;
      const lastStart = await estimateFor(ctx, snap, [...ahead, e, ...rest.slice(0, -1)], e.requestedStaffId);
      if (lastStart !== null) partyDoneMin = Math.ceil((lastStart + last.durationMin) / 5) * 5;
    }
  }
  let pointsEarned: number | null = null;
  if (e.status === "done" && e.appointmentId) {
    const [inv] = await ctx.db.select({ points: invoices.pointsEarned, status: invoices.status }).from(appointments).innerJoin(invoices, eq(invoices.id, appointments.invoiceId)).where(eq(appointments.id, e.appointmentId)).limit(1);
    if (inv?.status === "paid" && inv.points > 0) pointsEarned = inv.points;
  }
  return {
    partyDoneMin,
    textsYou: !!e.userId && e.textConsent,
    pointsEarned,
    token: e.token,
    shop: { name: merchant.name, slug: merchant.slug },
    name: e.name,
    serviceName: e.serviceName,
    state: e.status as barberApi.QueueStatusResponse["state"],
    position: idx >= 0 ? idx + 1 : null,
    // People ahead of you, counting those already called to a chair (they are not served yet).
    ahead: idx >= 0 ? idx + snap.called.length : 0,
    estimateMin: estimate,
    barberName: e.requestedStaffId ? (snap.names.get(e.requestedStaffId) ?? null) : null,
    calledBarberName: e.calledStaffId ? (snap.names.get(e.calledStaffId) ?? null) : null,
    party: partyRows.map((p) => ({ name: p.name, position: (() => { const i = snap.waiting.findIndex((w) => w.id === p.id); return i >= 0 ? i + 1 : null; })() })),
  };
}

export async function statusByToken(ctx: AppContext, token: string): Promise<barberApi.QueueStatusResponse> {
  const [e] = await ctx.db.select().from(queueEntries).where(eq(queueEntries.token, token)).limit(1);
  if (!e) throw notFound("Place in line");
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, e.merchantId)).limit(1);
  if (!m) throw notFound("Shop");
  return statusOf(ctx, m, e);
}

interface JoinInput {
  name: string;
  phone?: string;
  serviceId?: string | null;
  requestedStaffId?: string | null;
  textConsent: boolean;
  familyMemberIds: string[];
  source: "join" | "tablet" | "staff";
}

async function loadService(ctx: AppContext, merchantId: string, serviceId: string | null | undefined, fallbackMin: number) {
  if (!serviceId) return { id: null as string | null, name: "Cut", durationMin: fallbackMin };
  const [s] = await ctx.db.select().from(services).where(and(eq(services.id, serviceId), eq(services.merchantId, merchantId), eq(services.kind, "appointment"), eq(services.active, true))).limit(1);
  if (!s) throw badRequest("Unknown service");
  return { id: s.id as string | null, name: s.name, durationMin: Math.max(5, s.durationMin) };
}

/** The back of the line: strictly later than every place so far, so two joins in the same millisecond keep their order. */
async function backOfLine(ctx: AppContext, merchantId: string, now: Date): Promise<Date> {
  const [last] = await ctx.db.select({ at: sql<Date | null>`max(${queueEntries.positionAt})`.mapWith(queueEntries.positionAt) }).from(queueEntries).where(eq(queueEntries.merchantId, merchantId));
  const lastAt = last?.at?.getTime() ?? 0;
  return new Date(Math.max(now.getTime(), lastAt + 1));
}

/** Join the line. A guest gives a first name and (to get the text) a phone number; a signed-in customer can bring family members. */
export async function join(ctx: AppContext, merchant: Merchant, input: JoinInput, authUser: AuthUser | null): Promise<barberApi.JoinQueueResponse> {
  const now = ctx.now();
  const s = await snapshot(ctx, merchant);
  if (input.source === "join" && !s.settings.open) throw new HttpError(409, "queue_closed", "The line is closed right now.");
  if (s.waiting.length + s.called.length >= s.settings.maxWaiting) throw new HttpError(409, "queue_full", "The line is full right now. Please try again later.");

  let userId: string | null = authUser?.id ?? null;
  if (!userId && input.phone) userId = (await findOrCreateCustomerByPhone(ctx.db, requirePhone(input.phone), input.name)).user.id;
  if (input.textConsent && !userId) throw badRequest("Add a mobile number to get the text");
  if (input.requestedStaffId && !s.team.some((b) => b.id === input.requestedStaffId && b.takesWalkIns)) throw badRequest("That barber is not taking walk-ins");

  // One place per customer: joining again returns the first place.
  if (userId) {
    const [dupe] = await ctx.db.select().from(queueEntries).where(and(eq(queueEntries.merchantId, merchant.id), eq(queueEntries.userId, userId), isNull(queueEntries.familyMemberId), inArray(queueEntries.status, live))).limit(1);
    if (dupe) return { entries: [{ id: dupe.id, token: dupe.token, name: dupe.name }], token: dupe.token, status: await statusOf(ctx, merchant, dupe, s) };
  }

  const svc = await loadService(ctx, merchant.id, input.serviceId, s.settings.minutesPerCut);
  let family: { id: string; firstName: string }[] = [];
  if (input.familyMemberIds.length) {
    if (!authUser) throw badRequest("Sign in to bring family members");
    if (input.familyMemberIds.length > QUEUE_MAX_FAMILY) throw badRequest("Too many family members");
    family = await ctx.db.select({ id: familyMembers.id, firstName: familyMembers.firstName }).from(familyMembers).where(and(eq(familyMembers.userId, authUser.id), inArray(familyMembers.id, input.familyMemberIds)));
    if (family.length !== new Set(input.familyMemberIds).size) throw notFound("Family member");
  }
  // Kids' cuts use the shop's kid service when it has one.
  let kidSvc = svc;
  if (family.length) {
    const [k] = await ctx.db.select({ id: services.id }).from(services).where(and(eq(services.merchantId, merchant.id), eq(services.kind, "appointment"), eq(services.active, true), sql`${services.name} ~* 'kid|child|junior'`)).orderBy(asc(services.sort)).limit(1);
    if (k) kidSvc = await loadService(ctx, merchant.id, k.id, s.settings.minutesPerCut);
  }

  const partyId = family.length ? randomUUID() : null;
  const at = await backOfLine(ctx, merchant.id, now);
  const rows: (typeof queueEntries.$inferInsert)[] = [
    { merchantId: merchant.id, userId, partyId, name: input.name.trim(), serviceId: svc.id, serviceName: svc.name, durationMin: svc.durationMin, requestedStaffId: input.requestedStaffId ?? null, source: input.source, token: randomToken(18), positionAt: at, joinedAt: now, textConsent: input.textConsent },
    ...family.map((f, i) => ({ merchantId: merchant.id, userId, familyMemberId: f.id, partyId, name: f.firstName, serviceId: kidSvc.id, serviceName: kidSvc.name, durationMin: kidSvc.durationMin, requestedStaffId: input.requestedStaffId ?? null, source: input.source, token: randomToken(18), positionAt: new Date(at.getTime() + i + 1), joinedAt: now, textConsent: false })),
  ];
  const created = await ctx.db.insert(queueEntries).values(rows).returning();
  await notifyNext(ctx, merchant);
  const first = created[0]!;
  return { entries: created.map((c) => ({ id: c.id, token: c.token, name: c.name })), token: first.token, status: await statusOf(ctx, merchant, first) };
}

export async function leave(ctx: AppContext, token: string): Promise<barberApi.QueueStatusResponse> {
  const [e] = await ctx.db.select().from(queueEntries).where(eq(queueEntries.token, token)).limit(1);
  if (!e) throw notFound("Place in line");
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, e.merchantId)).limit(1);
  if (!m) throw notFound("Shop");
  const now = ctx.now();
  // Leaving also takes the family members who joined with this person off the line.
  if (["waiting", "called"].includes(e.status)) {
    await ctx.db.update(queueEntries).set({ status: "left", finishedAt: now, updatedAt: now }).where(and(inArray(queueEntries.status, ["waiting", "called"]), e.partyId ? eq(queueEntries.partyId, e.partyId) : eq(queueEntries.id, e.id)));
    await notifyNext(ctx, m);
  }
  const [fresh] = await ctx.db.select().from(queueEntries).where(eq(queueEntries.id, e.id)).limit(1);
  return statusOf(ctx, m, fresh!);
}

// ---- staff actions
async function entryOf(ctx: AppContext, merchantId: string, id: string): Promise<Entry> {
  const [e] = await ctx.db.select().from(queueEntries).where(and(eq(queueEntries.id, id), eq(queueEntries.merchantId, merchantId))).limit(1);
  if (!e) throw notFound("Place in line");
  return e;
}

async function present(ctx: AppContext, merchant: Merchant, e: Entry): Promise<barberApi.QueueEntryDto> {
  const s = await snapshot(ctx, merchant);
  const [fresh] = await ctx.db.select().from(queueEntries).where(eq(queueEntries.id, e.id)).limit(1);
  const idx = s.waiting.findIndex((w) => w.id === e.id);
  return dto(fresh ?? e, idx >= 0 ? idx + 1 : null, s.names, s.parents, ctx.now());
}

/** The barber calls for themselves; a manager can call for anyone. */
function assertMayAct(staff: StaffContext, staffId: string) {
  if (staff.role === "staff" && staff.user.id !== staffId) throw forbidden("You can call people to your own chair");
}

export async function addByStaff(ctx: AppContext, staff: StaffContext, body: z.output<typeof barberApi.staffAddBody>): Promise<barberApi.QueueActionResponse> {
  const r = await join(ctx, staff.merchant, { name: body.name, phone: body.phone, serviceId: body.serviceId, requestedStaffId: body.requestedStaffId, textConsent: body.textConsent, familyMemberIds: [], source: body.source }, null);
  const e = await entryOf(ctx, staff.merchant.id, r.entries[0]!.id);
  return { entry: await present(ctx, staff.merchant, e) };
}

export async function call(ctx: AppContext, staff: StaffContext, entryId: string, body: z.infer<typeof barberApi.callBody>): Promise<barberApi.QueueActionResponse> {
  const merchant = staff.merchant;
  assertMayAct(staff, body.staffId);
  const e = await entryOf(ctx, merchant.id, entryId);
  if (e.status !== "waiting" && e.status !== "called") throw conflict("This person is no longer waiting");
  const t = await team(ctx, merchant.id);
  const barber = t.find((b) => b.id === body.staffId);
  if (!barber) throw badRequest("Unknown barber");
  if (!barber.takesWalkIns) throw badRequest("This barber is not taking walk-ins");
  const [other] = await ctx.db.select({ id: queueEntries.id }).from(queueEntries).where(and(eq(queueEntries.merchantId, merchant.id), eq(queueEntries.status, "called"), eq(queueEntries.calledStaffId, body.staffId), ne(queueEntries.id, e.id))).limit(1);
  if (other) throw new HttpError(409, "already_called", "This barber already has someone on the way. Start or skip them first.");
  const now = ctx.now();
  const [row] = await ctx.db.update(queueEntries).set({ status: "called", calledAt: now, calledStaffId: body.staffId, updatedAt: now }).where(and(eq(queueEntries.id, e.id), inArray(queueEntries.status, ["waiting", "called"]))).returning();
  if (!row) throw conflict("This place in line was just updated. Refresh and try again.");
  await sendText(ctx, merchant, row, "called", { barber: barber.name });
  await notifyNext(ctx, merchant);
  return { entry: await present(ctx, merchant, row) };
}

/** The called person is in the chair: make the walk-in appointment (the existing calendar, checkout and tip take it from here). */
export async function start(ctx: AppContext, staff: StaffContext, entryId: string): Promise<barberApi.QueueActionResponse> {
  const merchant = staff.merchant;
  const e = await entryOf(ctx, merchant.id, entryId);
  if (e.status !== "called" && e.status !== "waiting") throw conflict("This person is not waiting");
  const staffId = e.calledStaffId ?? (staff.role === "staff" ? staff.user.id : null);
  if (!staffId) throw badRequest("Call the person to a barber first");
  assertMayAct(staff, staffId);
  const created = await createAppointment(ctx, staff, {
    staffId,
    requestedStaff: !!e.requestedStaffId,
    serviceIds: e.serviceId ? [e.serviceId] : [],
    items: e.serviceId ? [] : [{ serviceId: null, name: e.serviceName, durationMin: e.durationMin, priceCents: 0 }],
    source: "walk_in",
    customer: e.userId ? { userId: e.userId } : { name: e.name },
    force: false,
  } as never);
  const now = ctx.now();
  // A family member is the parent's customer record with the child's first name on the visit.
  if (e.familyMemberId || !e.userId) await ctx.db.update(appointments).set({ customerName: e.name, updatedAt: now }).where(eq(appointments.id, created.id));
  await setStatus(ctx, staff, created.id, { status: "in_service", chargeFee: false });
  const [row] = await ctx.db.update(queueEntries).set({ status: "in_service", startedAt: now, calledStaffId: staffId, appointmentId: created.id, updatedAt: now }).where(eq(queueEntries.id, e.id)).returning();
  await notifyNext(ctx, merchant);
  return { entry: await present(ctx, merchant, row!), appointmentId: created.id };
}

/** The state a skip changed, so Undo can put it back exactly (the response carries it; nothing is stored). */
function undoOf(e: Entry): barberApi.SkipUndo {
  return { status: e.status as "waiting" | "called", skips: e.skips, positionAt: e.positionAt.toISOString(), calledAt: e.calledAt ? e.calledAt.toISOString() : null, calledStaffId: e.calledStaffId, notifiedNextAt: e.notifiedNextAt ? e.notifiedNextAt.toISOString() : null };
}

/**
 * Skip is for someone who was called and did not answer: the first time the person goes back two places; the second time they are off the line.
 * Someone who was never called is not skipped (call them first, or remove them). The response says how to undo it.
 */
export async function skip(ctx: AppContext, staff: StaffContext, entryId: string): Promise<barberApi.QueueActionResponse> {
  const merchant = staff.merchant;
  const e = await entryOf(ctx, merchant.id, entryId);
  if (e.status !== "waiting" && e.status !== "called") throw conflict("This person is no longer waiting");
  if (e.status !== "called") throw conflict("Call them first. Skip is for someone who was called and did not answer; use Remove if they left.");
  if (e.calledStaffId) assertMayAct(staff, e.calledStaffId);
  const now = ctx.now();
  const undo = undoOf(e);
  if (e.skips >= 1) {
    const [row] = await ctx.db.update(queueEntries).set({ status: "no_show", finishedAt: now, updatedAt: now }).where(eq(queueEntries.id, e.id)).returning();
    await notifyNext(ctx, merchant);
    return { entry: await present(ctx, merchant, row!), undo };
  }
  const s = await snapshot(ctx, merchant);
  // A called person keeps the place they had in line (their position stays on the row), so "back two places" counts from there.
  const inLine = [...s.waiting.filter((w) => w.id !== e.id), e].sort((a, b) => a.positionAt.getTime() - b.positionAt.getTime() || a.joinedAt.getTime() - b.joinedAt.getTime());
  const rest = inLine.filter((w) => w.id !== e.id);
  const idx = inLine.findIndex((w) => w.id === e.id);
  const anchor = idx >= 0 ? rest[Math.min(rest.length - 1, idx + QUEUE_SKIP_BACK - 1)] : undefined;
  const positionAt = anchor && anchor.positionAt.getTime() > e.positionAt.getTime() ? new Date(anchor.positionAt.getTime() + 1) : await backOfLine(ctx, e.merchantId, now);
  const [row] = await ctx.db.update(queueEntries).set({ status: "waiting", skips: e.skips + 1, positionAt, calledAt: null, calledStaffId: null, notifiedNextAt: null, updatedAt: now }).where(eq(queueEntries.id, e.id)).returning();
  await sendText(ctx, merchant, row!, "skipped", {});
  await notifyNext(ctx, merchant);
  return { entry: await present(ctx, merchant, row!), undo };
}

/** Undo a skip within a minute: put the person back as they were (called, on the same barber, in the same place). */
export async function undoSkip(ctx: AppContext, staff: StaffContext, entryId: string, u: barberApi.SkipUndo): Promise<barberApi.QueueActionResponse> {
  const merchant = staff.merchant;
  const e = await entryOf(ctx, merchant.id, entryId);
  const now = ctx.now();
  if ((e.status !== "waiting" && e.status !== "no_show") || e.skips !== u.skips + (e.status === "no_show" ? 0 : 1) || now.getTime() - e.updatedAt.getTime() > 60_000) throw conflict("That skip can't be undone any more");
  const [row] = await ctx.db
    .update(queueEntries)
    .set({ status: u.status, skips: u.skips, positionAt: new Date(u.positionAt), calledAt: u.calledAt ? new Date(u.calledAt) : null, calledStaffId: u.calledStaffId, notifiedNextAt: u.notifiedNextAt ? new Date(u.notifiedNextAt) : null, finishedAt: null, updatedAt: now })
    .where(eq(queueEntries.id, e.id))
    .returning();
  return { entry: await present(ctx, merchant, row!) };
}

export async function remove(ctx: AppContext, staff: StaffContext, entryId: string, reason: "left" | "no_show" = "left"): Promise<barberApi.QueueActionResponse> {
  const merchant = staff.merchant;
  const e = await entryOf(ctx, merchant.id, entryId);
  if (e.status !== "waiting" && e.status !== "called") throw conflict("This person is no longer waiting");
  const now = ctx.now();
  const [row] = await ctx.db.update(queueEntries).set({ status: reason, finishedAt: now, updatedAt: now }).where(eq(queueEntries.id, e.id)).returning();
  await notifyNext(ctx, merchant);
  return { entry: await present(ctx, merchant, row!) };
}

/** Done at the chair. The visit is completed here; the barber takes payment and the tip in the calendar's checkout. */
export async function done(ctx: AppContext, staff: StaffContext, entryId: string): Promise<barberApi.QueueActionResponse> {
  const merchant = staff.merchant;
  const e = await entryOf(ctx, merchant.id, entryId);
  if (e.status !== "in_service") throw conflict("This person is not in the chair");
  if (e.calledStaffId) assertMayAct(staff, e.calledStaffId);
  const now = ctx.now();
  if (e.appointmentId) {
    const a = await getAppointment(ctx.db, merchant.id, e.appointmentId);
    if (a.status === "in_service" || a.status === "arrived") await setStatus(ctx, staff, a.id, { status: "completed", chargeFee: false });
  }
  const [row] = await ctx.db.update(queueEntries).set({ status: "done", finishedAt: now, updatedAt: now }).where(eq(queueEntries.id, e.id)).returning();
  await notifyNext(ctx, merchant);
  return { entry: await present(ctx, merchant, row!) };
}

// ---- texts
async function localeOf(ctx: AppContext, userId: string): Promise<Locale> {
  const [u] = await ctx.db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  return normalizeLocale(u?.locale) ?? "en";
}

async function sendText(ctx: AppContext, merchant: Merchant, e: Entry, kind: "next" | "called" | "skipped", vars: Record<string, string>): Promise<void> {
  if (!e.userId || !e.textConsent) return;
  const settings = await getSettings(ctx, merchant.id);
  if (kind === "next" && !settings.textNext) return;
  const t = translator(await localeOf(ctx, e.userId));
  const title = t(kind === "next" ? "q.msg.nextTitle" : kind === "called" ? "q.msg.calledTitle" : "q.msg.skippedTitle");
  const body = t(kind === "next" ? "q.msg.next" : kind === "called" ? "q.msg.called" : "q.msg.skipped", { shop: merchant.name, ...vars });
  await notifyCustomer(ctx, { userId: e.userId, merchantId: merchant.id, title, body, smsBody: `${body} ${t("bk.msg.stop")}`, data: { type: `queue_${kind}`, token: e.token } });
}

/** "You're next": one text to the first person in line who asked for it, once. Called after every change and by the sweep job. */
export async function notifyNext(ctx: AppContext, merchant: Merchant): Promise<number> {
  const [first] = await ctx.db.select().from(queueEntries).where(and(eq(queueEntries.merchantId, merchant.id), eq(queueEntries.status, "waiting"))).orderBy(asc(queueEntries.positionAt), asc(queueEntries.joinedAt), asc(queueEntries.id)).limit(1);
  if (!first || first.notifiedNextAt) return 0;
  const now = ctx.now();
  const [claimed] = await ctx.db.update(queueEntries).set({ notifiedNextAt: now }).where(and(eq(queueEntries.id, first.id), isNull(queueEntries.notifiedNextAt))).returning();
  if (!claimed) return 0;
  if (!claimed.textConsent) return 0;
  await sendText(ctx, merchant, claimed, "next", {});
  return 1;
}

/** Sweep: texts for anyone who became first without an event, and old entries (a line does not last past the day) are cleared. */
export async function sweep(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const stale = new Date(now.getTime() - 14 * 60 * MIN);
  const cleared = await ctx.db.update(queueEntries).set({ status: "left", finishedAt: now, updatedAt: now }).where(and(inArray(queueEntries.status, ["waiting", "called"]), lt(queueEntries.joinedAt, stale))).returning({ id: queueEntries.id });
  const open = await ctx.db.selectDistinct({ merchantId: queueEntries.merchantId }).from(queueEntries).where(eq(queueEntries.status, "waiting"));
  let sent = 0;
  for (const o of open) {
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, o.merchantId)).limit(1);
    if (m) sent += await notifyNext(ctx, m);
  }
  return cleared.length + sent;
}

// ---------------------------------------------------------------------------
// My barber
// ---------------------------------------------------------------------------
export async function getMyBarber(ctx: AppContext, userId: string, merchant: Merchant): Promise<barberApi.MyBarberResponse> {
  const [p] = await ctx.db.select().from(preferredStaff).where(and(eq(preferredStaff.userId, userId), eq(preferredStaff.merchantId, merchant.id))).limit(1);
  const t = await team(ctx, merchant.id);
  const barbers = t.filter((b) => b.takesWalkIns).map((b) => ({ id: b.id, name: b.name }));
  let visitsWith = 0;
  if (p?.staffId) {
    const [c] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(appointments).where(and(eq(appointments.merchantId, merchant.id), eq(appointments.userId, userId), eq(appointments.staffId, p.staffId), eq(appointments.status, "completed")));
    visitsWith = c?.n ?? 0;
  }
  return { staffId: p?.staffId ?? null, name: p?.staffId ? (t.find((b) => b.id === p.staffId)?.name ?? null) : null, source: (p?.source as "auto" | "chosen" | undefined) ?? null, visitsWith, barbers };
}

export async function setMyBarber(ctx: AppContext, userId: string, merchant: Merchant, staffId: string | null): Promise<barberApi.MyBarberResponse> {
  if (staffId) {
    const t = await team(ctx, merchant.id);
    if (!t.some((b) => b.id === staffId)) throw notFound("Barber");
  }
  const now = ctx.now();
  await ctx.db.insert(preferredStaff).values({ userId, merchantId: merchant.id, staffId, source: "chosen", updatedAt: now }).onConflictDoUpdate({ target: [preferredStaff.userId, preferredStaff.merchantId], set: { staffId, source: "chosen", updatedAt: now } });
  return getMyBarber(ctx, userId, merchant);
}

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------
const famDto = (f: typeof familyMembers.$inferSelect): barberApi.FamilyMemberDto => ({ id: f.id, firstName: f.firstName, consentAt: f.consentAt.toISOString() });

export async function listFamily(ctx: AppContext, userId: string): Promise<barberApi.FamilyResponse> {
  const rows = await ctx.db.select().from(familyMembers).where(eq(familyMembers.userId, userId)).orderBy(asc(familyMembers.createdAt));
  return { items: rows.map(famDto), max: QUEUE_MAX_FAMILY };
}

export async function addFamily(ctx: AppContext, userId: string, body: z.infer<typeof barberApi.familyBody>): Promise<barberApi.FamilyMemberDto> {
  const rows = await ctx.db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.userId, userId));
  if (rows.length >= QUEUE_MAX_FAMILY) throw new HttpError(409, "family_full", `You can add up to ${QUEUE_MAX_FAMILY} family members.`);
  const [f] = await ctx.db.insert(familyMembers).values({ userId, firstName: body.firstName.trim(), consentAt: ctx.now() }).returning();
  return famDto(f!);
}

/** Removing deletes the name, and the first name on past visits and lines is cleared. */
export async function removeFamily(ctx: AppContext, userId: string, id: string): Promise<void> {
  const [f] = await ctx.db.select().from(familyMembers).where(and(eq(familyMembers.id, id), eq(familyMembers.userId, userId))).limit(1);
  if (!f) throw notFound("Family member");
  await ctx.db.update(queueEntries).set({ name: "Family", updatedAt: ctx.now() }).where(eq(queueEntries.familyMemberId, id));
  await ctx.db.update(appointments).set({ customerName: "Family" }).where(and(eq(appointments.userId, userId), eq(appointments.customerName, f.firstName), sql`${appointments.id} in (select ${queueEntries.appointmentId} from ${queueEntries} where ${queueEntries.familyMemberId} = ${id})`));
  await ctx.db.delete(familyMembers).where(eq(familyMembers.id, id));
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------
export async function payouts(ctx: AppContext, staff: StaffContext, q: z.infer<typeof barberApi.payoutsQuery>, mineOnly: boolean): Promise<barberApi.PayoutsResponse> {
  const merchant = staff.merchant;
  const tz = merchant.timezone;
  const from = zonedToUtc(q.from, 0, tz);
  const to = zonedToUtc(addDays(q.to, 1), 0, tz);
  if (to <= from) throw badRequest("The end date must be on or after the start date");
  const days = Math.round((to.getTime() - from.getTime()) / (24 * 60 * MIN));
  if (days > 93) throw badRequest("Pick at most three months");
  const forceMine = mineOnly || staff.role === "staff";
  const t = await team(ctx, merchant.id);
  const pays = await ctx.db.select().from(staffPay).where(eq(staffPay.merchantId, merchant.id));
  const paid = await ctx.db
    .select({ subtotal: invoices.subtotalCents, tip: invoices.tipCents, tipStaffId: invoices.tipStaffId, staffId: appointments.staffId })
    .from(invoices)
    .innerJoin(appointments, eq(appointments.id, invoices.appointmentId))
    .where(and(eq(invoices.merchantId, merchant.id), eq(invoices.status, "paid"), gte(invoices.paidAt, from), lt(invoices.paidAt, to)));
  const rows: barberApi.PayoutRowDto[] = [];
  for (const b of t) {
    if (forceMine && b.id !== staff.user.id) continue;
    const p = pays.find((r) => r.userId === b.id);
    const model = (p?.model as barberApi.PayModel) ?? "employee";
    const mine = paid.filter((x) => x.staffId === b.id);
    const servicesCents = mine.reduce((n, x) => n + x.subtotal, 0);
    const tipsCents = paid.filter((x) => (x.tipStaffId ?? x.staffId) === b.id).reduce((n, x) => n + x.tip, 0);
    const bps = model === "commission" ? (p?.shopShareBps ?? 0) : 0;
    const rentCents = model === "chair_rent" ? Math.round(((p?.rentCentsWeek ?? 0) * days) / 7) : 0;
    // An employee's pay is outside the app: the shop keeps the services and the barber takes the tips.
    const shopKeepsCents = model === "employee" ? servicesCents : Math.round((servicesCents * bps) / 10_000);
    const takeHomeCents = model === "employee" ? tipsCents : servicesCents - shopKeepsCents - rentCents + tipsCents;
    if (!forceMine && !p && !mine.length && !tipsCents) continue;
    rows.push({ staffId: b.id, name: b.name, model, shopShareBps: bps, rentCentsWeek: p?.rentCentsWeek ?? 0, visits: mine.length, servicesCents, tipsCents, shopKeepsCents, rentCents, takeHomeCents });
  }
  const sum = (k: "visits" | "servicesCents" | "tipsCents" | "shopKeepsCents" | "rentCents" | "takeHomeCents") => rows.reduce((n, r) => n + r[k], 0);
  return { from: q.from, to: q.to, days, rows, totals: { visits: sum("visits"), servicesCents: sum("servicesCents"), tipsCents: sum("tipsCents"), shopKeepsCents: sum("shopKeepsCents"), rentCents: sum("rentCents"), takeHomeCents: sum("takeHomeCents") }, mine: forceMine };
}

export function payoutsCsv(r: barberApi.PayoutsResponse): string {
  const d = (c: number) => (c / 100).toFixed(2);
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : /^[=+\-@]/.test(s) ? `'${s}` : s);
  const head = "Barber,Model,Visits,Services,Tips,Shop keeps,Rent,Takes home";
  const lines = r.rows.map((x) => [esc(x.name), x.model === "chair_rent" ? "Chair rental" : x.model === "commission" ? `Commission ${x.shopShareBps / 100}%` : "Employee", x.visits, d(x.servicesCents), d(x.tipsCents), d(x.shopKeepsCents), d(x.rentCents), d(x.takeHomeCents)].join(","));
  return [`Payouts ${r.from} to ${r.to}`, head, ...lines, ["Total", "", r.totals.visits, d(r.totals.servicesCents), d(r.totals.tipsCents), d(r.totals.shopKeepsCents), d(r.totals.rentCents), d(r.totals.takeHomeCents)].join(",")].join("\n") + "\n";
}
