/**
 * Pet care (docs/research/pet-care.md): pets under their owner, vaccine proof, groom cadence and reminders, report cards.
 * Daycare lives in pet-daycare.ts and food cards in pet-food.ts.
 *
 * A pet belongs to its owner (a user) and follows them across shops; a shop sees only pets of its own members. What a shop
 * knows about a pet (cadence, handling note, temperament check) is in pet_shop. We keep no vet records, no diagnoses and no
 * door or key information. A groom report card is also the "last groom" the cadence counts from.
 */
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { appointments, merchantMembers, merchants as merchantsTable, messageDeliveries, petNudges, petSettings, petShop, petVaccines, petVisits, pets, users } from "@ll/db";
import {
  GROOM_WEEKS_MAX,
  MAX_PETS_PER_OWNER,
  defaultGroomWeeks,
  groomDueOn,
  groomState,
  formatDate,
  normalizeLocale,
  translator,
  vaccineStatus,
  petApi,
  type Locale,
} from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { AuthUser, StaffContext } from "../lib/auth.js";
import { randomToken } from "../lib/crypto.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { isFeatureOn } from "./features.js";
import { UPLOAD_PATH, getStorage, storageKeyFromUrl, toStoredUploadUrl, uploadSigner } from "../providers/storage.js";
import { localDate, reserveSmsCredits } from "./messaging.js";
import { inQuietHours } from "./notifications.js";
import { isSuppressed, optedOutSet, sendSms } from "./opt-out.js";
type Merchant = typeof merchantsTable.$inferSelect;
type PetRow = typeof pets.$inferSelect;
type VaccineRow = typeof petVaccines.$inferSelect;
const DAY_MS = 86_400_000;
export const REPORT_DAYS = 30;

// ---------------------------------------------------------------------------
// Proof photos
// ---------------------------------------------------------------------------
/** The permanent path of an upload. The key must start with one of `namespaces` (the owner's id or the shop's id): another account's key would get a valid link. */
export function storeProof(ctx: AppContext, url: string | null | undefined, namespaces: string[]): string | null {
  if (!url) return null;
  const stored = toStoredUploadUrl(url, ctx.config.publicApiUrl);
  const key = storageKeyFromUrl(stored);
  if (!key) throw badRequest("Upload the photo with the upload button, not a link.");
  if (!namespaces.some((n) => key.startsWith(`${n}/`))) throw badRequest("That photo belongs to another account.");
  return `${UPLOAD_PATH}${key}`;
}

async function deleteProofs(ctx: AppContext, urls: (string | null)[]): Promise<void> {
  const storage = getStorage(ctx);
  for (const u of urls) {
    const key = u ? storageKeyFromUrl(u) : null;
    if (key) await storage.delete?.(key).catch(() => false);
  }
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
async function vaccinesByPet(ctx: AppContext, petIds: string[]): Promise<Map<string, VaccineRow[]>> {
  const out = new Map<string, VaccineRow[]>();
  if (!petIds.length) return out;
  const rows = await ctx.db.select().from(petVaccines).where(inArray(petVaccines.petId, petIds)).orderBy(asc(petVaccines.kind));
  for (const r of rows) out.set(r.petId, [...(out.get(r.petId) ?? []), r]);
  return out;
}

function vaccineDto(v: VaccineRow, today: string, sign: (u: string) => string): petApi.VaccineDto {
  const s = vaccineStatus(v.expiresOn, today);
  return { kind: v.kind, expiresOn: v.expiresOn, status: s.status, daysLeft: s.daysLeft, proofUrl: v.proofUrl ? sign(v.proofUrl) : null };
}

function petDto(p: PetRow, ownerName: string | null, vax: VaccineRow[], today: string, sign: (u: string) => string): petApi.PetDto {
  return { id: p.id, name: p.name, species: p.species, breed: p.breed, sizeBand: p.sizeBand, coat: p.coat, ownerId: p.userId, ownerName, vaccines: vax.map((v) => vaccineDto(v, today, sign)) };
}

const todayFor = (ctx: AppContext, tz: string) => localDate(ctx.now(), tz);
const DEFAULT_TZ = "America/Toronto";

// ---------------------------------------------------------------------------
// The owner's side
// ---------------------------------------------------------------------------
export async function listMyPets(ctx: AppContext, user: AuthUser): Promise<{ items: petApi.PetDto[]; nextGroom: Record<string, { shop: string; on: string }> }> {
  const rows = await ctx.db.select().from(pets).where(eq(pets.userId, user.id)).orderBy(asc(pets.createdAt));
  const vax = await vaccinesByPet(ctx, rows.map((r) => r.id));
  const sign = uploadSigner(ctx);
  const today = todayFor(ctx, DEFAULT_TZ);
  const [me] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, user.id)).limit(1);
  // The next groom the shop expects, per pet (the shop that groomed it last).
  const nextGroom: Record<string, { shop: string; on: string }> = {};
  if (rows.length) {
    const visits = await ctx.db.execute(sql`
      select distinct on (v.pet_id) v.pet_id, v.at, m.name as shop, m.timezone, ps.groom_every_weeks, p.coat
      from pet_visits v join merchants m on m.id = v.merchant_id join pets p on p.id = v.pet_id
      left join pet_shop ps on ps.merchant_id = v.merchant_id and ps.pet_id = v.pet_id
      where v.kind = 'groom' and v.pet_id in (${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)})
      order by v.pet_id, v.at desc`);
    const list = ((visits as unknown as { rows?: unknown[] }).rows ?? (visits as unknown as unknown[])) as { pet_id: string; at: Date | string; shop: string; timezone: string; groom_every_weeks: number | null; coat: string }[];
    for (const r of list) nextGroom[r.pet_id] = { shop: r.shop, on: groomDueOn(localDate(new Date(r.at), r.timezone), r.groom_every_weeks ?? defaultGroomWeeks(r.coat)) };
  }
  return { items: rows.map((r) => petDto(r, me?.name ?? null, vax.get(r.id) ?? [], today, sign)), nextGroom };
}

export async function createMyPet(ctx: AppContext, user: AuthUser, body: z.output<typeof petApi.petBody>): Promise<petApi.PetDto> {
  return createPetFor(ctx, user.id, body);
}

async function createPetFor(ctx: AppContext, ownerId: string, body: z.output<typeof petApi.petBody>): Promise<petApi.PetDto> {
  const [n] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(pets).where(eq(pets.userId, ownerId));
  if ((n?.n ?? 0) >= MAX_PETS_PER_OWNER) throw conflict(`Up to ${MAX_PETS_PER_OWNER} pets per owner.`);
  const [row] = await ctx.db.insert(pets).values({ userId: ownerId, name: body.name, species: body.species, breed: body.breed?.trim() || null, sizeBand: body.sizeBand, coat: body.coat }).returning();
  const [o] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, ownerId)).limit(1);
  return petDto(row!, o?.name ?? null, [], todayFor(ctx, DEFAULT_TZ), uploadSigner(ctx));
}

async function ownedPet(ctx: AppContext, userId: string, petId: string): Promise<PetRow> {
  const [p] = await ctx.db.select().from(pets).where(and(eq(pets.id, petId), eq(pets.userId, userId))).limit(1);
  if (!p) throw notFound("Pet");
  return p;
}

export async function updateMyPet(ctx: AppContext, user: AuthUser, petId: string, body: z.output<typeof petApi.updatePetBody>): Promise<{ ok: true }> {
  await ownedPet(ctx, user.id, petId);
  const patch: Partial<typeof pets.$inferInsert> = { updatedAt: ctx.now() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.species !== undefined) patch.species = body.species;
  if (body.breed !== undefined) patch.breed = body.breed?.trim() || null;
  if (body.sizeBand !== undefined) patch.sizeBand = body.sizeBand;
  if (body.coat !== undefined) patch.coat = body.coat;
  await ctx.db.update(pets).set(patch).where(eq(pets.id, petId));
  return { ok: true };
}

/** The pet, its vaccines and the proof photos go with it. */
export async function deleteMyPet(ctx: AppContext, user: AuthUser, petId: string): Promise<{ ok: true }> {
  await ownedPet(ctx, user.id, petId);
  const vax = await ctx.db.select({ proof: petVaccines.proofUrl }).from(petVaccines).where(eq(petVaccines.petId, petId));
  const visits = await ctx.db.select({ photo: petVisits.photoUrl }).from(petVisits).where(eq(petVisits.petId, petId));
  await ctx.db.delete(pets).where(eq(pets.id, petId));
  await deleteProofs(ctx, [...vax.map((v) => v.proof), ...visits.map((v) => v.photo)]);
  return { ok: true };
}

async function putVaccine(ctx: AppContext, pet: PetRow, kind: string, expiresOn: string, proofUrl: string | null | undefined, namespaces: string[]): Promise<petApi.VaccineDto> {
  const [cur] = await ctx.db.select().from(petVaccines).where(and(eq(petVaccines.petId, pet.id), eq(petVaccines.kind, kind))).limit(1);
  // proofUrl undefined keeps the photo on file; null removes it.
  const proof = proofUrl === undefined ? (cur?.proofUrl ?? null) : storeProof(ctx, proofUrl, namespaces);
  const now = ctx.now();
  const [row] = await ctx.db
    .insert(petVaccines)
    .values({ petId: pet.id, kind, expiresOn, proofUrl: proof, updatedAt: now })
    .onConflictDoUpdate({ target: [petVaccines.petId, petVaccines.kind], set: { expiresOn, proofUrl: proof, updatedAt: now } })
    .returning();
  if (cur?.proofUrl && cur.proofUrl !== proof) await deleteProofs(ctx, [cur.proofUrl]);
  return vaccineDto(row!, todayFor(ctx, DEFAULT_TZ), uploadSigner(ctx));
}

export async function setMyVaccine(ctx: AppContext, user: AuthUser, petId: string, kind: string, body: z.output<typeof petApi.vaccineBody>): Promise<petApi.VaccineDto> {
  const pet = await ownedPet(ctx, user.id, petId);
  return putVaccine(ctx, pet, kind, body.expiresOn, body.proofUrl, [user.id]);
}

// ---------------------------------------------------------------------------
// The shop's side
// ---------------------------------------------------------------------------
/** A pet the shop may see: its owner is a member of the shop. */
async function shopPet(ctx: AppContext, merchant: Merchant, petId: string): Promise<{ pet: PetRow; ownerName: string | null; ownerPhone: string | null; ownerLocale: string | null; member: typeof merchantMembers.$inferSelect }> {
  const [r] = await ctx.db
    .select({ pet: pets, name: users.name, phone: users.phone, locale: users.locale, member: merchantMembers })
    .from(pets)
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, pets.userId), eq(merchantMembers.merchantId, merchant.id)))
    .innerJoin(users, eq(users.id, pets.userId))
    .where(eq(pets.id, petId))
    .limit(1);
  if (!r) throw notFound("Pet");
  return { pet: r.pet, ownerName: r.name, ownerPhone: r.phone, ownerLocale: r.locale, member: r.member };
}
export { shopPet };

export async function listPets(ctx: AppContext, merchant: Merchant, q: z.output<typeof petApi.petListQuery>): Promise<petApi.PetListResponse> {
  const term = q.q?.toLowerCase();
  const rows = await ctx.db
    .select({ pet: pets, owner: users.name })
    .from(pets)
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, pets.userId), eq(merchantMembers.merchantId, merchant.id)))
    .innerJoin(users, eq(users.id, pets.userId))
    .orderBy(asc(pets.name))
    .limit(500);
  const filtered = rows.filter((r) => !term || r.pet.name.toLowerCase().includes(term) || (r.owner ?? "").toLowerCase().includes(term) || (r.pet.breed ?? "").toLowerCase().includes(term)).slice(0, q.limit);
  const ids = filtered.map((r) => r.pet.id);
  const vax = await vaccinesByPet(ctx, ids);
  const today = todayFor(ctx, merchant.timezone);
  const shopRows = ids.length ? await ctx.db.select().from(petShop).where(and(eq(petShop.merchantId, merchant.id), inArray(petShop.petId, ids))) : [];
  const last = await lastGrooms(ctx, merchant, ids);
  return {
    items: filtered.map((r) => {
      const statuses = (vax.get(r.pet.id) ?? []).map((v) => vaccineStatus(v.expiresOn, today).status);
      const worst = !statuses.length ? "none" : statuses.includes("expired") ? "expired" : statuses.includes("expiring") ? "expiring" : "current";
      const weeks = shopRows.find((s) => s.petId === r.pet.id)?.groomEveryWeeks ?? defaultGroomWeeks(r.pet.coat);
      const l = last.get(r.pet.id);
      return { id: r.pet.id, name: r.pet.name, species: r.pet.species, breed: r.pet.breed, ownerName: r.owner, worst, nextDueOn: l ? groomDueOn(l, weeks) : null };
    }),
  };
}

/** Local date of the last groom visit per pet at this shop. */
async function lastGrooms(ctx: AppContext, merchant: Merchant, petIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!petIds.length) return out;
  const rows = await ctx.db
    .select({ petId: petVisits.petId, at: sql<Date>`max(${petVisits.at})` })
    .from(petVisits)
    .where(and(eq(petVisits.merchantId, merchant.id), eq(petVisits.kind, "groom"), inArray(petVisits.petId, petIds)))
    .groupBy(petVisits.petId);
  for (const r of rows) out.set(r.petId, localDate(new Date(r.at), merchant.timezone));
  return out;
}

export async function getPet(ctx: AppContext, merchant: Merchant, petId: string): Promise<petApi.StaffPetDto> {
  const { pet, ownerName } = await shopPet(ctx, merchant, petId);
  const sign = uploadSigner(ctx);
  const today = todayFor(ctx, merchant.timezone);
  const vax = (await vaccinesByPet(ctx, [pet.id])).get(pet.id) ?? [];
  const [shop] = await ctx.db.select().from(petShop).where(and(eq(petShop.merchantId, merchant.id), eq(petShop.petId, pet.id))).limit(1);
  const visits = await ctx.db.select().from(petVisits).where(and(eq(petVisits.merchantId, merchant.id), eq(petVisits.petId, pet.id))).orderBy(desc(petVisits.at)).limit(6);
  const lastGroom = visits.find((v) => v.kind === "groom");
  const lastGroomOn = lastGroom ? localDate(lastGroom.at, merchant.timezone) : null;
  const weeks = shop?.groomEveryWeeks ?? defaultGroomWeeks(pet.coat);
  const siblings = await ctx.db.select({ id: pets.id, name: pets.name, species: pets.species }).from(pets).where(eq(pets.userId, pet.userId)).orderBy(asc(pets.createdAt));
  return {
    ...petDto(pet, ownerName, vax, today, sign),
    shop: {
      groomEveryWeeks: shop?.groomEveryWeeks ?? null,
      defaultWeeks: defaultGroomWeeks(pet.coat),
      handlingNote: shop?.handlingNote ?? null,
      assessment: (shop?.assessment ?? "none") as "none" | "passed" | "declined",
      assessedAt: shop?.assessedAt?.toISOString() ?? null,
      lastGroomOn,
      nextDueOn: lastGroomOn ? groomDueOn(lastGroomOn, weeks) : null,
      recentVisits: visits.map((v) => ({ id: v.id, kind: v.kind, at: v.at.toISOString(), mood: v.mood, sent: !!v.sentAt })),
    },
    siblings,
  };
}

export async function createPetForMember(ctx: AppContext, staff: StaffContext, body: z.output<typeof petApi.staffPetBody>): Promise<petApi.PetDto> {
  const [m] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.id, body.memberId), eq(merchantMembers.merchantId, staff.merchant.id))).limit(1);
  if (!m) throw notFound("Customer");
  return createPetFor(ctx, m.userId, body);
}

export async function setVaccineAsStaff(ctx: AppContext, staff: StaffContext, petId: string, kind: string, body: z.output<typeof petApi.vaccineBody>): Promise<petApi.VaccineDto> {
  const { pet } = await shopPet(ctx, staff.merchant, petId);
  return putVaccine(ctx, pet, kind, body.expiresOn, body.proofUrl, [staff.merchant.id, pet.userId]);
}

export async function putPetShop(ctx: AppContext, staff: StaffContext, petId: string, body: z.output<typeof petApi.petShopBody>): Promise<{ ok: true }> {
  const merchant = staff.merchant;
  await shopPet(ctx, merchant, petId);
  const now = ctx.now();
  const patch: Partial<typeof petShop.$inferInsert> = { updatedAt: now };
  if (body.groomEveryWeeks !== undefined) {
    if (body.groomEveryWeeks !== null && (body.groomEveryWeeks < 1 || body.groomEveryWeeks > GROOM_WEEKS_MAX)) throw badRequest("Cadence is 1 to 26 weeks.");
    patch.groomEveryWeeks = body.groomEveryWeeks;
  }
  if (body.handlingNote !== undefined) patch.handlingNote = body.handlingNote?.trim() || null;
  if (body.assessment !== undefined) {
    patch.assessment = body.assessment;
    patch.assessedAt = body.assessment === "none" ? null : now;
    patch.assessedBy = body.assessment === "none" ? null : staff.user.id;
  }
  await ctx.db
    .insert(petShop)
    .values({ merchantId: merchant.id, petId, ...patch })
    .onConflictDoUpdate({ target: [petShop.merchantId, petShop.petId], set: patch });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Visits and report cards
// ---------------------------------------------------------------------------
export interface LogVisitArgs {
  kind: "groom" | "daycare";
  mood?: string | null;
  did?: string[];
  note?: string | null;
  photoUrl?: string | null;
  createdBy: string | null;
}

/** Writes a visit row (it moves the groom cadence when kind is groom). Nothing is texted. */
export async function logVisit(ctx: AppContext, merchant: Merchant, pet: PetRow, a: LogVisitArgs): Promise<typeof petVisits.$inferSelect> {
  const now = ctx.now();
  const [row] = await ctx.db
    .insert(petVisits)
    .values({
      merchantId: merchant.id,
      petId: pet.id,
      userId: pet.userId,
      kind: a.kind,
      at: now,
      mood: a.mood ?? null,
      did: (a.did ?? []).filter((d) => (petApi.DID_TAGS as readonly string[]).includes(d)),
      note: a.note?.trim() || null,
      photoUrl: storeProof(ctx, a.photoUrl, [merchant.id]),
      createdBy: a.createdBy,
    })
    .returning();
  return row!;
}

const firstName = (n: string | null) => (n ?? "").trim().split(/\s+/)[0] || "";

export function reportText(ctx: AppContext, merchant: Pick<Merchant, "name">, pet: { name: string }, locale: Locale, v: { mood: string | null; did: string[]; note: string | null }, url: string): { title: string; body: string } {
  const tr = translator(locale);
  const mood = v.mood ? tr(`pet.mood.${v.mood}` as never) : "";
  const did = v.did.length ? `${v.did.map((d) => tr(`pet.did.${d}` as never)).join(", ")}.` : "";
  const summary = [mood, did, v.note ?? ""].filter(Boolean).join(" ") || "";
  const vars = { shop: merchant.name, pet: pet.name, summary, url };
  return { title: tr("pet.msg.reportTitle", vars), body: tr("pet.msg.report", vars).replace(/\s{2,}/g, " ") };
}

export const reportUrl = (ctx: AppContext, token: string) => `${ctx.config.publicWebUrl.replace(/\/$/, "")}/visit/${token}`;

/**
 * A report card: logs the visit and, unless `send` is false, texts the owner a short summary with a private link (30 days).
 * It is a service message about a visit the owner booked: one per visit, shop name, STOP line, never overnight, never to a
 * number that replied STOP. A groom card moves the cadence.
 */
export async function sendReportCard(ctx: AppContext, staff: StaffContext, petId: string, body: z.output<typeof petApi.reportCardBody>): Promise<petApi.ReportCardResponse> {
  const merchant = staff.merchant;
  const { pet, ownerPhone, ownerLocale } = await shopPet(ctx, merchant, petId);
  const visit = await logVisit(ctx, merchant, pet, { kind: body.kind, mood: body.mood ?? null, did: body.did, note: body.note ?? null, photoUrl: body.photoUrl ?? null, createdBy: staff.user.id });
  if (!body.send) return { visitId: visit.id, sent: false, skipped: null, url: null, text: null };
  const now = ctx.now();
  // The private page exists as soon as a card is made for the owner, so when the text cannot go (no phone, night, STOP) the shop can hand the link over itself.
  const token = randomToken(24);
  const url = reportUrl(ctx, token);
  await ctx.db.update(petVisits).set({ token, expiresAt: new Date(now.getTime() + REPORT_DAYS * DAY_MS) }).where(eq(petVisits.id, visit.id));
  const locale = normalizeLocale(ownerLocale) ?? "en";
  const { body: text } = reportText(ctx, merchant, pet, locale, { mood: visit.mood, did: visit.did, note: visit.note }, url);
  const skip = async (skipped: petApi.ReportCardResponse["skipped"]): Promise<petApi.ReportCardResponse> => ({ visitId: visit.id, sent: false, skipped, url, text });
  if (!ownerPhone) return skip("no_phone");
  if (inQuietHours(now, merchant.timezone)) return skip("quiet");
  const stopped = await optedOutSet(ctx.db, [ownerPhone], "sms");
  if (isSuppressed(stopped, ownerPhone)) return skip("opted_out");
  if (!(await reserveSmsCredits(ctx.db, merchant, 1))) return skip("no_credits");
  let status = "sent";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    const r = await sendSms(ctx, ownerPhone, text);
    if (!r) {
      status = "skipped";
      error = "opted_out";
    } else providerId = r.id;
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message.slice(0, 500) : "send failed";
  }
  await ctx.db.insert(messageDeliveries).values({ userId: pet.userId, merchantId: merchant.id, channel: "sms", to: ownerPhone, body: text, kind: "transactional", status, providerId, error });
  if (status !== "sent") return skip("opted_out");
  await ctx.db.update(petVisits).set({ sentAt: now }).where(eq(petVisits.id, visit.id));
  return { visitId: visit.id, sent: true, skipped: null, url, text };
}

/** The page a report card text opens: public by its long random token, gone after 30 days. */
export async function publicVisit(ctx: AppContext, token: string): Promise<petApi.PublicVisitResponse> {
  const [r] = await ctx.db
    .select({ v: petVisits, petName: pets.name, shop: sql<string>`m.name`, slug: sql<string>`m.slug` })
    .from(petVisits)
    .innerJoin(pets, eq(pets.id, petVisits.petId))
    .innerJoin(sql`merchants m`, sql`m.id = ${petVisits.merchantId}`)
    .where(eq(petVisits.token, token))
    .limit(1);
  if (!r || !r.v.token) throw notFound("Report card");
  if (!r.v.expiresAt || r.v.expiresAt <= ctx.now()) throw new HttpError(410, "expired", "This report card has expired.");
  return {
    shop: { name: r.shop, slug: r.slug },
    pet: { name: r.petName },
    kind: r.v.kind,
    at: r.v.at.toISOString(),
    mood: r.v.mood,
    did: r.v.did,
    note: r.v.note,
    photoUrl: r.v.photoUrl ? uploadSigner(ctx)(r.v.photoUrl) : null,
    bookUrl: `${ctx.config.publicWebUrl.replace(/\/$/, "")}/shops/${r.slug}/book`,
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const settingsDto = (r: typeof petSettings.$inferSelect | undefined): petApi.PetSettingsDto => ({
  capacity: r?.capacity ?? 16,
  dogsPerStaff: r?.dogsPerStaff ?? 15,
  staffOn: r?.staffOn ?? 1,
  requiredVaccines: r?.requiredVaccines ?? ["rabies", "dhpp", "bordetella"],
  requireAssessment: r?.requireAssessment ?? true,
  dropInCents: r?.dropInCents ?? 4800,
  packs: r?.packs ?? [{ days: 5, priceCents: 22000, validDays: 120 }, { days: 10, priceCents: 42000, validDays: 180 }],
  closesAt: r?.closesAt ?? "18:00",
  lateGraceMin: r?.lateGraceMin ?? 15,
  autoGroomReminders: r?.autoGroomReminders ?? false,
});

export async function getPetSettings(ctx: AppContext, merchantId: string): Promise<petApi.PetSettingsDto> {
  const [r] = await ctx.db.select().from(petSettings).where(eq(petSettings.merchantId, merchantId)).limit(1);
  return settingsDto(r);
}

export async function savePetSettings(ctx: AppContext, merchantId: string, body: z.output<typeof petApi.petSettingsBody>): Promise<petApi.PetSettingsDto> {
  const cur = await getPetSettings(ctx, merchantId);
  const next = { ...cur, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) } as petApi.PetSettingsDto;
  const now = ctx.now();
  await ctx.db
    .insert(petSettings)
    .values({ merchantId, ...next, updatedAt: now })
    .onConflictDoUpdate({ target: petSettings.merchantId, set: { ...next, updatedAt: now } });
  return next;
}

// ---------------------------------------------------------------------------
// Groom rebooking
// ---------------------------------------------------------------------------
interface Candidate {
  pet: PetRow;
  ownerName: string | null;
  phone: string | null;
  locale: Locale;
  member: typeof merchantMembers.$inferSelect;
  weeks: number;
  visitId: string;
  lastGroomOn: string;
  dueOn: string;
  state: "due" | "late";
  daysLate: number;
  canSend: boolean;
}

async function candidates(ctx: AppContext, merchant: Merchant): Promise<{ list: Candidate[]; onCadence: number }> {
  const tz = merchant.timezone;
  const today = todayFor(ctx, tz);
  const rows = await ctx.db
    .select({ pet: pets, name: users.name, phone: users.phone, locale: users.locale, deletedAt: users.deletedAt, member: merchantMembers })
    .from(pets)
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, pets.userId), eq(merchantMembers.merchantId, merchant.id)))
    .innerJoin(users, eq(users.id, pets.userId));
  if (!rows.length) return { list: [], onCadence: 0 };
  const ids = rows.map((r) => r.pet.id);
  const visits = await ctx.db.select().from(petVisits).where(and(eq(petVisits.merchantId, merchant.id), eq(petVisits.kind, "groom"), inArray(petVisits.petId, ids))).orderBy(desc(petVisits.at));
  const lastVisit = new Map<string, typeof petVisits.$inferSelect>();
  for (const v of visits) if (!lastVisit.has(v.petId)) lastVisit.set(v.petId, v);
  const shopRows = await ctx.db.select().from(petShop).where(and(eq(petShop.merchantId, merchant.id), inArray(petShop.petId, ids)));
  const nudges = await ctx.db.select().from(petNudges).where(and(eq(petNudges.merchantId, merchant.id), inArray(petNudges.petId, ids)));
  const owners = [...new Set(rows.map((r) => r.pet.userId))];
  const future = await ctx.db
    .select({ userId: appointments.userId })
    .from(appointments)
    .where(and(eq(appointments.merchantId, merchant.id), inArray(appointments.status, ["booked", "arrived", "in_service"]), gte(appointments.startsAt, ctx.now()), inArray(appointments.userId, owners)));
  const hasFuture = new Set(future.map((f) => f.userId));
  const stopped = await optedOutSet(ctx.db, rows.map((r) => r.phone), "sms");
  const list: Candidate[] = [];
  let onCadence = 0;
  for (const r of rows) {
    const v = lastVisit.get(r.pet.id);
    if (!v || r.deletedAt) continue;
    onCadence++;
    const weeks = shopRows.find((s) => s.petId === r.pet.id)?.groomEveryWeeks ?? defaultGroomWeeks(r.pet.coat);
    const lastGroomOn = localDate(v.at, tz);
    const dueOn = groomDueOn(lastGroomOn, weeks);
    const g = groomState(dueOn, today);
    if (g.state === "later" || hasFuture.has(r.pet.userId)) continue;
    // One text (or one skip) per cycle: the cycle is the groom visit it follows.
    if (nudges.some((n) => n.petId === r.pet.id && n.sinceVisitId === v.id)) continue;
    const m = r.member;
    list.push({
      pet: r.pet,
      ownerName: r.name,
      phone: r.phone,
      locale: normalizeLocale(r.locale) ?? "en",
      member: m,
      weeks,
      visitId: v.id,
      lastGroomOn,
      dueOn,
      state: g.state,
      daysLate: g.daysLate,
      canSend: !!m.marketingConsentAt && !m.muted && !!r.phone && !isSuppressed(stopped, r.phone),
    });
  }
  list.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.pet.name.localeCompare(b.pet.name));
  return { list, onCadence };
}

export function groomText(ctx: AppContext, merchant: Pick<Merchant, "name" | "slug">, c: { locale: Locale; petName: string; dueOn: string }) {
  const tr = translator(c.locale);
  const url = `${ctx.config.publicWebUrl.replace(/\/$/, "")}/shops/${merchant.slug}/book${c.locale === "en" ? "" : `?lang=${c.locale}`}`;
  const vars = { shop: merchant.name, pet: c.petName, date: formatDate(c.locale, `${c.dueOn}T12:00:00Z`, { month: "short", day: "numeric" }, "UTC"), url };
  return { title: tr("pet.msg.groomDueTitle", vars), body: tr("pet.msg.groomDue", vars) };
}

export async function rebookingOverview(ctx: AppContext, merchant: Merchant): Promise<petApi.PetRebookingResponse> {
  const { list, onCadence } = await candidates(ctx, merchant);
  const sample = list[0];
  return {
    items: list.map((c) => ({ petId: c.pet.id, petName: c.pet.name, ownerName: c.ownerName, breed: c.pet.breed, coat: c.pet.coat, everyWeeks: c.weeks, lastGroomOn: c.lastGroomOn, dueOn: c.dueOn, state: c.state, daysLate: c.daysLate, canSend: c.canSend })),
    counts: { due: list.length, late: list.filter((c) => c.state === "late").length, onCadence },
    previewText: groomText(ctx, merchant, { locale: "en", petName: sample?.pet.name ?? "Biscuit", dueOn: sample?.dueOn ?? "2026-11-17" }).body,
  };
}

async function sendOne(ctx: AppContext, merchant: Merchant, c: Candidate): Promise<"sent" | "quiet" | "no_credits" | "skipped"> {
  const now = ctx.now();
  if (!c.canSend || !c.phone) return "skipped";
  if (inQuietHours(now, merchant.timezone)) return "quiet";
  if (!(await reserveSmsCredits(ctx.db, merchant, 1))) return "no_credits";
  const { body } = groomText(ctx, merchant, { locale: c.locale, petName: c.pet.name, dueOn: c.dueOn });
  let status = "sent";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    const r = await sendSms(ctx, c.phone, body);
    if (!r) {
      status = "skipped";
      error = "opted_out";
    } else providerId = r.id;
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message.slice(0, 500) : "send failed";
  }
  await ctx.db.insert(messageDeliveries).values({ userId: c.pet.userId, merchantId: merchant.id, channel: "sms", to: c.phone, body, kind: "marketing", status, providerId, error });
  if (status !== "sent") return "skipped";
  await ctx.db.insert(petNudges).values({ merchantId: merchant.id, petId: c.pet.id, sinceVisitId: c.visitId, action: "sent" });
  return "sent";
}

/** Texts the listed pets' owners (all due pets when no ids), or skips them for this cycle. Stops when the month's texts run out; never overnight. */
export async function sendRebooking(ctx: AppContext, merchant: Merchant, body: z.output<typeof petApi.rebookingSendBody>): Promise<petApi.RebookingSendResponse> {
  const { list } = await candidates(ctx, merchant);
  const pool = list.filter((c) => !body.petIds || body.petIds.includes(c.pet.id));
  let sent = 0;
  let skipped = 0;
  if (body.skip) {
    for (const c of pool) {
      await ctx.db.insert(petNudges).values({ merchantId: merchant.id, petId: c.pet.id, sinceVisitId: c.visitId, action: "skipped" });
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
  if (body.petIds && !sent && !skipped) throw conflict("Nobody in that list is due for a text right now.");
  return { sent, skipped };
}

/** Job, hourly: at 10:00 shop time, text due pets for shops that switched automatic groom reminders on. */
export async function runGroomReminders(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const shops = await ctx.db
    .select({ m: merchantsTable })
    .from(petSettings)
    .innerJoin(merchantsTable, eq(merchantsTable.id, petSettings.merchantId))
    .where(and(eq(petSettings.autoGroomReminders, true), inArray(merchantsTable.status, ["onboarding", "active"])));
  let sent = 0;
  for (const { m } of shops) {
    const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: m.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
    if (hour !== 10) continue;
    if (!(await isFeatureOn(ctx.db, m, "pets.profiles"))) continue;
    sent += (await sendRebooking(ctx, m, { skip: false })).sent;
  }
  return sent;
}
