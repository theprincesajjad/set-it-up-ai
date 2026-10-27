/**
 * Pet food cards (docs/research/pet-care.md 2.4): a buy-N-get-1 card per brand and bag size that counts bags per customer and
 * product, cannot be redeemed early, forgets bags older than the program's window, and texts a few days before a bag runs out.
 *
 * The shop defines each brand's terms (in Canada the offer is the retailer's, not the brand's). A card is one (customer, product):
 * the free bag then matches what was bought. Redeem is enforced here on the server, so a till slip-up cannot give a bag away.
 * Money is not handled: the cashier rings the bag on the till as usual and taps the card.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { foodCards, foodEvents, foodPrograms, foodSkus, merchantMembers, merchants, messageDeliveries, pets, users } from "@ll/db";
import { foodCardState, formatDate, normalizeLocale, remindOn as remindOnFn, runOutOn as runOutOnFn, translator, type petApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { isFeatureOn } from "./features.js";
import { localDate, reserveSmsCredits } from "./messaging.js";
import { inQuietHours } from "./notifications.js";
import { isSuppressed, optedOutSet, sendSms } from "./opt-out.js";
import { writeAudit } from "./admin-audit.js";

type Merchant = typeof merchants.$inferSelect;
type Card = typeof foodCards.$inferSelect;
type Program = typeof foodPrograms.$inferSelect;
type Sku = typeof foodSkus.$inferSelect;
const UNDO_MS = 10 * 60_000;

export const RUNOUT_ASK = (item: string) => `Want a text a few days before your ${item} runs out? You can reply STOP any time.`;

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------
export async function listPrograms(ctx: AppContext, merchant: Merchant): Promise<petApi.FoodProgramDto[]> {
  const progs = await ctx.db.select().from(foodPrograms).where(eq(foodPrograms.merchantId, merchant.id)).orderBy(asc(foodPrograms.brand));
  if (!progs.length) return [];
  const ids = progs.map((p) => p.id);
  const skus = await ctx.db.select().from(foodSkus).where(inArray(foodSkus.programId, ids)).orderBy(asc(foodSkus.name));
  const cards = await ctx.db.select({ programId: foodCards.programId }).from(foodCards).where(inArray(foodCards.programId, ids));
  return progs.map((p) => ({
    id: p.id,
    brand: p.brand,
    buyCount: p.buyCount,
    expiryMonths: p.expiryMonths,
    active: p.active,
    skus: skus.filter((s) => s.programId === p.id).map((s) => ({ id: s.id, name: s.name, bagGrams: s.bagGrams, active: s.active })),
    cards: cards.filter((c) => c.programId === p.id).length,
  }));
}

export async function createProgram(ctx: AppContext, staff: StaffContext, body: z.output<typeof petApi.foodProgramBody>): Promise<petApi.FoodProgramDto> {
  const merchant = staff.merchant;
  const existing = await ctx.db.select().from(foodPrograms).where(eq(foodPrograms.merchantId, merchant.id));
  if (existing.length >= 40) throw conflict("Up to 40 brands.");
  if (existing.some((p) => p.brand.toLowerCase() === body.brand.toLowerCase())) throw conflict(`${body.brand} is already on a card.`);
  const [row] = await ctx.db.insert(foodPrograms).values({ merchantId: merchant.id, brand: body.brand, buyCount: body.buyCount, expiryMonths: body.expiryMonths, active: body.active ?? true }).returning();
  await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId: merchant.id, action: "pets.food_program_created", entity: "food_program", entityId: row!.id, data: { brand: body.brand, buyCount: body.buyCount } });
  return { id: row!.id, brand: row!.brand, buyCount: row!.buyCount, expiryMonths: row!.expiryMonths, active: row!.active, skus: [], cards: 0 };
}

export async function updateProgram(ctx: AppContext, staff: StaffContext, id: string, body: Partial<z.output<typeof petApi.foodProgramBody>>): Promise<{ ok: true }> {
  const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (!Object.keys(patch).length) throw badRequest("Nothing to update");
  const [row] = await ctx.db.update(foodPrograms).set(patch).where(and(eq(foodPrograms.id, id), eq(foodPrograms.merchantId, staff.merchant.id))).returning({ id: foodPrograms.id });
  if (!row) throw notFound("Brand");
  return { ok: true };
}

export async function addSku(ctx: AppContext, staff: StaffContext, programId: string, body: z.output<typeof petApi.foodSkuBody>): Promise<petApi.FoodSkuDto> {
  const [p] = await ctx.db.select().from(foodPrograms).where(and(eq(foodPrograms.id, programId), eq(foodPrograms.merchantId, staff.merchant.id))).limit(1);
  if (!p) throw notFound("Brand");
  const [row] = await ctx.db.insert(foodSkus).values({ programId, merchantId: staff.merchant.id, name: body.name, bagGrams: body.bagGrams }).returning();
  return { id: row!.id, name: row!.name, bagGrams: row!.bagGrams, active: row!.active };
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
async function cardDtos(ctx: AppContext, rows: { card: Card; program: Program; sku: Sku; petName: string | null; customerName: string | null; tz: string; shop?: { id: string; name: string; slug: string } }[]): Promise<petApi.FoodCardDto[]> {
  const now = ctx.now();
  return rows.map(({ card, program, sku, petName, customerName, tz, shop }) => {
    const s = foodCardState(card, program, now);
    const runOut = card.dailyGrams ? runOutOnFn(localDate(card.lastBagAt, tz), sku.bagGrams, card.dailyGrams) : null;
    return {
      id: card.id,
      programId: program.id,
      brand: program.brand,
      skuId: sku.id,
      skuName: sku.name,
      buyCount: program.buyCount,
      counted: s.towardNext,
      owed: s.owed,
      canRedeem: s.canRedeem,
      expired: s.expired,
      toGo: s.toGo,
      given: card.given,
      dailyGrams: card.dailyGrams,
      runOutOn: runOut,
      remindOn: runOut ? remindOnFn(runOut) : null,
      remind: card.remind,
      petName,
      customerName,
      customerId: card.userId,
      ...(shop ? { shop } : {}),
    };
  });
}

async function loadCards(ctx: AppContext, merchant: Merchant, where: ReturnType<typeof and>) {
  const rows = await ctx.db
    .select({ card: foodCards, program: foodPrograms, sku: foodSkus, pet: pets.name, customer: users.name })
    .from(foodCards)
    .innerJoin(foodPrograms, eq(foodPrograms.id, foodCards.programId))
    .innerJoin(foodSkus, eq(foodSkus.id, foodCards.skuId))
    .innerJoin(users, eq(users.id, foodCards.userId))
    .leftJoin(pets, eq(pets.id, foodCards.petId))
    .where(where)
    .orderBy(desc(foodCards.lastBagAt));
  return cardDtos(ctx, rows.map((r) => ({ card: r.card, program: r.program, sku: r.sku, petName: r.pet, customerName: r.customer, tz: merchant.timezone })));
}

export async function memberCards(ctx: AppContext, merchant: Merchant, memberId: string): Promise<petApi.FoodCardLookupResponse> {
  const [m] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.id, memberId), eq(merchantMembers.merchantId, merchant.id))).limit(1);
  if (!m) throw notFound("Customer");
  return { cards: await loadCards(ctx, merchant, and(eq(foodCards.merchantId, merchant.id), eq(foodCards.userId, m.userId))) };
}

export async function punch(ctx: AppContext, staff: StaffContext, body: z.output<typeof petApi.punchBody>): Promise<petApi.FoodCardDto & { needsCustomerYes: boolean }> {
  const merchant = staff.merchant;
  const [m] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.id, body.memberId), eq(merchantMembers.merchantId, merchant.id))).limit(1);
  if (!m) throw notFound("Customer");
  const [sku] = await ctx.db.select().from(foodSkus).where(and(eq(foodSkus.id, body.skuId), eq(foodSkus.merchantId, merchant.id), eq(foodSkus.active, true))).limit(1);
  if (!sku) throw notFound("Product");
  const [program] = await ctx.db.select().from(foodPrograms).where(and(eq(foodPrograms.id, sku.programId), eq(foodPrograms.active, true))).limit(1);
  if (!program) throw conflict("This brand is not on a card right now.");
  if (body.petId) {
    const [pet] = await ctx.db.select({ id: pets.id }).from(pets).where(and(eq(pets.id, body.petId), eq(pets.userId, m.userId))).limit(1);
    if (!pet) throw notFound("Pet");
  }
  const now = ctx.now();
  const [cur] = await ctx.db.select().from(foodCards).where(and(eq(foodCards.userId, m.userId), eq(foodCards.skuId, sku.id))).limit(1);

  // A cashier cannot say yes for a customer: the run-out text is switched on by the customer on their own card (/me/food), where the exact
  // words are shown. The counter can switch it off, and can still set the daily amount so the date is ready when they say yes.
  let needsCustomerYes = false;
  const remindPatch: Partial<typeof foodCards.$inferInsert> = {};
  if (body.remind === false) remindPatch.remind = false;
  else if (body.remind === true && !cur?.remind) needsCustomerYes = true;
  const extra: Partial<typeof foodCards.$inferInsert> = { ...remindPatch };
  if (body.dailyGrams !== undefined) extra.dailyGrams = body.dailyGrams ?? null;
  if (body.petId !== undefined) extra.petId = body.petId ?? null;

  let card: Card;
  if (!cur) {
    [card] = (await ctx.db.insert(foodCards).values({ merchantId: merchant.id, programId: program.id, skuId: sku.id, userId: m.userId, punches: body.qty, cycleStartedAt: now, lastBagAt: now, ...extra }).returning()) as [Card];
  } else {
    const state = foodCardState(cur, program, now);
    // Bags older than the window stopped counting: the next bag starts a new card.
    const reset = state.expired;
    [card] = (await ctx.db
      .update(foodCards)
      .set({ punches: reset ? body.qty : cur.punches + body.qty, given: reset ? 0 : cur.given, cycleStartedAt: reset ? now : cur.cycleStartedAt, lastBagAt: now, updatedAt: now, ...extra })
      .where(eq(foodCards.id, cur.id))
      .returning()) as [Card];
  }
  await ctx.db.insert(foodEvents).values({ cardId: card!.id, merchantId: merchant.id, kind: "bag", qty: body.qty, staffId: staff.user.id, at: now });
  const [dto] = await loadCards(ctx, merchant, eq(foodCards.id, card!.id));
  return { ...dto!, needsCustomerYes };
}

export async function redeem(ctx: AppContext, staff: StaffContext, cardId: string): Promise<petApi.FoodCardDto> {
  const merchant = staff.merchant;
  const [r] = await ctx.db
    .select({ card: foodCards, program: foodPrograms })
    .from(foodCards)
    .innerJoin(foodPrograms, eq(foodPrograms.id, foodCards.programId))
    .where(and(eq(foodCards.id, cardId), eq(foodCards.merchantId, merchant.id)))
    .limit(1);
  if (!r) throw notFound("Card");
  const now = ctx.now();
  const s = foodCardState(r.card, r.program, now);
  if (!s.canRedeem) {
    const why = s.expired ? "The bags on this card are too old to count." : `${s.toGo} more ${s.toGo === 1 ? "bag" : "bags"} to go.`;
    throw new HttpError(409, "not_earned", `Not earned yet. ${why}`);
  }
  // Optimistic: only if nobody changed the card since we read it.
  const given = r.card.given + 1;
  const done = given * r.program.buyCount >= r.card.punches;
  const [row] = await ctx.db
    .update(foodCards)
    .set(done ? { punches: 0, given: 0, cycleStartedAt: now, updatedAt: now } : { given, updatedAt: now })
    .where(and(eq(foodCards.id, cardId), eq(foodCards.given, r.card.given), eq(foodCards.punches, r.card.punches)))
    .returning({ id: foodCards.id });
  if (!row) throw conflict("This card just changed. Try again.");
  await ctx.db.insert(foodEvents).values({ cardId, merchantId: merchant.id, kind: "free", qty: 1, staffId: staff.user.id, at: now });
  await writeAudit(ctx.db, { actorUserId: staff.user.id, merchantId: merchant.id, action: "pets.food_free_bag", entity: "food_card", entityId: cardId, data: { brand: r.program.brand } });
  const [dto] = await loadCards(ctx, merchant, eq(foodCards.id, cardId));
  return dto!;
}

/** Takes back the last bag tapped, by the same person, within 10 minutes. */
export async function undoLast(ctx: AppContext, staff: StaffContext, cardId: string): Promise<petApi.FoodCardDto> {
  const merchant = staff.merchant;
  const [card] = await ctx.db.select().from(foodCards).where(and(eq(foodCards.id, cardId), eq(foodCards.merchantId, merchant.id))).limit(1);
  if (!card) throw notFound("Card");
  const recent = await ctx.db.select().from(foodEvents).where(eq(foodEvents.cardId, cardId)).orderBy(desc(foodEvents.at)).limit(6);
  // Events in the same instant: the later action (an undo or a free bag) wins over the bag it follows.
  const last = recent.filter((e) => e.at.getTime() === recent[0]?.at.getTime()).find((e) => e.kind !== "bag") ?? recent[0];
  const now = ctx.now();
  if (!last || last.kind !== "bag" || last.staffId !== staff.user.id || now.getTime() - last.at.getTime() > UNDO_MS) throw conflict("Only the last bag you tapped in the past 10 minutes can be taken back.");
  await ctx.db.update(foodCards).set({ punches: Math.max(0, card.punches - last.qty), updatedAt: now }).where(eq(foodCards.id, cardId));
  await ctx.db.insert(foodEvents).values({ cardId, merchantId: merchant.id, kind: "undo", qty: last.qty, staffId: staff.user.id, at: now });
  const [dto] = await loadCards(ctx, merchant, eq(foodCards.id, cardId));
  return dto!;
}

// ---------------------------------------------------------------------------
// Run-out reminders
// ---------------------------------------------------------------------------
interface Cand {
  card: Card;
  program: Program;
  sku: Sku;
  name: string | null;
  phone: string | null;
  locale: ReturnType<typeof normalizeLocale>;
  runOut: string;
  remindOn: string;
  canText: boolean;
}

async function runOutCandidates(ctx: AppContext, merchant: Merchant): Promise<Cand[]> {
  const rows = await ctx.db
    .select({ card: foodCards, program: foodPrograms, sku: foodSkus, consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted, name: users.name, phone: users.phone, locale: users.locale, deletedAt: users.deletedAt })
    .from(foodCards)
    .innerJoin(foodPrograms, eq(foodPrograms.id, foodCards.programId))
    .innerJoin(foodSkus, eq(foodSkus.id, foodCards.skuId))
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, foodCards.userId), eq(merchantMembers.merchantId, foodCards.merchantId)))
    .innerJoin(users, eq(users.id, foodCards.userId))
    .where(and(eq(foodCards.merchantId, merchant.id), eq(foodCards.remind, true)));
  const stopped = await optedOutSet(ctx.db, rows.map((r) => r.phone), "sms");
  return rows
    .filter((r) => !r.deletedAt && r.card.dailyGrams)
    .map((r) => {
      const runOut = runOutOnFn(localDate(r.card.lastBagAt, merchant.timezone), r.sku.bagGrams, r.card.dailyGrams!);
      return { card: r.card, program: r.program, sku: r.sku, name: r.name, phone: r.phone, locale: normalizeLocale(r.locale), runOut, remindOn: remindOnFn(runOut), canText: (!!r.consent || (!!r.card.remindConsentAt && r.card.remindConsentSource === "pass")) && !r.muted && !!r.phone && !isSuppressed(stopped, r.phone) };
    });
}

/** Is a text due now: the reminder date has come, one text per bag, and not so late that the bag was surely replaced. */
function dueNow(c: Cand, today: string): boolean {
  if (c.remindOn > today) return false;
  if (c.card.lastRemindedAt && c.card.lastRemindedAt > c.card.lastBagAt) return false;
  const lateBy = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.runOut}T00:00:00Z`)) / 86_400_000;
  return lateBy <= 14;
}

export async function runOutOverview(ctx: AppContext, merchant: Merchant): Promise<petApi.RunOutResponse> {
  const today = localDate(ctx.now(), merchant.timezone);
  const cands = await runOutCandidates(ctx, merchant);
  const names = await ctx.db.select({ id: pets.id, name: pets.name }).from(pets).where(inArray(pets.id, cands.map((c) => c.card.petId).filter((x): x is string => !!x)));
  const petName = new Map(names.map((n) => [n.id, n.name]));
  const weekOut = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  return {
    items: cands
      .filter((c) => c.remindOn <= weekOut && (!c.card.lastRemindedAt || c.card.lastRemindedAt <= c.card.lastBagAt) && dueLate(c, today))
      .sort((a, b) => a.runOut.localeCompare(b.runOut))
      .map((c) => ({ cardId: c.card.id, customerName: c.name, petName: c.card.petId ? (petName.get(c.card.petId) ?? null) : null, brand: c.program.brand, skuName: c.sku.name, runOutOn: c.runOut, remindOn: c.remindOn, readyToText: c.canText && dueNow(c, today) })),
    askText: RUNOUT_ASK("26 lb bag of dog food"),
  };
}
const dueLate = (c: Cand, today: string) => (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.runOut}T00:00:00Z`)) / 86_400_000 <= 14;

export function runOutText(ctx: AppContext, merchant: Pick<Merchant, "name" | "slug">, c: { locale: ReturnType<typeof normalizeLocale>; name: string | null; item: string; runOut: string }) {
  const locale = c.locale ?? "en";
  const tr = translator(locale);
  const vars = { name: (c.name ?? "").trim().split(/\s+/)[0] || "", item: c.item, date: formatDate(locale, `${c.runOut}T12:00:00Z`, { month: "short", day: "numeric" }, "UTC"), shop: merchant.name, url: `${ctx.config.publicWebUrl.replace(/\/$/, "")}/shops/${merchant.slug}${locale === "en" ? "" : `?lang=${locale}`}` };
  return { title: tr("pet.msg.runOutTitle", vars), body: tr("pet.msg.runOut", vars).replace(/^\s*,\s*/, "") };
}

async function sendRunOut(ctx: AppContext, merchant: Merchant, c: Cand): Promise<"sent" | "quiet" | "no_credits" | "skipped"> {
  const now = ctx.now();
  if (!c.canText || !c.phone) return "skipped";
  if (inQuietHours(now, merchant.timezone)) return "quiet";
  if (!(await reserveSmsCredits(ctx.db, merchant, 1))) return "no_credits";
  const { body } = runOutText(ctx, merchant, { locale: c.locale, name: c.name, item: `${c.program.brand} ${c.sku.name}`, runOut: c.runOut });
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
  await ctx.db.insert(messageDeliveries).values({ userId: c.card.userId, merchantId: merchant.id, channel: "sms", to: c.phone, body, kind: "marketing", status, providerId, error });
  if (status !== "sent") return "skipped";
  await ctx.db.update(foodCards).set({ lastRemindedAt: now, updatedAt: now }).where(eq(foodCards.id, c.card.id));
  return "sent";
}

export async function sendRunOuts(ctx: AppContext, merchant: Merchant, opts: { cardIds?: string[] } = {}): Promise<{ sent: number; skipped: number }> {
  const today = localDate(ctx.now(), merchant.timezone);
  const pool = (await runOutCandidates(ctx, merchant)).filter((c) => (!opts.cardIds || opts.cardIds.includes(c.card.id)) && dueNow(c, today));
  let sent = 0;
  let skipped = 0;
  for (const c of pool) {
    const r = await sendRunOut(ctx, merchant, c);
    if (r === "sent") sent++;
    else skipped++;
    if (r === "no_credits" || r === "quiet") break;
  }
  if (opts.cardIds && !sent && !skipped) throw new HttpError(409, "not_due", "Nobody in that list is due for a text right now.");
  return { sent, skipped };
}

/** Job, hourly: at 10:00 shop time, text everyone due, for shops with food cards on. */
export async function runRunOutReminders(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const shops = await ctx.db.selectDistinct({ m: merchants }).from(foodCards).innerJoin(merchants, eq(merchants.id, foodCards.merchantId)).where(and(eq(foodCards.remind, true), inArray(merchants.status, ["onboarding", "active"])));
  let sent = 0;
  for (const { m } of shops) {
    const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: m.timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
    if (hour !== 10) continue;
    if (!(await isFeatureOn(ctx.db, m, "pets.food_cards"))) continue;
    sent += (await sendRunOuts(ctx, m)).sent;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// The customer's side
// ---------------------------------------------------------------------------
export async function myFoodCards(ctx: AppContext, userId: string): Promise<petApi.MyFoodCardsResponse> {
  const rows = await ctx.db
    .select({ card: foodCards, program: foodPrograms, sku: foodSkus, pet: pets.name, customer: users.name, m: merchants })
    .from(foodCards)
    .innerJoin(foodPrograms, eq(foodPrograms.id, foodCards.programId))
    .innerJoin(foodSkus, eq(foodSkus.id, foodCards.skuId))
    .innerJoin(merchants, eq(merchants.id, foodCards.merchantId))
    .innerJoin(users, eq(users.id, foodCards.userId))
    .leftJoin(pets, eq(pets.id, foodCards.petId))
    .where(eq(foodCards.userId, userId))
    .orderBy(desc(foodCards.lastBagAt));
  const dtos = await cardDtos(ctx, rows.map((r) => ({ card: r.card, program: r.program, sku: r.sku, petName: r.pet, customerName: r.customer, tz: r.m.timezone, shop: { id: r.m.id, name: r.m.name, slug: r.m.slug } })));
  return { items: dtos };
}

/** The customer switches a reminder off any time; switching it on needs the shop's text consent and a daily amount, and records where it came from. */
export async function setMyRemind(ctx: AppContext, userId: string, cardId: string, body: z.output<typeof petApi.myRemindBody>): Promise<petApi.FoodCardDto> {
  const [r] = await ctx.db
    .select({ card: foodCards, m: merchants, consent: merchantMembers.marketingConsentAt, muted: merchantMembers.muted })
    .from(foodCards)
    .innerJoin(merchants, eq(merchants.id, foodCards.merchantId))
    .innerJoin(merchantMembers, and(eq(merchantMembers.userId, foodCards.userId), eq(merchantMembers.merchantId, foodCards.merchantId)))
    .where(and(eq(foodCards.id, cardId), eq(foodCards.userId, userId)))
    .limit(1);
  if (!r) throw notFound("Card");
  // The customer's own switch is their yes to this one text. Only a shop they muted stops it: unmute first, then switch it on.
  if (body.remind && r.muted) throw new HttpError(409, "muted", `You muted ${r.m.name}. Unmute it on your card, then switch this on.`);
  const daily = body.dailyGrams ?? r.card.dailyGrams;
  if (body.remind && !daily) throw badRequest("Add how many grams a day your pet eats.");
  const now = ctx.now();
  const patch = body.remind && !r.card.remind ? { remind: true, dailyGrams: daily, remindConsentAt: now, remindConsentSource: "pass", remindConsentBy: userId, updatedAt: now } : { remind: body.remind, dailyGrams: daily, updatedAt: now };
  await ctx.db.update(foodCards).set(patch).where(eq(foodCards.id, cardId));
  if (body.remind && !r.card.remind) {
    const [sku] = await ctx.db.select({ name: foodSkus.name, brand: foodPrograms.brand }).from(foodSkus).innerJoin(foodPrograms, eq(foodPrograms.id, foodSkus.programId)).where(eq(foodSkus.id, r.card.skuId)).limit(1);
    await writeAudit(ctx.db, { actorUserId: userId, merchantId: r.m.id, action: "consent.runout", entity: "food_card", entityId: cardId, data: { text: RUNOUT_ASK(`${sku?.brand ?? ""} ${sku?.name ?? "bag"}`.trim()), source: "pass" } });
  }
  const mine = await myFoodCards(ctx, userId);
  return mine.items.find((i) => i.id === cardId)!;
}
