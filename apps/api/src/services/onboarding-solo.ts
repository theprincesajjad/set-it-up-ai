/**
 * Solo-pro and appointment-led setup (docs/design/onboarding-v1.md §3.3, §3.5, §4; phase-solo workstream B).
 *
 * Six cards that get a booking link live in under three minutes: your_link → services → hours → privacy → share → invite
 * (an appointment-led storefront has `staff` in place of `privacy`). Nothing blocks the link: services come from the trade's
 * list, hours from a default, privacy from the signup answer. The link is live once it can take a booking (a service and
 * someone with hours), recorded as the `booking_link_live` milestone; time to value is signed_up → booking_link_live.
 *
 * The rules are pure in @ll/shared (onboarding.ts, address-privacy.ts); this file reads and writes the database.
 */
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { appointments, locations, merchantStaff, merchants, pushTokens, services, staffHours, users, type DbOrTx } from "@ll/db";
import {
  APPOINTMENT_LATER_STEPS,
  APPOINTMENT_STEPS,
  BOOKINGS_ACTIVATION,
  BRAND,
  SERVICE_STARTERS,
  SOLO_LATER_STEPS,
  SOLO_NUDGE_RULES,
  SOLO_STEPS,
  addressVisibilityOf,
  bookingLinkLive,
  daysSince,
  dueSoloNudge,
  handleToSlug,
  instagramHandle,
  normalizePostal,
  onboardingPath,
  slugProblem,
  soloNextMove,
  soloNudgeText,
  t,
  workSettingOf,
  type Locale,
  type MessageKey,
  type OnboardingPath,
  type merchantApi,
} from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { isOptedOut, sendSms } from "./opt-out.js";

type Merchant = typeof merchants.$inferSelect;
type Location = typeof locations.$inferSelect;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Tuesday to Saturday, 10 to 6: "Use these defaults" on the hours card. */
export const DEFAULT_SOLO_HOURS: { weekday: number; startsLocal: string; endsLocal: string }[] = [2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsLocal: "10:00", endsLocal: "18:00" }));

const STEP_LABEL: Record<string, MessageKey> = {
  your_link: "ob.solo.step.your_link",
  services: "ob.solo.step.services",
  hours: "ob.solo.step.hours",
  privacy: "ob.solo.step.privacy",
  share: "ob.solo.step.share",
  invite: "ob.solo.step.invite",
  staff: "ob.solo.step.staff",
  profile: "ob.solo.step.profile",
  loyalty: "ob.solo.step.loyalty",
  instagram_connect: "ob.solo.step.instagram_connect",
  site: "ob.solo.step.site",
  promos: "ob.solo.step.promos",
  pos: "ob.step.pos",
};

export const pathOf = (m: Pick<Merchant, "vertical" | "workSetting">): OnboardingPath => onboardingPath(m.vertical, m.workSetting);

async function primaryLocation(db: DbOrTx, merchantId: string): Promise<Location | null> {
  const [l] = await db.select().from(locations).where(eq(locations.merchantId, merchantId)).orderBy(asc(locations.createdAt), asc(locations.id)).limit(1);
  return l ?? null;
}

async function ownerId(db: DbOrTx, merchantId: string): Promise<string | null> {
  const [o] = await db.select({ userId: merchantStaff.userId }).from(merchantStaff).where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.role, "owner"))).orderBy(asc(merchantStaff.createdAt)).limit(1);
  return o?.userId ?? null;
}

/** Online bookings by someone who is not on the shop's own staff (the owner testing her link does not count). */
export async function bookingsByOthers(db: DbOrTx, merchantId: string): Promise<{ count: number; bySource: Map<string, number> }> {
  const staff = (await db.select({ userId: merchantStaff.userId }).from(merchantStaff).where(eq(merchantStaff.merchantId, merchantId))).map((r) => r.userId);
  const rows = await db
    .select({ source: appointments.source, n: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.merchantId, merchantId),
        inArray(appointments.source, ["online", "instagram"]),
        ne(appointments.status, "cancelled"),
        sql`${appointments.holdExpiresAt} is null`,
        staff.length ? sql`(${appointments.userId} is null or ${appointments.userId} not in (${sql.join(staff.map((s) => sql`${s}::uuid`), sql`, `)}))` : sql`true`,
      ),
    )
    .groupBy(appointments.source);
  const bySource = new Map(rows.map((r) => [r.source, Number(r.n)]));
  return { count: [...bySource.values()].reduce((a, b) => a + b, 0), bySource };
}

export interface SoloSetup {
  steps: merchantApi.OnboardingStep[];
  later: merchantApi.OnboardingStep[];
  dto: merchantApi.SoloSetupDto;
}

/**
 * The solo cards for the checklist, and the milestones they imply (recorded here, so the polling setup page records the
 * moment the link goes live). `marked` is the set of steps ticked by hand; `ms` the shop's milestones.
 */
export async function soloSetup(ctx: AppContext, m: Merchant, locale: Locale, marked: Set<string | undefined>, ms: Map<string, Date>, record: (key: "booking_link_live" | "first_online_booking" | "five_bookings" | "ten_bookings", data?: Record<string, unknown>) => Promise<boolean>): Promise<SoloSetup> {
  const path = pathOf(m);
  const db = ctx.db;
  const [loc, owner, svcRows, hourRows, [staffRow], booked] = await Promise.all([
    primaryLocation(db, m.id),
    ownerId(db, m.id),
    db.select().from(services).where(and(eq(services.merchantId, m.id), eq(services.kind, "appointment"), eq(services.active, true))).orderBy(asc(services.sort), asc(services.name)),
    db.select().from(staffHours).where(eq(staffHours.merchantId, m.id)).orderBy(asc(staffHours.weekday), asc(staffHours.startsLocal)),
    db.select({ n: count() }).from(merchantStaff).where(eq(merchantStaff.merchantId, m.id)),
    bookingsByOthers(db, m.id),
  ]);
  const staffWithHours = new Set(hourRows.map((h) => h.userId)).size;
  const live = bookingLinkLive({ services: svcRows.length, staffWithHours });
  const now = ctx.now();
  if (live && !ms.has("booking_link_live")) {
    const seconds = Math.max(0, Math.round((now.getTime() - m.createdAt.getTime()) / 1000));
    if (await record("booking_link_live", { seconds })) ms.set("booking_link_live", now);
  }
  const n = booked.count;
  for (const [key, at] of [["first_online_booking", 1], ["five_bookings", 5], ["ten_bookings", 10]] as const) if (n >= at && !ms.has(key) && (await record(key, { bookings: n }))) ms.set(key, now);

  const done: Record<string, boolean> = {
    your_link: marked.has("your_link"),
    services: svcRows.length > 0 || marked.has("services"),
    staff: Number(staffRow?.n ?? 0) > 1 || marked.has("staff") || ms.has("staff_added"),
    hours: staffWithHours > 0 || marked.has("hours"),
    privacy: marked.has("privacy"),
    share: ms.has("first_share") || marked.has("share"),
    invite: marked.has("invite"),
    profile: (!!m.description && !!m.logoUrl) || marked.has("profile"),
    loyalty: marked.has("loyalty"),
    instagram_connect: ms.has("instagram_connected") || marked.has("instagram_connect"),
    site: ms.has("site_published") || marked.has("site"),
    promos: ms.has("first_promo_sent") || marked.has("promos"),
    pos: marked.has("pos") || ms.has("pos_connected"),
  };
  const detail = (key: string): string | null =>
    key === "services" && svcRows.length ? t(locale, "ob.solo.detail.services", { n: svcRows.length }) : key === "share" && !done.share && live ? t(locale, "ob.solo.detail.live") : null;
  const mk = (key: string): merchantApi.OnboardingStep => ({ key: key as merchantApi.OnboardingStepKey, label: t(locale, STEP_LABEL[key]!), done: !!done[key], detail: detail(key) });
  const steps = (path === "appointment" ? APPOINTMENT_STEPS : SOLO_STEPS).map(mk);
  const later = (path === "appointment" ? APPOINTMENT_LATER_STEPS : SOLO_LATER_STEPS).map(mk);

  const web = ctx.config.publicWebUrl.replace(/\/$/, "");
  const starters = SERVICE_STARTERS[m.vertical as keyof typeof SERVICE_STARTERS] ?? [];
  const day = daysSince(m.createdAt, now);
  const depositOn = svcRows.some((s) => s.depositCents > 0);
  const liveAt = ms.get("booking_link_live") ?? null;
  const SRC: Record<string, merchantApi.SoloBookingsDto["sources"][number]["source"]> = { instagram: "instagram", online: "other" };
  const dto: merchantApi.SoloSetupDto = {
    slug: m.slug,
    bookingUrl: `${web}/shops/${m.slug}/book`,
    displayLink: `${web.replace(/^https?:\/\//, "")}/${m.slug}`,
    instagram: m.instagram,
    workSetting: workSettingOf(m.workSetting),
    addressVisibility: addressVisibilityOf(loc?.addressVisibility),
    areaLabel: loc?.areaLabel ?? null,
    city: loc?.city ?? "Toronto",
    postalCode: loc?.postalCode ?? null,
    hasStreetAddress: !!loc?.address.trim(),
    serviceRadiusKm: m.serviceRadiusKm ?? null,
    starters: starters.map((s) => ({ name: s.name, durationMin: s.durationMin, priceCents: s.priceCents, depositCents: s.depositCents ?? 0 })),
    services: svcRows.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, priceCents: s.priceCents, depositCents: s.depositCents })),
    hours: hourRows.filter((h) => !owner || h.userId === owner).map((h) => ({ weekday: h.weekday, startsLocal: h.startsLocal.slice(0, 5), endsLocal: h.endsLocal.slice(0, 5) })),
    ownerUserId: owner,
    live,
    liveAt: iso(liveAt),
    secondsToLive: liveAt ? Math.max(0, Math.round((liveAt.getTime() - m.createdAt.getTime()) / 1000)) : null,
    bookings: {
      count: n,
      target: BOOKINGS_ACTIVATION.target,
      day,
      windowDays: BOOKINGS_ACTIVATION.windowDays,
      paceBookings: BOOKINGS_ACTIVATION.paceBookings,
      paceByDay: BOOKINGS_ACTIVATION.paceByDay,
      onTrack: day < BOOKINGS_ACTIVATION.paceByDay ? true : n >= Math.min(BOOKINGS_ACTIVATION.target, Math.ceil((BOOKINGS_ACTIVATION.paceBookings * day) / BOOKINGS_ACTIVATION.paceByDay)),
      milestones: (["booking_link_live", "first_share", "first_online_booking", "ten_bookings"] as const).map((key) => ({ key, at: iso(ms.get(key)) })),
      nextMove: soloNextMove({ shared: done.share!, invited: done.invite!, bookings: n, depositOn }),
      sources: [...booked.bySource.entries()].map(([s, c]) => ({ source: SRC[s] ?? "other", count: c })),
      depositOn,
    },
  };
  return { steps, later, dto };
}

// ---------------------------------------------------------------------------
// The cards' saves
// ---------------------------------------------------------------------------
async function mark(ctx: AppContext, merchantId: string, actorUserId: string, step: string, data: Record<string, unknown> = {}) {
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "onboarding.step_completed", entity: "merchant", entityId: merchantId, data: { step, ...data } });
}

async function loadMerchant(db: DbOrTx, merchantId: string): Promise<Merchant> {
  const [m] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  return m;
}

/** Card 1: the link. The slug is the part after localloyalty.ca/; the Instagram handle is matched and kept for the Message button. */
export async function saveLink(ctx: AppContext, merchantId: string, actorUserId: string, body: z.output<typeof merchantApi.soloLinkBody>) {
  const m = await loadMerchant(ctx.db, merchantId);
  const slug = body.slug.trim().toLowerCase();
  const problem = slugProblem(slug);
  if (problem === "format") throw badRequest("Use 3 to 40 letters, numbers and dashes.");
  if (problem === "reserved") throw conflict("That name is taken. Try another.");
  if (slug !== m.slug) {
    const [hit] = await ctx.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, slug)).limit(1);
    if (hit) throw conflict("That name is taken. Try another.");
  }
  const handle = body.instagram === undefined ? undefined : body.instagram === null || body.instagram === "" ? null : instagramHandle(body.instagram);
  if (body.instagram && !handle) throw badRequest("That doesn't look like an Instagram handle.");
  await ctx.db.update(merchants).set({ slug, ...(handle !== undefined ? { instagram: handle } : {}), updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
  await mark(ctx, merchantId, actorUserId, "your_link", { slugChanged: slug !== m.slug });
}

/** Is a slug free? The card checks as the pro types; a handle is offered as the slug when it is free. */
export async function slugAvailable(ctx: AppContext, merchantId: string, raw: string): Promise<{ slug: string; available: boolean; suggestion: string | null }> {
  const handle = instagramHandle(raw);
  const slug = (handle ? handleToSlug(handle) : raw).trim().toLowerCase();
  if (slugProblem(slug)) return { slug, available: false, suggestion: null };
  const [hit] = await ctx.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, slug)).limit(1);
  if (!hit || hit.id === merchantId) return { slug, available: true, suggestion: null };
  for (let i = 2; i < 10; i++) {
    const s = `${slug}-${i}`.slice(0, 40);
    const [taken] = await ctx.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, s)).limit(1);
    if (!taken) return { slug, available: false, suggestion: s };
  }
  return { slug, available: false, suggestion: null };
}

/** Card 2: the ticked services. Known names are updated in place, new ones created; nothing is deleted. */
export async function saveServices(ctx: AppContext, merchantId: string, actorUserId: string, body: z.output<typeof merchantApi.soloServicesBody>) {
  const m = await loadMerchant(ctx.db, merchantId);
  const starters = SERVICE_STARTERS[m.vertical as keyof typeof SERVICE_STARTERS] ?? [];
  await ctx.db.transaction(async (tx) => {
    const have = await tx.select().from(services).where(and(eq(services.merchantId, merchantId), eq(services.kind, "appointment")));
    const byName = new Map(have.map((s) => [s.name.toLowerCase(), s]));
    let sort = have.length;
    for (const it of body.items) {
      const hit = byName.get(it.name.toLowerCase());
      if (hit) {
        await tx.update(services).set({ durationMin: it.durationMin, priceCents: it.priceCents, depositCents: it.depositCents, active: true, updatedAt: ctx.now() }).where(eq(services.id, hit.id));
        continue;
      }
      const starter = starters.find((s) => s.name.toLowerCase() === it.name.toLowerCase());
      await tx.insert(services).values({ merchantId, kind: "appointment", name: it.name, durationMin: it.durationMin, priceCents: it.priceCents, depositCents: it.depositCents, rebookAfterDays: starter?.rebookAfterDays ?? null, priceFrom: starter?.priceFrom ?? false, sort: sort++ });
    }
  });
  await mark(ctx, merchantId, actorUserId, "services", { count: body.items.length });
}

/** Card 3: the owner's week. An empty list takes the defaults (Tue to Sat, 10 to 6). The shop's opening hours follow. */
export async function saveHours(ctx: AppContext, merchantId: string, actorUserId: string, body: z.output<typeof merchantApi.soloHoursBody>) {
  const m = await loadMerchant(ctx.db, merchantId);
  const owner = (await ownerId(ctx.db, merchantId)) ?? actorUserId;
  const days = body.days.length ? body.days : DEFAULT_SOLO_HOURS;
  for (const d of days) if (d.endsLocal <= d.startsLocal) throw badRequest("A day must end after it starts.");
  // Loaded on use: onboarding.ts is imported by the ledger, and these modules import it back.
  const { putStaffHours } = await import("./appointments.js");
  await putStaffHours(ctx.db, m, owner, { days });
  const KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const hours: merchantApi.Hours = {};
  for (const d of days) (hours[KEYS[d.weekday]!] ??= []).push([d.startsLocal, d.endsLocal]);
  const loc = await primaryLocation(ctx.db, merchantId);
  if (loc) await ctx.db.update(locations).set({ hours }).where(eq(locations.id, loc.id));
  await mark(ctx, merchantId, actorUserId, "hours", { defaults: !body.days.length });
}

/**
 * Card 4: the address. A home studio picks area or city and may add the private street address (sent only to a confirmed
 * booking); a travelling pro picks a radius; a storefront stays exact. The public pin is recomputed from the postal code.
 */
export async function savePrivacy(ctx: AppContext, merchantId: string, actorUserId: string, body: z.output<typeof merchantApi.soloPrivacyBody>) {
  const m = await loadMerchant(ctx.db, merchantId);
  const loc = await primaryLocation(ctx.db, merchantId);
  if (!loc) throw notFound("Location");
  const work = workSettingOf(m.workSetting);
  // Only a storefront can be exact; a home studio cannot publish its street by accident from this card.
  const visibility = work === "shop" ? body.visibility : body.visibility === "exact" ? "area" : body.visibility;
  const postal = body.postalCode !== undefined ? (body.postalCode ? (normalizePostal(body.postalCode) ?? body.postalCode.trim()) : null) : loc.postalCode;
  const set: Partial<typeof locations.$inferInsert> = { addressVisibility: visibility, postalCode: postal };
  if (body.address !== undefined) set.address = body.address?.trim() ?? "";
  if (visibility === "exact") Object.assign(set, { mapLat: null, mapLng: null, areaLabel: null });
  else {
    const { placePrivateShop } = await import("./geocode.js");
    const place = await placePrivateShop(ctx, { merchantId, visibility, postalCode: postal, city: loc.city });
    Object.assign(set, { mapLat: place.mapLat, mapLng: place.mapLng, areaLabel: place.areaLabel });
    if (!m.neighbourhoodId && place.neighbourhoodId) await ctx.db.update(merchants).set({ neighbourhoodId: place.neighbourhoodId }).where(eq(merchants.id, merchantId));
  }
  await ctx.db.update(locations).set(set).where(eq(locations.id, loc.id));
  if (work === "mobile" && body.serviceRadiusKm) await ctx.db.update(merchants).set({ serviceRadiusKm: body.serviceRadiusKm, updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
  // The address itself is never written to the audit log.
  await mark(ctx, merchantId, actorUserId, "privacy", { visibility, addressAdded: !!body.address });
}

/** Card 5: shared (copied the link, opened the bio steps, texted it, downloaded the QR). */
export async function recordShare(ctx: AppContext, merchantId: string, actorUserId: string, channel: string, recordMilestone: (key: "first_share", data: Record<string, unknown>) => Promise<boolean>) {
  await recordMilestone("first_share", { channel });
  await mark(ctx, merchantId, actorUserId, "share", { channel });
}

/** Card 6: pasted numbers become client records (no message is sent by us; the pro texts from her own phone). */
export async function saveInvite(ctx: AppContext, merchantId: string, actorUserId: string, body: z.output<typeof merchantApi.soloInviteBody>): Promise<{ created: number; errors: number }> {
  let created = 0;
  let errors = 0;
  if (body.people.length) {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["phone,name", ...body.people.map((p) => `${esc(p.phone)},${esc(p.name ?? "")}`)].join("\n");
    const { importCustomersCsv } = await import("./merchant-customers.js");
    const r = await importCustomersCsv(ctx, merchantId, actorUserId, { csv, dryRun: false, sourceName: "setup invite" });
    created = r.membersCreated;
    errors = r.errors.length;
  }
  await mark(ctx, merchantId, actorUserId, "invite", { people: body.people.length });
  return { created, errors };
}

export async function completeSoloStep(ctx: AppContext, merchantId: string, actorUserId: string, step: string) {
  await mark(ctx, merchantId, actorUserId, step);
}

// ---------------------------------------------------------------------------
// Nudges: app push first (the owner's devices), text second, same stop link
// ---------------------------------------------------------------------------
/**
 * The solo sequence (onboarding-v1.md §4). Called from runOnboardingNudges for shops on the solo or appointment path. Returns
 * true when a nudge went out.
 */
export async function sendSoloNudge(
  ctx: AppContext,
  m: Merchant,
  ms: Map<string, Date>,
  owner: { userId: string; phone: string | null; email: string | null; locale: Locale },
  stopUrl: string,
  recordMilestone: (key: string, data: Record<string, unknown>) => Promise<boolean>,
): Promise<boolean> {
  const now = ctx.now();
  const { count: bookings } = await bookingsByOthers(ctx.db, m.id);
  const sent = new Set([...ms.keys()].filter((k) => k.startsWith("solo_")));
  const state = { shared: ms.has("first_share"), bookings, paying: m.plan !== "free", annual: !!(m as { annualSiteEntitled?: boolean }).annualSiteEntitled };
  const hoursSince = (now.getTime() - m.createdAt.getTime()) / 3_600_000;
  const key = dueSoloNudge({ ...state, hoursSinceSignup: hoursSince, sent });
  if (!key) return false;
  if (!(await recordMilestone(key, { bookings }))) return false;
  // Earlier ones that are now moot are marked sent, so a late shop gets one message, not a pile.
  const at = SOLO_NUDGE_RULES.find((r) => r.key === key)!.afterHours;
  for (const r of SOLO_NUDGE_RULES) if (r.key !== key && !sent.has(r.key) && r.afterHours < at && hoursSince >= r.afterHours) await recordMilestone(r.key, { skipped: true });
  const web = ctx.config.publicWebUrl.replace(/\/$/, "");
  const text = soloNudgeText(key, { shopName: m.name, link: `${web}/shops/${m.slug}/book`, url: `${web}/m/${m.id}/setup`, season: seasonFor(now) }, owner.locale);
  const tokens = await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, owner.userId));
  if (tokens.length) {
    try {
      const r = await ctx.providers.push.send(tokens.map((x) => ({ token: x.token, title: text.title, body: text.body, data: { type: "onboarding_nudge", key, url: `/m/${m.id}/setup` }, priority: "normal" as const })));
      if (r.ok > 0) return true;
    } catch (err) {
      console.error("[onboarding.solo_nudge.push]", m.id, err);
    }
  }
  const smsTo = owner.phone ?? m.phone;
  try {
    if (smsTo && !(await isOptedOut(ctx.db, smsTo, "sms"))) await sendSms(ctx, smsTo, `${BRAND.name}: ${text.body}\n${t(owner.locale, "ob.smsFoot", { stop: t(owner.locale, "ob.stopLine"), url: stopUrl })}`);
    else if (owner.email) await ctx.providers.email.send({ to: owner.email, subject: text.title, text: `${text.body}\n\n--\n${t(owner.locale, "ob.emailFoot", { brand: BRAND.name, url: stopUrl })}`, headers: { "List-Unsubscribe": `<${stopUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    else return false;
  } catch (err) {
    console.error("[onboarding.solo_nudge]", m.id, err);
    return false;
  }
  return true;
}

/** The season a day-14 promo nudge names. */
function seasonFor(at: Date): string {
  const mo = at.getUTCMonth();
  return mo === 1 ? "Valentine's" : mo >= 2 && mo <= 4 ? "spring" : mo >= 5 && mo <= 7 ? "summer" : mo === 8 ? "back to school" : mo === 9 ? "fall" : "the holidays";
}

export const soloOwner = async (db: DbOrTx, merchantId: string) => {
  const [o] = await db
    .select({ userId: users.id, phone: users.phone, email: users.email, locale: users.locale })
    .from(merchantStaff)
    .innerJoin(users, eq(users.id, merchantStaff.userId))
    .where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.role, "owner")))
    .orderBy(merchantStaff.createdAt)
    .limit(1);
  return o ?? null;
};
