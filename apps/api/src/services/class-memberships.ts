/**
 * Class packs, intro offers and recurring memberships: what a studio sells and the money behind it.
 * Contract: @ll/shared classesApi. Routes: routes/classes. Schedule and booking rules: classes.ts.
 *
 * Billing follows tiffin (services/tiffin.ts), the existing recurring-billing pattern:
 *  - A membership is billed one period at a time. Each period is one class_charges row (unique per membership +
 *    period start) and the period only advances when that charge is paid (webhook, ll_kind "class").
 *  - The first payment is confirmed by the customer with Stripe.js and keeps the card (setup_future_usage). Renewals
 *    charge that saved card off-session. If the bank wants the customer (authentication_required) the charge stays
 *    pending and they confirm it in the app; a decline marks it failed and the membership past due. A failed charge is
 *    retried on the second and fifth day, then waits for the member (Pay now) or the studio.
 *  - A past-due or frozen membership cannot book classes.
 *
 * Ontario Consumer Protection Act, 2002, personal development services (verify with counsel before launch): the
 * member gets a written copy of the agreement (stored verbatim on the membership and sent in the app), a 10-day
 * cooling-off right with a full refund, no term or pack validity longer than a year, and for a fixed term a renewal
 * notice 30 to 90 days before it ends: without a proper notice the membership expires instead of renewing.
 */
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { classBookings, classCharges, classMemberships, classPasses, classProducts, classSessions, locations, merchantMembers, merchants, users } from "@ll/db";
import { classesApi, normalizePhone } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { getPayments } from "../providers/payments.js";
import { iso, loadMerchant, money, paymentsReady } from "./commerceShared.js";
import { getMerchantFeatures, requireFeature } from "./features.js";
import { chargeConnectSavedMethod, chargeModeFor, createConnectPayment, retrieveConnectPayment, savedMethodScope } from "./payments.js";
import {
  addMonths,
  ensurePayerCustomer,
  expirePasses,
  getSettings,
  introEligible,
  myBookingDtos,
  newCharge,
  notify,
  passDto,
  productDto,
  promoteWaitlist,
  refundCharge,
  startPayment,
  taxFor,
  taxLabel,
  type Charge,
  type Membership,
  type Merchant,
  type Pass,
  type Product,
} from "./classes.js";
import { localParts } from "./appointments.js";
import { addDays, zonedToUtc } from "./bookings.js";
import { maskedPhone } from "./serializers.js";
import { findOrCreateCustomerByPhone } from "./ledger.js";
import { parseMemberCode } from "./staff.js";

const MIN_CHARGE_CENTS = 50;
const DAY = 86_400_000;

const todayFor = (ctx: AppContext, merchant: Pick<Merchant, "timezone">) => localParts(ctx.now(), merchant.timezone).date;
const dayOf = (at: Date, merchant: Pick<Merchant, "timezone">) => localParts(at, merchant.timezone).date;
const periodEndFor = (start: string) => addDays(addMonths(start, 1), -1);
const fmtDate = (d: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${d}T12:00:00Z`));

// ---------------------------------------------------------------------------
// Products (merchant)
// ---------------------------------------------------------------------------
export async function listProducts(ctx: AppContext, merchantId: string): Promise<classesApi.ProductsResponse> {
  const rows = await ctx.db.select().from(classProducts).where(eq(classProducts.merchantId, merchantId)).orderBy(asc(classProducts.sort), asc(classProducts.priceCents), asc(classProducts.name));
  const since = new Date(ctx.now().getTime() - 30 * DAY);
  const live = await ctx.db.select({ productId: classMemberships.productId, n: sql<number>`count(*)::int` }).from(classMemberships).where(and(eq(classMemberships.merchantId, merchantId), inArray(classMemberships.status, ["active", "past_due", "frozen"]))).groupBy(classMemberships.productId);
  const sold = await ctx.db.select({ productId: classPasses.productId, n: sql<number>`count(*)::int` }).from(classPasses).where(and(eq(classPasses.merchantId, merchantId), ne(classPasses.status, "pending"), gte(classPasses.createdAt, since))).groupBy(classPasses.productId);
  return { items: await Promise.all(rows.map((p) => productDto(p, { activeCount: Number(live.find((l) => l.productId === p.id)?.n ?? 0), soldLast30: Number(sold.find((l) => l.productId === p.id)?.n ?? 0) }))) };
}

export async function createProduct(ctx: AppContext, merchantId: string, body: z.output<typeof classesApi.createProductBody>): Promise<classesApi.ProductDto> {
  const [p] = await ctx.db.insert(classProducts).values({ merchantId, ...body, description: body.description ?? null, credits: body.credits ?? null, validDays: body.validDays ?? null, termMonths: body.termMonths ?? null, classesPerMonth: body.classesPerMonth ?? null, createdAt: ctx.now(), updatedAt: ctx.now() }).returning();
  return productDto(p!);
}

export async function updateProduct(ctx: AppContext, merchantId: string, id: string, body: z.output<typeof classesApi.updateProductBody>): Promise<classesApi.ProductDto> {
  const set = Object.fromEntries(Object.entries(body).filter(([k, v]) => v !== undefined && k !== "kind"));
  const [p] = await ctx.db.update(classProducts).set({ ...set, updatedAt: ctx.now() }).where(and(eq(classProducts.id, id), eq(classProducts.merchantId, merchantId))).returning();
  if (!p) throw notFound("Offer");
  return productDto(p);
}

async function loadProduct(ctx: AppContext, merchantId: string, id: string, kind?: string | string[]): Promise<Product> {
  const [p] = await ctx.db.select().from(classProducts).where(and(eq(classProducts.id, id), eq(classProducts.merchantId, merchantId), eq(classProducts.active, true))).limit(1);
  if (!p || (kind && ![kind].flat().includes(p.kind))) throw notFound("Offer");
  return p;
}
async function productMerchant(ctx: AppContext, productId: string): Promise<{ product: Product; merchant: Merchant }> {
  const [p] = await ctx.db.select().from(classProducts).where(eq(classProducts.id, productId)).limit(1);
  if (!p || !p.active) throw notFound("Offer");
  const merchant = await loadMerchant(ctx.db, p.merchantId);
  if (!merchant || merchant.status === "closed") throw notFound("Studio");
  return { product: p, merchant };
}

// ---------------------------------------------------------------------------
// The agreement
// ---------------------------------------------------------------------------
/**
 * The written agreement a member reads and accepts. It states what Ontario requires for a personal development
 * services agreement: the studio, the services, the total and the payments, the dates, and how to cancel and renew.
 */
export async function buildAgreement(ctx: AppContext, merchant: Merchant, product: Product, startDate: string, who: string | null): Promise<classesApi.AgreementDto> {
  const st = await getSettings(ctx.db, merchant.id);
  const [loc] = await ctx.db.select({ address: locations.address, city: locations.city }).from(locations).where(eq(locations.merchantId, merchant.id)).orderBy(asc(locations.createdAt)).limit(1);
  const today = todayFor(ctx, merchant);
  const tax = await taxFor(ctx, merchant, product.priceCents, product.taxable);
  const total = product.priceCents + tax;
  const taxName = (await taxLabel(ctx, merchant)).name;
  const termEnd = product.termMonths ? addDays(addMonths(startDate, product.termMonths), -1) : null;
  const coolFrom = startDate > today ? startDate : today;
  const coolUntil = addDays(coolFrom, classesApi.COOLING_OFF_DAYS);
  const services = product.classesPerMonth ? `${product.classesPerMonth} group classes in each monthly period` : "Unlimited group classes";
  const lines = [
    `MEMBERSHIP AGREEMENT`,
    `Studio: ${merchant.name}${loc?.address ? `, ${loc.address}${loc.city ? `, ${loc.city}` : ""}` : ""}`,
    `Member: ${who ?? "you"}`,
    `Services: ${product.name}. ${services}. Classes are booked in the app and are subject to space.`,
    `Price: ${money(product.priceCents)}${tax ? ` + ${money(tax)} ${taxName} = ${money(total)}` : ""} each month.`,
    `Payments: ${money(total)} is charged to your card today for the first month, then on the ${fmtDate(addMonths(startDate, 1)).replace(/,? \d{4}$/, "").split(" ").reverse().join(" ")} of each month. ${product.termMonths ? `${product.termMonths} payments in total.` : "There is no fixed number of payments."}`,
    `Starts: ${fmtDate(startDate)}.`,
    `Term: ${termEnd ? `Fixed term of ${product.termMonths} months, ending ${fmtDate(termEnd)}.` : "Month to month. There is no fixed end date."}`,
    `Cancelling: You can cancel for a full refund within ${classesApi.COOLING_OFF_DAYS} days (until ${fmtDate(coolUntil)}). After that, cancel any time in the app: ${termEnd ? `the membership ends on ${fmtDate(termEnd)} and payments continue until then.` : "it ends after the month you have paid and there are no further payments."}`,
    `Renewal: ${termEnd ? `We send you a renewal notice ${st.renewalNoticeDays} days before the term ends. If you do nothing, it renews for another ${product.termMonths} months at the price in the notice. You can say no in the app. Without that notice it does not renew.` : "It renews every month until you cancel."}`,
    `Freezing: You can freeze for up to ${st.freezeMaxDays} days, ${st.freezesPerYear} time${st.freezesPerYear === 1 ? "" : "s"} a year. You are not charged during a freeze and your dates move by the same number of days.`,
    `Late cancel: Cancel up to ${st.cancelWindowHours} hours before a class for free${st.lateFeeCents ? `. After that, or if you miss it, a ${money(st.lateFeeCents)} fee is charged to your card` : ""}.`,
    ...(st.termsNote ? [`Studio terms: ${st.termsNote}`] : []),
    `Your rights: Ontario's Consumer Protection Act, 2002 applies to this agreement. A copy is kept in the app under Passes.`,
  ];
  const text = lines.join("\n");
  const hash = createHash("sha256").update(`${product.id}|${product.priceCents}|${tax}|${startDate}|${today}|${text}`).digest("hex").slice(0, 32);
  return { text, hash, studio: merchant.name, totalPerPeriodCents: total, taxPerPeriodCents: tax };
}

export async function agreementFor(ctx: AppContext, userId: string, productId: string, startDate?: string): Promise<classesApi.AgreementDto> {
  const { product, merchant } = await productMerchant(ctx, productId);
  if (product.kind !== "membership") throw badRequest("Only a membership has an agreement");
  await requireFeature(ctx.db, merchant, "memberships.recurring");
  const [u] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return buildAgreement(ctx, merchant, product, normalizedStart(ctx, merchant, startDate), u?.name ?? null);
}

function normalizedStart(ctx: AppContext, merchant: Merchant, startDate?: string): string {
  const today = todayFor(ctx, merchant);
  const d = startDate ?? today;
  if (d < today) throw badRequest("The start date has passed");
  if (d > addDays(today, 30)) throw badRequest("Pick a start date within the next 30 days");
  return d;
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
async function usedThisPeriod(ctx: AppContext, merchant: Merchant, m: Membership): Promise<number> {
  if (!m.classesPerMonth || !m.currentPeriodStart || !m.currentPeriodEnd) return 0;
  const startAt = new Date(`${m.currentPeriodStart}T00:00:00Z`);
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(classBookings)
    .innerJoin(classSessions, eq(classSessions.id, classBookings.sessionId))
    .where(and(eq(classBookings.membershipId, m.id), inArray(classBookings.status, ["held", "booked", "attended", "late_cancelled", "no_show"]), gte(classSessions.startsAt, new Date(startAt.getTime() - DAY)), lt(classSessions.startsAt, new Date(new Date(`${addDays(m.currentPeriodEnd, 1)}T00:00:00Z`).getTime() + DAY))));
  void merchant;
  return Number(r?.n ?? 0);
}

export async function membershipDto(ctx: AppContext, m: Membership, merchant: Merchant): Promise<classesApi.MyMembershipDto> {
  const today = todayFor(ctx, merchant);
  const st = await getSettings(ctx.db, merchant.id);
  const tax = await taxFor(ctx, merchant, m.priceCents, m.taxable);
  const [failed] = m.status === "past_due" ? await ctx.db.select({ a: classCharges.amountCents }).from(classCharges).where(and(eq(classCharges.membershipId, m.id), eq(classCharges.status, "failed"))).orderBy(desc(classCharges.createdAt)).limit(1) : [];
  return {
    id: m.id,
    name: m.name,
    status: m.status as classesApi.MembershipStatus,
    priceCents: m.priceCents,
    taxCents: tax,
    totalCents: m.priceCents + tax,
    termMonths: m.termMonths,
    classesPerMonth: m.classesPerMonth,
    usedThisPeriod: await usedThisPeriod(ctx, merchant, m),
    startDate: m.startDate,
    termEndsOn: m.termEndsOn,
    currentPeriodStart: m.currentPeriodStart,
    currentPeriodEnd: m.currentPeriodEnd,
    nextBillingDate: m.status === "cancelled" || m.status === "expired" || (m.cancelEffectiveOn && m.nextBillingDate && m.nextBillingDate >= m.cancelEffectiveOn) ? null : m.nextBillingDate,
    frozenFrom: m.frozenFrom,
    frozenUntil: m.frozenUntil,
    cancelEffectiveOn: m.cancelEffectiveOn,
    coolingOffEndsOn: m.coolingOffEndsOn,
    inCoolingOff: !!m.coolingOffEndsOn && today <= m.coolingOffEndsOn && ["active", "past_due"].includes(m.status) && !m.cancelEffectiveOn,
    card: m.paymentMethodId ? { brand: m.paymentMethodBrand, last4: m.paymentMethodLast4 } : null,
    agreementText: m.agreementText,
    renewalNoticeSentAt: iso(m.renewalNoticeSentAt),
    declineRenewal: m.declineRenewal,
    amountDueCents: failed?.a ?? null,
    canFreeze: m.status === "active" && !m.cancelEffectiveOn && m.freezesUsed < st.freezesPerYear && st.freezesPerYear > 0,
    merchant: { id: merchant.id, name: merchant.name, slug: merchant.slug },
  };
}

export async function myClasses(ctx: AppContext, userId: string, merchantId?: string): Promise<classesApi.MyClassesResponse> {
  const now = ctx.now();
  const mw = merchantId ? eq(classPasses.merchantId, merchantId) : undefined;
  const passes = await ctx.db.select().from(classPasses).where(and(eq(classPasses.userId, userId), inArray(classPasses.status, ["active", "pending"]), mw)).orderBy(asc(classPasses.expiresAt));
  const ms = await ctx.db
    .select()
    .from(classMemberships)
    .where(and(eq(classMemberships.userId, userId), merchantId ? eq(classMemberships.merchantId, merchantId) : undefined, or(inArray(classMemberships.status, ["active", "past_due", "frozen", "pending"]), and(inArray(classMemberships.status, ["cancelled", "expired"]), gte(classMemberships.updatedAt, new Date(now.getTime() - 30 * DAY))))))
    .orderBy(desc(classMemberships.createdAt));
  const bookings = await ctx.db
    .select({ b: classBookings })
    .from(classBookings)
    .innerJoin(classSessions, eq(classSessions.id, classBookings.sessionId))
    .where(and(eq(classBookings.userId, userId), merchantId ? eq(classBookings.merchantId, merchantId) : undefined, inArray(classBookings.status, ["held", "booked", "waitlisted"]), gte(classSessions.endsAt, now)))
    .orderBy(asc(classSessions.startsAt))
    .limit(50);
  const merchantsById = new Map<string, Merchant>();
  for (const m of ms) if (!merchantsById.has(m.merchantId)) merchantsById.set(m.merchantId, (await loadMerchant(ctx.db, m.merchantId))!);
  return {
    passes: await Promise.all(passes.map((p) => passDto(ctx, p))),
    memberships: await Promise.all(ms.map((m) => membershipDto(ctx, m, merchantsById.get(m.merchantId)!))),
    bookings: await myBookingDtos(ctx, bookings.map((x) => x.b)),
    introEligible: merchantId ? await introEligible(ctx, userId, merchantId) : true,
  };
}

// ---------------------------------------------------------------------------
// Buying a pack or an intro offer
// ---------------------------------------------------------------------------
export async function purchasePack(ctx: AppContext, userId: string, productId: string): Promise<classesApi.PurchaseResponse> {
  const { product, merchant } = await productMerchant(ctx, productId);
  if (product.kind !== "pack") throw badRequest("This offer is not a pack");
  await requireFeature(ctx.db, merchant, "booking.classes");
  if (product.introOnly && !(await introEligible(ctx, userId, merchant.id))) throw new HttpError(409, "intro_used", "The intro offer is for new students. You can buy a pack or a membership instead.");
  const now = ctx.now();
  const days = Math.min(product.validDays ?? 90, classesApi.MAX_PACK_VALID_DAYS);
  const free = product.priceCents < MIN_CHARGE_CENTS;
  if (!free && !(await paymentsReady(ctx.db, merchant))) throw conflict("This studio can't take card payments yet");
  const [pass] = await ctx.db
    .insert(classPasses)
    .values({ merchantId: merchant.id, userId, productId: product.id, name: product.name, creditsTotal: product.credits ?? 1, creditsLeft: product.credits ?? 1, expiresAt: new Date(now.getTime() + days * DAY), introOffer: product.introOnly, status: free ? "active" : "pending", createdAt: now, updatedAt: now })
    .returning();
  const charge = await newCharge(ctx, merchant, userId, { kind: "pack", subtotalCents: product.priceCents, taxable: product.taxable, passId: pass!.id, ...(free ? { manual: "comp" } : {}) });
  if (free) return { pass: await passDto(ctx, pass!), payment: null };
  try {
    const customerId = await ensurePayerCustomer(ctx, merchant, userId);
    const payment = await startPayment(ctx, merchant, charge, customerId, `${merchant.name}: ${product.name}`);
    return { pass: await passDto(ctx, pass!), payment };
  } catch (err) {
    await ctx.db.update(classPasses).set({ status: "refunded", updatedAt: now }).where(eq(classPasses.id, pass!.id));
    throw err;
  }
}

/** Desk sale of a pack or intro offer: paid by hand (cash, e-transfer, card reader), so no platform fee. */
export async function recordSale(ctx: AppContext, staff: StaffContext, body: z.output<typeof classesApi.recordSaleBody>): Promise<classesApi.MyPassDto> {
  const merchant = staff.merchant;
  // A drop-in sold at the desk is a one-class pass, used by the check-in that follows.
  const product = await loadProduct(ctx, merchant.id, body.productId, ["pack", "drop_in"]);
  let userId: string;
  if (body.memberId) {
    const [m] = await ctx.db.select({ userId: merchantMembers.userId }).from(merchantMembers).where(and(eq(merchantMembers.id, body.memberId), eq(merchantMembers.merchantId, merchant.id))).limit(1);
    if (!m) throw notFound("Member");
    userId = m.userId;
  } else if (body.memberCode) {
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.memberCode, parseMemberCode(body.memberCode)), isNull(users.deletedAt))).limit(1);
    if (!u) throw notFound("Member code");
    userId = u.id;
  } else {
    const phone = normalizePhone(body.phone ?? "");
    if (!phone) throw badRequest("Enter a valid phone number");
    userId = (await findOrCreateCustomerByPhone(ctx.db, phone, body.customerName ?? null)).user.id;
  }
  if (product.introOnly && !(await introEligible(ctx, userId, merchant.id))) throw new HttpError(409, "intro_used", "The intro offer is for new students.");
  const now = ctx.now();
  const [pass] = await ctx.db
    .insert(classPasses)
    .values({ merchantId: merchant.id, userId, productId: product.id, name: product.name, creditsTotal: product.credits ?? 1, creditsLeft: product.credits ?? 1, expiresAt: new Date(now.getTime() + Math.min(product.validDays ?? 90, classesApi.MAX_PACK_VALID_DAYS) * DAY), introOffer: product.introOnly, status: "active", createdAt: now, updatedAt: now })
    .returning();
  await newCharge(ctx, merchant, userId, { kind: "pack", subtotalCents: product.priceCents, taxable: product.taxable, passId: pass!.id, manual: body.method });
  return passDto(ctx, pass!);
}

// ---------------------------------------------------------------------------
// Joining a membership
// ---------------------------------------------------------------------------
export async function joinMembership(ctx: AppContext, userId: string, body: z.output<typeof classesApi.joinMembershipBody>): Promise<classesApi.JoinMembershipResponse> {
  const { product, merchant } = await productMerchant(ctx, body.productId);
  if (product.kind !== "membership") throw badRequest("This offer is not a membership");
  await requireFeature(ctx.db, merchant, "memberships.recurring");
  if (!(await paymentsReady(ctx.db, merchant))) throw conflict("This studio can't take card payments yet");
  const startDate = normalizedStart(ctx, merchant, body.startDate);
  const [u] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const agreement = await buildAgreement(ctx, merchant, product, startDate, u?.name ?? null);
  if (agreement.hash !== body.agreementHash) throw new HttpError(409, "agreement_changed", "The agreement changed since you opened it. Read it again before you pay.");
  const [live] = await ctx.db.select({ id: classMemberships.id }).from(classMemberships).where(and(eq(classMemberships.userId, userId), eq(classMemberships.merchantId, merchant.id), inArray(classMemberships.status, ["pending", "active", "past_due", "frozen"]))).limit(1);
  if (live) throw conflict("You already have a membership here. Open Passes to manage it.");
  const now = ctx.now();
  const today = todayFor(ctx, merchant);
  const [m] = await ctx.db
    .insert(classMemberships)
    .values({
      merchantId: merchant.id,
      userId,
      productId: product.id,
      name: product.name,
      status: "pending",
      priceCents: product.priceCents,
      taxable: product.taxable,
      termMonths: product.termMonths,
      classesPerMonth: product.classesPerMonth,
      startDate,
      termEndsOn: product.termMonths ? addDays(addMonths(startDate, product.termMonths), -1) : null,
      agreementText: agreement.text,
      agreementAcceptedAt: now,
      coolingOffEndsOn: addDays(startDate > today ? startDate : today, classesApi.COOLING_OFF_DAYS),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const charge = await ensureCharge(ctx, merchant, m!, startDate);
  try {
    const customerId = await ensurePayerCustomer(ctx, merchant, userId);
    await ctx.db.update(classMemberships).set({ stripeCustomerId: customerId }).where(eq(classMemberships.id, m!.id));
    const payment = await startPayment(ctx, merchant, charge, customerId, `${merchant.name}: ${product.name} ${charge.periodStart}`);
    const [fresh] = await ctx.db.select().from(classMemberships).where(eq(classMemberships.id, m!.id)).limit(1);
    return { membership: await membershipDto(ctx, fresh!, merchant), payment };
  } catch (err) {
    await ctx.db.update(classMemberships).set({ status: "cancelled", cancelledAt: now, cancelReason: "payment_setup_failed", cancelledBy: "studio", updatedAt: now }).where(eq(classMemberships.id, m!.id));
    throw err;
  }
}

/** The charge for one period; never creates a second for the same start day. */
async function ensureCharge(ctx: AppContext, merchant: Merchant, m: Membership, periodStart: string): Promise<Charge> {
  const [existing] = await ctx.db.select().from(classCharges).where(and(eq(classCharges.membershipId, m.id), eq(classCharges.periodStart, periodStart))).limit(1);
  if (existing) return existing;
  try {
    return await newCharge(ctx, merchant, m.userId, { kind: "membership", subtotalCents: m.priceCents, taxable: m.taxable, membershipId: m.id, periodStart, periodEnd: periodEndFor(periodStart) });
  } catch {
    const [again] = await ctx.db.select().from(classCharges).where(and(eq(classCharges.membershipId, m.id), eq(classCharges.periodStart, periodStart))).limit(1);
    if (again) return again;
    throw new Error("could not create the membership charge");
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export interface PaidWith {
  paymentMethodId?: string | null;
  customerId?: string | null;
  errorCode?: string | null;
}

/** Webhook entry (payment_intent.* with ll_kind "class"): packs, drop-ins, membership periods and late fees. */
export async function onClassPayment(ctx: AppContext, chargeId: string, paymentIntentId: string, outcome: "succeeded" | "failed" | "processing", paid: PaidWith = {}): Promise<void> {
  const [charge] = await ctx.db.select().from(classCharges).where(eq(classCharges.id, chargeId)).limit(1);
  if (!charge) return;
  if (outcome === "succeeded") return settle(ctx, charge, paymentIntentId, paid);
  if (charge.status === "paid" || charge.status === "refunded") return;
  if (outcome === "processing") {
    if (charge.status === "pending") await ctx.db.update(classCharges).set({ status: "processing", stripePaymentIntentId: paymentIntentId }).where(and(eq(classCharges.id, chargeId), eq(classCharges.status, "pending")));
    return;
  }
  if (charge.stripePaymentIntentId && charge.stripePaymentIntentId !== paymentIntentId) return; // an older attempt
  if (paid.errorCode === "authentication_required") return; // the customer confirms it
  if (charge.status === "failed" && charge.stripePaymentIntentId === paymentIntentId) return;
  await failCharge(ctx, charge, paymentIntentId);
}

async function settle(ctx: AppContext, charge: Charge, paymentIntentId: string | null, paid: PaidWith): Promise<void> {
  if (charge.status === "paid" || charge.status === "refunded") return;
  const now = ctx.now();
  const [done] = await ctx.db.update(classCharges).set({ status: "paid", paidAt: now, paymentMethod: "card", ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}) }).where(and(eq(classCharges.id, charge.id), ne(classCharges.status, "paid"))).returning();
  if (!done) return;
  const merchant = await loadMerchant(ctx.db, charge.merchantId);
  if (!merchant) return;
  if (charge.kind === "pack" && charge.passId) {
    const activated = await ctx.db.update(classPasses).set({ status: "active", updatedAt: now }).where(and(eq(classPasses.id, charge.passId), eq(classPasses.status, "pending"))).returning({ id: classPasses.id });
    // Paid after the customer cancelled the unpaid pack (the payment raced the cancel): give it back.
    if (!activated.length) {
      const [p] = await ctx.db.select({ status: classPasses.status }).from(classPasses).where(eq(classPasses.id, charge.passId)).limit(1);
      if (p?.status === "refunded") await refundCharge(ctx, merchant, { chargeId: charge.id, kind: "pack" });
    }
  } else if (charge.kind === "drop_in" && charge.bookingId) {
    await confirmDropIn(ctx, merchant, charge);
  } else if (charge.kind === "membership" && charge.membershipId) {
    await settleMembershipCharge(ctx, merchant, charge, paid);
  }
}

/** The drop-in is paid: the held spot is booked, unless the hold lapsed and the class filled up (then it is refunded). */
async function confirmDropIn(ctx: AppContext, merchant: Merchant, charge: Charge): Promise<void> {
  const [b] = await ctx.db.select().from(classBookings).where(eq(classBookings.id, charge.bookingId!)).limit(1);
  if (!b) return;
  const now = ctx.now();
  if (b.status === "held" || b.status === "cancelled") {
    const [s] = await ctx.db.select().from(classSessions).where(eq(classSessions.id, b.sessionId)).limit(1);
    const [taken] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(classBookings).where(and(eq(classBookings.sessionId, b.sessionId), inArray(classBookings.status, ["booked", "attended", "held"]), ne(classBookings.id, b.id)));
    if (s && s.status === "scheduled" && Number(taken?.n ?? 0) < s.capacity) {
      await ctx.db.update(classBookings).set({ status: "booked", holdExpiresAt: null, updatedAt: now }).where(eq(classBookings.id, b.id));
      await notify(ctx, merchant, b.userId, "booked", { name: s.name, when: new Intl.DateTimeFormat("en-CA", { timeZone: merchant.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(s.startsAt), until: "" }, { type: "class_booked", sessionId: s.id });
      return;
    }
    await ctx.db.update(classBookings).set({ status: "cancelled", cancelledAt: now, holdExpiresAt: null, creditReturned: true, updatedAt: now }).where(eq(classBookings.id, b.id));
    await refundCharge(ctx, merchant, { chargeId: charge.id, kind: "drop_in" });
  }
}

async function failCharge(ctx: AppContext, charge: Charge, paymentIntentId: string): Promise<void> {
  await ctx.db.update(classCharges).set({ status: "failed", stripePaymentIntentId: paymentIntentId }).where(eq(classCharges.id, charge.id));
  const merchant = await loadMerchant(ctx.db, charge.merchantId);
  if (!merchant) return;
  if (charge.kind === "membership" && charge.membershipId) {
    const [m] = await ctx.db.select().from(classMemberships).where(eq(classMemberships.id, charge.membershipId)).limit(1);
    if (!m || m.status === "cancelled" || m.status === "expired") return;
    // A first payment that bounced stays pending (nothing was ever active); a renewal makes the membership past due.
    if (m.status === "active") await ctx.db.update(classMemberships).set({ status: "past_due", updatedAt: ctx.now() }).where(eq(classMemberships.id, m.id));
    await notify(ctx, merchant, m.userId, "paymentFailed", { offer: m.name, amount: money(charge.amountCents) }, { type: "class_payment_failed", membershipId: m.id }, { sms: true });
  } else if (charge.kind === "drop_in" && charge.bookingId) {
    await ctx.db.update(classBookings).set({ status: "cancelled", cancelledAt: ctx.now(), holdExpiresAt: null, updatedAt: ctx.now() }).where(and(eq(classBookings.id, charge.bookingId), eq(classBookings.status, "held")));
  } else if (charge.kind === "pack" && charge.passId) {
    await ctx.db.update(classPasses).set({ status: "refunded", updatedAt: ctx.now() }).where(and(eq(classPasses.id, charge.passId), eq(classPasses.status, "pending")));
  }
}

async function settleMembershipCharge(ctx: AppContext, merchant: Merchant, charge: Charge, paid: PaidWith): Promise<void> {
  const [m] = await ctx.db.select().from(classMemberships).where(eq(classMemberships.id, charge.membershipId!)).limit(1);
  if (!m) return;
  const now = ctx.now();
  if (m.status === "cancelled" || m.status === "expired") {
    // Paid after cancelling (it raced the cancel): give it back.
    await refundCharge(ctx, merchant, { chargeId: charge.id, kind: "membership" });
    return;
  }
  const first = m.status === "pending";
  const advance = !m.currentPeriodStart || (charge.periodStart ?? "") >= m.currentPeriodStart;
  await ctx.db
    .update(classMemberships)
    .set({
      status: m.status === "pending" || m.status === "past_due" ? "active" : m.status,
      ...(advance && charge.periodStart && charge.periodEnd ? { currentPeriodStart: charge.periodStart, currentPeriodEnd: charge.periodEnd, nextBillingDate: addDays(charge.periodEnd, 1) } : {}),
      updatedAt: now,
    })
    .where(eq(classMemberships.id, m.id));
  // The card the customer paid with becomes the card on file for renewals.
  if (paid.paymentMethodId && paid.paymentMethodId !== m.paymentMethodId && paid.customerId && (!m.stripeCustomerId || paid.customerId === m.stripeCustomerId)) {
    await saveMethod(ctx, merchant, m.id, paid.paymentMethodId, paid.customerId);
  }
  if (first) {
    await notify(ctx, merchant, m.userId, "agreement", { offer: m.name, amount: money(charge.amountCents), until: fmtDate(m.coolingOffEndsOn ?? todayFor(ctx, merchant)) }, { type: "class_agreement", membershipId: m.id });
  } else {
    await notify(ctx, merchant, m.userId, "renewalPaid", { offer: m.name, amount: money(charge.amountCents), next: charge.periodEnd ? fmtDate(addDays(charge.periodEnd, 1)) : "" }, { type: "class_renewal_paid", membershipId: m.id });
  }
}

async function saveMethod(ctx: AppContext, merchant: Merchant, membershipId: string, paymentMethodId: string, customerId?: string | null): Promise<void> {
  const info = await getPayments(ctx).retrievePaymentMethod(paymentMethodId, savedMethodScope(ctx, merchant)).catch(() => null);
  await ctx.db.update(classMemberships).set({ paymentMethodId, paymentMethodBrand: info?.brand ?? null, paymentMethodLast4: info?.last4 ?? null, ...(customerId ? { stripeCustomerId: customerId } : {}), updatedAt: ctx.now() }).where(eq(classMemberships.id, membershipId));
}

/** Webhook entry (setup_intent.succeeded with ll_kind "class_setup"): the new method becomes the card on file, and an unpaid period is tried again at once. */
export async function onClassSetup(ctx: AppContext, membershipId: string, setupIntentId: string, paymentMethodId: string): Promise<void> {
  const [m] = await ctx.db.select().from(classMemberships).where(eq(classMemberships.id, membershipId)).limit(1);
  if (!m || m.status === "cancelled" || m.status === "expired") return;
  const merchant = await loadMerchant(ctx.db, m.merchantId);
  if (!merchant) return;
  if (m.paymentMethodId !== paymentMethodId) await saveMethod(ctx, merchant, m.id, paymentMethodId);
  void setupIntentId;
  if (m.status === "past_due") {
    const [failed] = await ctx.db.select().from(classCharges).where(and(eq(classCharges.membershipId, m.id), eq(classCharges.status, "failed"))).orderBy(desc(classCharges.createdAt)).limit(1);
    const [fresh] = await ctx.db.select().from(classMemberships).where(eq(classMemberships.id, m.id)).limit(1);
    if (failed && fresh?.paymentMethodId && fresh.stripeCustomerId) await chargeSaved(ctx, merchant, fresh, failed, `retry:${setupIntentId}`);
  }
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
async function chargeSaved(ctx: AppContext, merchant: Merchant, m: Membership, charge: Charge, attemptKey: string): Promise<"succeeded" | "processing" | "authentication_required" | "declined"> {
  const r = await chargeConnectSavedMethod(ctx, merchant, {
    amountCents: charge.amountCents,
    connectedAccountId: merchant.stripeAccountId!,
    applicationFeeCents: charge.platformFeeCents,
    description: `${merchant.name}: ${m.name} ${charge.periodStart}`,
    metadata: { ll_kind: "class", ll_id: charge.id, merchant_id: merchant.id },
    idempotencyKey: `class:${charge.id}:off:${attemptKey}${chargeModeFor(ctx, merchant) === "direct" ? ":direct" : ""}`,
    customerId: m.stripeCustomerId!,
    paymentMethodId: m.paymentMethodId!,
  });
  await ctx.db.update(classCharges).set({ stripePaymentIntentId: r.intent.id, status: r.outcome === "processing" ? "processing" : "pending", attempts: sql`${classCharges.attempts} + 1`, lastAttemptOn: todayFor(ctx, merchant) }).where(eq(classCharges.id, charge.id));
  if (r.outcome === "succeeded") await settle(ctx, { ...charge, status: "pending" }, r.intent.id, { paymentMethodId: m.paymentMethodId, customerId: m.stripeCustomerId });
  else if (r.outcome === "declined") await failCharge(ctx, { ...charge, status: "pending" }, r.intent.id);
  else if (r.outcome === "authentication_required") await notify(ctx, merchant, m.userId, "paymentFailed", { offer: m.name, amount: money(charge.amountCents) }, { type: "class_payment_failed", membershipId: m.id }, { sms: true });
  return r.outcome;
}

/** Retry days for a failed period: the second and the fifth day after it was due. */
const RETRY_OFFSETS = [2, 5];

/**
 * The daily billing pass (every step idempotent, so it can run every few minutes): finish cancellations that reached
 * their date, renew or expire fixed terms, and charge each period that is due. Returns counts for the job log.
 */
export async function rollBilling(ctx: AppContext): Promise<{ charged: number; cancelled: number; expired: number; renewed: number; errors: number }> {
  const out = { charged: 0, cancelled: 0, expired: 0, renewed: 0, errors: 0 };
  const rows = await ctx.db
    .select({ m: classMemberships, merchant: merchants })
    .from(classMemberships)
    .innerJoin(merchants, eq(merchants.id, classMemberships.merchantId))
    .where(and(inArray(classMemberships.status, ["active", "past_due"]), isNull(classMemberships.cancelledAt), sql`${classMemberships.nextBillingDate} is not null`));
  for (const { m, merchant } of rows) {
    try {
      const today = todayFor(ctx, merchant);
      const due = m.nextBillingDate!;
      if (due > today) continue;
      if (m.cancelEffectiveOn && due >= m.cancelEffectiveOn) {
        await ctx.db.update(classMemberships).set({ status: "cancelled", cancelledAt: ctx.now(), cancelledBy: m.cancelledBy ?? "member", updatedAt: ctx.now() }).where(eq(classMemberships.id, m.id));
        await notify(ctx, merchant, m.userId, "membershipEnded", { offer: m.name }, { type: "class_membership_ended", membershipId: m.id });
        out.cancelled++;
        continue;
      }
      let cur = m;
      if (m.termEndsOn && due > m.termEndsOn) {
        const noticeOk = !!m.renewalNoticeSentAt && dayOf(m.renewalNoticeSentAt, merchant) <= addDays(m.termEndsOn, -classesApi.RENEWAL_NOTICE_MIN_DAYS);
        if (!noticeOk || m.declineRenewal || !m.termMonths) {
          await ctx.db.update(classMemberships).set({ status: "expired", updatedAt: ctx.now() }).where(eq(classMemberships.id, m.id));
          await notify(ctx, merchant, m.userId, "membershipEnded", { offer: m.name }, { type: "class_membership_ended", membershipId: m.id });
          out.expired++;
          continue;
        }
        const newEnd = addDays(addMonths(m.termEndsOn, m.termMonths), 0);
        const [u] = await ctx.db.update(classMemberships).set({ termEndsOn: newEnd, renewalNoticeSentAt: null, declineRenewal: false, freezesUsed: 0, updatedAt: ctx.now() }).where(eq(classMemberships.id, m.id)).returning();
        cur = u!;
        out.renewed++;
      }
      const charge = await ensureCharge(ctx, merchant, cur, due);
      if (charge.status === "paid" || charge.status === "refunded" || charge.status === "processing") continue;
      const attempted = charge.attempts > 0;
      if (attempted) {
        // Already tried: retry only on the retry days, up to three attempts in all, and only a failed charge.
        const offset = RETRY_OFFSETS[charge.attempts - 1];
        if (charge.status !== "failed" || offset === undefined || today < addDays(due, offset) || charge.lastAttemptOn === today) continue;
      }
      if (cur.paymentMethodId && cur.stripeCustomerId && merchant.stripeAccountId && charge.amountCents >= MIN_CHARGE_CENTS) {
        await chargeSaved(ctx, merchant, cur, charge, String(charge.attempts));
        out.charged++;
      } else if (!charge.stripePaymentIntentId && merchant.stripeAccountId && charge.amountCents >= MIN_CHARGE_CENTS) {
        // No saved card (it was reset): the member pays this period in the app.
        const customerId = await ensurePayerCustomer(ctx, merchant, cur.userId, cur.stripeCustomerId);
        await startPayment(ctx, merchant, charge, customerId, `${merchant.name}: ${cur.name} ${charge.periodStart}`);
        await ctx.db.update(classCharges).set({ attempts: 1, lastAttemptOn: today }).where(eq(classCharges.id, charge.id));
        await ctx.db.update(classMemberships).set({ status: "past_due", updatedAt: ctx.now() }).where(and(eq(classMemberships.id, cur.id), eq(classMemberships.status, "active")));
        await notify(ctx, merchant, cur.userId, "paymentFailed", { offer: cur.name, amount: money(charge.amountCents) }, { type: "class_payment_failed", membershipId: cur.id }, { sms: true });
        out.charged++;
      }
    } catch (err) {
      out.errors++;
      if (ctx.config.env !== "test") console.error("[class billing]", m.id, err);
    }
  }
  return out;
}

/** Start and end freezes, send fixed-term renewal notices, mark expired packs. */
export async function runDaily(ctx: AppContext): Promise<{ frozen: number; thawed: number; notices: number; billing: Awaited<ReturnType<typeof rollBilling>> }> {
  const out = { frozen: 0, thawed: 0, notices: 0 };
  const all = await ctx.db.select({ m: classMemberships, merchant: merchants }).from(classMemberships).innerJoin(merchants, eq(merchants.id, classMemberships.merchantId)).where(inArray(classMemberships.status, ["active", "frozen"]));
  for (const { m, merchant } of all) {
    const today = todayFor(ctx, merchant);
    if (m.status === "active" && m.frozenFrom && m.frozenUntil && m.frozenFrom <= today && today < m.frozenUntil) {
      await ctx.db.update(classMemberships).set({ status: "frozen", updatedAt: ctx.now() }).where(eq(classMemberships.id, m.id));
      out.frozen++;
    } else if (m.status === "frozen" && (!m.frozenUntil || m.frozenUntil <= today)) {
      await ctx.db.update(classMemberships).set({ status: "active", frozenFrom: null, frozenUntil: null, updatedAt: ctx.now() }).where(eq(classMemberships.id, m.id));
      out.thawed++;
    }
    if (m.status === "active" && m.termEndsOn && !m.renewalNoticeSentAt && !m.cancelEffectiveOn) {
      const st = await getSettings(ctx.db, merchant.id);
      if (today >= addDays(m.termEndsOn, -st.renewalNoticeDays) && today <= m.termEndsOn) {
        const [claimed] = await ctx.db.update(classMemberships).set({ renewalNoticeSentAt: ctx.now(), updatedAt: ctx.now() }).where(and(eq(classMemberships.id, m.id), isNull(classMemberships.renewalNoticeSentAt))).returning();
        if (claimed) {
          await notify(ctx, merchant, m.userId, "renewalNotice", { offer: m.name, end: fmtDate(m.termEndsOn), months: m.termMonths ?? 1, amount: money(m.priceCents) }, { type: "class_renewal_notice", membershipId: m.id });
          out.notices++;
        }
      }
    }
  }
  await expirePasses(ctx);
  return { ...out, billing: await rollBilling(ctx) };
}

// ---------------------------------------------------------------------------
// Member actions
// ---------------------------------------------------------------------------
async function myMembership(ctx: AppContext, userId: string, id: string): Promise<{ m: Membership; merchant: Merchant }> {
  const [m] = await ctx.db.select().from(classMemberships).where(and(eq(classMemberships.id, id), eq(classMemberships.userId, userId))).limit(1);
  if (!m) throw notFound("Membership");
  return { m, merchant: (await loadMerchant(ctx.db, m.merchantId))! };
}

async function freezeCore(ctx: AppContext, merchant: Merchant, m: Membership, days: number, startDate: string | undefined, enforce: boolean): Promise<Membership> {
  if (m.status !== "active") throw conflict(`A ${m.status.replace("_", " ")} membership can't be frozen`);
  if (m.cancelEffectiveOn) throw conflict("This membership is ending, so it can't be frozen");
  const st = await getSettings(ctx.db, merchant.id);
  if (enforce) {
    if (days > st.freezeMaxDays) throw conflict(`A freeze can be at most ${st.freezeMaxDays} days`);
    if (m.freezesUsed >= st.freezesPerYear) throw conflict("You have used every freeze this year");
  }
  const today = todayFor(ctx, merchant);
  const from = startDate ?? today;
  if (from < today || from > addDays(today, 14)) throw badRequest("A freeze can start today or within two weeks");
  const until = addDays(from, days);
  const now = ctx.now();
  const [row] = await ctx.db
    .update(classMemberships)
    .set({
      frozenFrom: from,
      frozenUntil: until,
      status: from <= today ? "frozen" : "active",
      freezesUsed: m.freezesUsed + 1,
      // The paid time and the term move by the length of the freeze, and nothing is billed while it lasts.
      ...(m.nextBillingDate ? { nextBillingDate: addDays(m.nextBillingDate, days) } : {}),
      ...(m.currentPeriodEnd ? { currentPeriodEnd: addDays(m.currentPeriodEnd, days) } : {}),
      ...(m.termEndsOn ? { termEndsOn: addDays(m.termEndsOn, days) } : {}),
      updatedAt: now,
    })
    .where(and(eq(classMemberships.id, m.id), eq(classMemberships.status, "active")))
    .returning();
  if (!row) throw conflict("This membership was just updated. Refresh and try again.");
  // Classes booked inside the freeze are released (nothing to refund: a membership pays nothing per class).
  const fromAt = new Date(`${from}T00:00:00Z`);
  const untilAt = new Date(`${until}T23:59:59Z`);
  const inside = await ctx.db
    .select({ id: classBookings.id, sessionId: classBookings.sessionId })
    .from(classBookings)
    .innerJoin(classSessions, eq(classSessions.id, classBookings.sessionId))
    .where(and(eq(classBookings.membershipId, m.id), eq(classBookings.status, "booked"), gte(classSessions.startsAt, fromAt), lte(classSessions.startsAt, untilAt)));
  for (const b of inside) {
    await ctx.db.update(classBookings).set({ status: "cancelled", cancelledAt: now, creditReturned: true, updatedAt: now }).where(eq(classBookings.id, b.id));
    await promoteWaitlist(ctx, b.sessionId).catch(() => undefined);
  }
  await notify(ctx, merchant, m.userId, "frozen", { offer: m.name, from: fmtDate(from), until: fmtDate(until) }, { type: "class_frozen", membershipId: m.id });
  return row;
}

export async function freezeMine(ctx: AppContext, userId: string, id: string, body: z.output<typeof classesApi.freezeBody>): Promise<classesApi.MembershipChangeResponse> {
  const { m, merchant } = await myMembership(ctx, userId, id);
  const row = await freezeCore(ctx, merchant, m, body.days, body.startDate, true);
  return { membership: await membershipDto(ctx, row, merchant) };
}

/**
 * Cancel. Inside the 10-day cooling-off window it ends now and everything paid goes back. After that a month-to-month
 * membership ends after the month already paid; a fixed term ends on its last day and payments continue until then.
 */
async function cancelCore(ctx: AppContext, merchant: Merchant, m: Membership, opts: { by: "member" | "studio"; reason?: string; effective?: "now" | "period_end"; refundLast?: boolean }): Promise<{ row: Membership; refundedCents: number }> {
  if (m.status === "cancelled" || m.status === "expired") throw conflict("This membership has already ended");
  const now = ctx.now();
  const today = todayFor(ctx, merchant);
  const inCooling = opts.by === "member" && !!m.coolingOffEndsOn && today <= m.coolingOffEndsOn && !m.cancelEffectiveOn && (m.status === "active" || m.status === "past_due");
  let refunded = 0;
  let effectiveNow = inCooling || m.status === "pending";
  let cancelEffectiveOn: string | null = null;
  if (!effectiveNow) {
    if (opts.by === "studio" && opts.effective === "now") effectiveNow = true;
    else {
      const periodEndNext = m.currentPeriodEnd ? addDays(m.currentPeriodEnd, 1) : today;
      cancelEffectiveOn = m.termEndsOn && m.termEndsOn >= (m.currentPeriodEnd ?? today) && opts.by === "member" ? addDays(m.termEndsOn, 1) : periodEndNext;
      if (cancelEffectiveOn <= today) effectiveNow = true;
    }
  }
  if (inCooling) {
    const paid = await ctx.db.select().from(classCharges).where(and(eq(classCharges.membershipId, m.id), eq(classCharges.status, "paid"), eq(classCharges.kind, "membership")));
    for (const c of paid) refunded += await refundCharge(ctx, merchant, { chargeId: c.id, kind: "membership" });
  } else if (opts.refundLast && opts.by === "studio") {
    const [last] = await ctx.db.select().from(classCharges).where(and(eq(classCharges.membershipId, m.id), eq(classCharges.status, "paid"), eq(classCharges.kind, "membership"))).orderBy(desc(classCharges.periodStart)).limit(1);
    if (last) refunded += await refundCharge(ctx, merchant, { chargeId: last.id, kind: "membership" });
  }
  const [row] = await ctx.db
    .update(classMemberships)
    .set(
      effectiveNow
        ? { status: "cancelled", cancelledAt: now, cancelledBy: inCooling ? "cooling_off" : opts.by, cancelReason: opts.reason ?? null, cancelEffectiveOn: null, updatedAt: now }
        : { cancelEffectiveOn, cancelledBy: opts.by, cancelReason: opts.reason ?? null, updatedAt: now },
    )
    .where(eq(classMemberships.id, m.id))
    .returning();
  if (effectiveNow) {
    // Release the classes still booked on it (a membership holds no credit to give back).
    const future = await ctx.db.select({ id: classBookings.id, sessionId: classBookings.sessionId }).from(classBookings).innerJoin(classSessions, eq(classSessions.id, classBookings.sessionId)).where(and(eq(classBookings.membershipId, m.id), eq(classBookings.status, "booked"), gte(classSessions.startsAt, now)));
      for (const b of future) {
      await ctx.db.update(classBookings).set({ status: "cancelled", cancelledAt: now, creditReturned: true, updatedAt: now }).where(eq(classBookings.id, b.id));
      await promoteWaitlist(ctx, b.sessionId).catch(() => undefined);
    }
    if (inCooling) await notify(ctx, merchant, m.userId, "coolingOff", { offer: m.name, amount: money(refunded) }, { type: "class_cooling_off", membershipId: m.id });
    else await notify(ctx, merchant, m.userId, "membershipEnded", { offer: m.name }, { type: "class_membership_ended", membershipId: m.id });
  } else {
    await notify(ctx, merchant, m.userId, "cancelScheduled", { offer: m.name, date: fmtDate(addDays(cancelEffectiveOn!, -1)) }, { type: "class_cancel_scheduled", membershipId: m.id });
  }
  return { row: row!, refundedCents: refunded };
}

export async function cancelMine(ctx: AppContext, userId: string, id: string, body: z.output<typeof classesApi.cancelMembershipBody>): Promise<classesApi.MembershipChangeResponse> {
  const { m, merchant } = await myMembership(ctx, userId, id);
  const r = await cancelCore(ctx, merchant, m, { by: "member", reason: body.reason });
  return { membership: await membershipDto(ctx, r.row, merchant), refundedCents: r.refundedCents };
}

/** Undo a scheduled cancellation while it has not taken effect (the member changed their mind). */
export async function keepMine(ctx: AppContext, userId: string, id: string): Promise<classesApi.MembershipChangeResponse> {
  const { m, merchant } = await myMembership(ctx, userId, id);
  if (!m.cancelEffectiveOn || m.status === "cancelled" || m.status === "expired") throw conflict("This membership is not ending");
  const [row] = await ctx.db.update(classMemberships).set({ cancelEffectiveOn: null, cancelledBy: null, cancelReason: null, updatedAt: ctx.now() }).where(eq(classMemberships.id, m.id)).returning();
  return { membership: await membershipDto(ctx, row!, merchant) };
}

/** "Do not renew" for a fixed term: it ends on its last day instead of renewing. */
export async function declineRenewalMine(ctx: AppContext, userId: string, id: string, decline = true): Promise<classesApi.MembershipChangeResponse> {
  const { m, merchant } = await myMembership(ctx, userId, id);
  if (!m.termEndsOn) throw conflict("Only a fixed-term membership renews");
  const [row] = await ctx.db.update(classMemberships).set({ declineRenewal: decline, updatedAt: ctx.now() }).where(eq(classMemberships.id, m.id)).returning();
  return { membership: await membershipDto(ctx, row!, merchant) };
}

/** Pay a failed or open period now (the card was declined, or the saved card was reset). */
export async function payMine(ctx: AppContext, userId: string, id: string): Promise<classesApi.PurchaseResponse> {
  const { m, merchant } = await myMembership(ctx, userId, id);
  if (m.status === "cancelled" || m.status === "expired") throw conflict("This membership has ended");
  const [charge] = await ctx.db.select().from(classCharges).where(and(eq(classCharges.membershipId, m.id), inArray(classCharges.status, ["failed", "pending", "processing"]))).orderBy(desc(classCharges.periodStart)).limit(1);
  if (!charge) throw conflict("Nothing is due");
  if (charge.status === "processing") throw conflict("Your bank payment is still processing. It can take a few business days.");
  let payment: classesApi.PaymentRefDto;
  if (charge.status === "pending" && charge.stripePaymentIntentId) {
    const pi = await retrieveConnectPayment(ctx, merchant, charge.stripePaymentIntentId);
    payment = { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
  } else {
    const customerId = await ensurePayerCustomer(ctx, merchant, userId, m.stripeCustomerId);
    if (!m.stripeCustomerId) await ctx.db.update(classMemberships).set({ stripeCustomerId: customerId }).where(eq(classMemberships.id, m.id));
    payment = await startPayment(ctx, merchant, charge, customerId, `${merchant.name}: ${m.name} ${charge.periodStart}`, ctx.now().getTime());
  }
  return { pass: null, payment };
}

/** Finish paying a pack that is still "Waiting for payment" (the customer left the card step). */
export async function payPassMine(ctx: AppContext, userId: string, id: string): Promise<classesApi.PurchaseResponse> {
  const [pass] = await ctx.db.select().from(classPasses).where(and(eq(classPasses.id, id), eq(classPasses.userId, userId))).limit(1);
  if (!pass) throw notFound("Pass");
  if (pass.status !== "pending") throw conflict("This pass is not waiting for payment");
  const merchant = await loadMerchant(ctx.db, pass.merchantId);
  if (!merchant) throw notFound("Studio");
  const [charge] = await ctx.db.select().from(classCharges).where(and(eq(classCharges.passId, pass.id), inArray(classCharges.status, ["failed", "pending"]))).orderBy(desc(classCharges.createdAt)).limit(1);
  if (!charge) throw conflict("Nothing is due");
  let payment: classesApi.PaymentRefDto;
  if (charge.status === "pending" && charge.stripePaymentIntentId) {
    const pi = await retrieveConnectPayment(ctx, merchant, charge.stripePaymentIntentId);
    payment = { paymentIntentId: pi.id, clientSecret: pi.clientSecret, amountCents: pi.amountCents };
  } else {
    const customerId = await ensurePayerCustomer(ctx, merchant, userId);
    payment = await startPayment(ctx, merchant, charge, customerId, `${merchant.name}: ${pass.name}`, ctx.now().getTime());
  }
  return { pass: await passDto(ctx, pass), payment };
}

/** Drop a pack that was never paid for. */
export async function cancelPassMine(ctx: AppContext, userId: string, id: string): Promise<{ ok: true }> {
  const [pass] = await ctx.db.select().from(classPasses).where(and(eq(classPasses.id, id), eq(classPasses.userId, userId))).limit(1);
  if (!pass) throw notFound("Pass");
  if (pass.status !== "pending") throw conflict("This pass is already paid for. Ask the studio about a refund.");
  const now = ctx.now();
  await ctx.db.update(classPasses).set({ status: "refunded", updatedAt: now }).where(and(eq(classPasses.id, pass.id), eq(classPasses.status, "pending")));
  await ctx.db.update(classCharges).set({ status: "failed" }).where(and(eq(classCharges.passId, pass.id), inArray(classCharges.status, ["pending", "failed"])));
  return { ok: true };
}

/** A different card: a SetupIntent on the member's Stripe customer; the webhook saves the result. */
export async function cardSetupMine(ctx: AppContext, userId: string, id: string): Promise<classesApi.MembershipSetupResponse> {
  const { m, merchant } = await myMembership(ctx, userId, id);
  if (m.status === "cancelled" || m.status === "expired") throw conflict("This membership has ended");
  if (!merchant.stripeAccountId) throw conflict("This studio can't take card payments yet");
  const payments = getPayments(ctx);
  const scope = savedMethodScope(ctx, merchant);
  if (m.setupIntentId) {
    const open = await payments.retrieveSetupIntent(m.setupIntentId, scope).catch(() => null);
    if (open && (open.status === "requires_payment_method" || open.status === "requires_confirmation") && open.customerId === m.stripeCustomerId) return { setupIntentId: open.id, clientSecret: open.clientSecret };
  }
  const customerId = await ensurePayerCustomer(ctx, merchant, userId, m.stripeCustomerId);
  const si = await payments.createSetupIntent({ ...scope, customerId, metadata: { ll_kind: "class_setup", ll_id: m.id, merchant_id: merchant.id }, idempotencyKey: `class_setup:${m.id}:${ctx.now().getTime()}` });
  await ctx.db.update(classMemberships).set({ setupIntentId: si.id, stripeCustomerId: customerId, updatedAt: ctx.now() }).where(eq(classMemberships.id, m.id));
  return { setupIntentId: si.id, clientSecret: si.clientSecret };
}

// ---------------------------------------------------------------------------
// Studio: members, cancel, freeze, summary
// ---------------------------------------------------------------------------
export async function listMembers(ctx: AppContext, merchant: Merchant, q: z.output<typeof classesApi.listMembersQuery>): Promise<classesApi.StudioMembersResponse> {
  const rows = await ctx.db
    .select({ m: classMemberships, name: users.name, phone: users.phone })
    .from(classMemberships)
    .innerJoin(users, eq(users.id, classMemberships.userId))
    .where(and(eq(classMemberships.merchantId, merchant.id), q.status === "all" || q.status === "pending" ? undefined : ne(classMemberships.status, "pending"), q.status === "all" ? undefined : q.status === "pending" ? eq(classMemberships.status, "pending") : q.status === "renewal_due" ? and(eq(classMemberships.status, "active"), sql`${classMemberships.termEndsOn} is not null`, isNull(classMemberships.renewalNoticeSentAt)) : eq(classMemberships.status, q.status)))
    .orderBy(asc(classMemberships.status), desc(classMemberships.createdAt))
    .limit(300);
  const needle = q.q?.toLowerCase();
  const today = todayFor(ctx, merchant);
  const items: classesApi.StudioMemberDto[] = [];
  for (const r of rows) {
    if (needle && !(r.name ?? "").toLowerCase().includes(needle) && !(r.phone ?? "").includes(needle)) continue;
    const m = r.m;
    let issue: string | null = null;
    if (m.status === "pending") issue = "Card step not finished";
    else if (m.status === "past_due") issue = "Payment failed";
    else if (m.cancelEffectiveOn) issue = `Ends ${fmtDate(addDays(m.cancelEffectiveOn, -1))}`;
    // Past the last day a notice may go out (30 days before the term ends) the plan expires instead of renewing: say so.
    else if (m.termEndsOn && !m.renewalNoticeSentAt && today >= addDays(m.termEndsOn, -classesApi.RENEWAL_NOTICE_MIN_DAYS)) issue = "Renewal notice overdue: it will end instead of renewing";
    else if (m.termEndsOn && !m.renewalNoticeSentAt && today >= addDays(m.termEndsOn, -90)) issue = "Renewal notice not sent yet";
    else if (m.status === "frozen" && m.frozenUntil) issue = `Frozen until ${fmtDate(m.frozenUntil)}`;
    items.push({ membershipId: m.id, userId: m.userId, name: r.name, maskedPhone: maskedPhone(r.phone), offer: m.name, status: m.status as classesApi.MembershipStatus, priceCents: m.priceCents, nextBillingDate: m.status === "cancelled" || m.status === "expired" || m.status === "pending" ? null : m.nextBillingDate, termEndsOn: m.termEndsOn, cancelEffectiveOn: m.cancelEffectiveOn, frozenUntil: m.frozenUntil, issue, card: m.paymentMethodId ? { brand: m.paymentMethodBrand, last4: m.paymentMethodLast4 } : null });
  }
  return { items };
}

export async function studioCancel(ctx: AppContext, merchant: Merchant, id: string, body: z.output<typeof classesApi.studioCancelBody>): Promise<classesApi.StudioMembersResponse> {
  const [m] = await ctx.db.select().from(classMemberships).where(and(eq(classMemberships.id, id), eq(classMemberships.merchantId, merchant.id))).limit(1);
  if (!m) throw notFound("Membership");
  await cancelCore(ctx, merchant, m, { by: "studio", reason: body.reason, effective: body.effective, refundLast: body.refundLast });
  return listMembers(ctx, merchant, { status: "all" });
}

export async function studioFreeze(ctx: AppContext, merchant: Merchant, id: string, body: z.output<typeof classesApi.studioFreezeBody>): Promise<classesApi.StudioMembersResponse> {
  const [m] = await ctx.db.select().from(classMemberships).where(and(eq(classMemberships.id, id), eq(classMemberships.merchantId, merchant.id))).limit(1);
  if (!m) throw notFound("Membership");
  await freezeCore(ctx, merchant, m, body.days, body.startDate, false);
  return listMembers(ctx, merchant, { status: "all" });
}

export async function summary(ctx: AppContext, merchant: Merchant): Promise<classesApi.StudioSummaryResponse> {
  const now = ctx.now();
  const since = new Date(now.getTime() - 30 * DAY);
  const local = localParts(now, merchant.timezone);
  // The calendar week, Monday to Sunday, in the studio's time.
  const monday = addDays(local.date, -((local.weekday + 6) % 7));
  const weekStart = zonedToUtc(monday, 0, merchant.timezone);
  const weekEnd = zonedToUtc(addDays(monday, 7), 0, merchant.timezone);
  const [ms] = await ctx.db
    .select({
      active: sql<number>`count(*) filter (where ${classMemberships.status} in ('active','past_due'))::int`,
      frozen: sql<number>`count(*) filter (where ${classMemberships.status} = 'frozen')::int`,
      pastDue: sql<number>`count(*) filter (where ${classMemberships.status} = 'past_due')::int`,
      mrr: sql<number>`coalesce(sum(${classMemberships.priceCents}) filter (where ${classMemberships.status} in ('active','past_due')), 0)::int`,
      renewals: sql<number>`count(*) filter (where ${classMemberships.status} = 'active' and ${classMemberships.termEndsOn} is not null and ${classMemberships.renewalNoticeSentAt} is null)::int`,
    })
    .from(classMemberships)
    .where(eq(classMemberships.merchantId, merchant.id));
  const [cancelled] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(classMemberships).where(and(eq(classMemberships.merchantId, merchant.id), eq(classMemberships.status, "cancelled"), gte(classMemberships.cancelledAt, since)));
  const [packs] = await ctx.db.select({ s: sql<number>`coalesce(sum(${classCharges.amountCents} - ${classCharges.taxCents}), 0)::int` }).from(classCharges).where(and(eq(classCharges.merchantId, merchant.id), inArray(classCharges.kind, ["pack", "drop_in"]), eq(classCharges.status, "paid"), gte(classCharges.paidAt, since)));
  const [cap] = await ctx.db.select({ n: sql<number>`coalesce(sum(${classSessions.capacity}), 0)::int` }).from(classSessions).where(and(eq(classSessions.merchantId, merchant.id), eq(classSessions.status, "scheduled"), gte(classSessions.startsAt, weekStart), lt(classSessions.startsAt, weekEnd)));
  const [wk] = await ctx.db
    .select({ booked: sql<number>`count(*) filter (where ${classBookings.status} in ('booked','attended','held'))::int`, late: sql<number>`count(*) filter (where ${classBookings.status} = 'late_cancelled')::int` })
    .from(classBookings)
    .innerJoin(classSessions, eq(classSessions.id, classBookings.sessionId))
    .where(and(eq(classBookings.merchantId, merchant.id), gte(classSessions.startsAt, weekStart), lt(classSessions.startsAt, weekEnd)));
  const [wl] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(classBookings).innerJoin(classSessions, eq(classSessions.id, classBookings.sessionId)).where(and(eq(classBookings.merchantId, merchant.id), eq(classBookings.status, "waitlisted"), gte(classSessions.startsAt, now)));
  return {
    activeMembers: Number(ms?.active ?? 0),
    frozenMembers: Number(ms?.frozen ?? 0),
    pastDue: Number(ms?.pastDue ?? 0),
    mrrCents: Number(ms?.mrr ?? 0),
    cancelledLast30: Number(cancelled?.n ?? 0),
    packSalesCents: Number(packs?.s ?? 0),
    bookedThisWeek: Number(wk?.booked ?? 0),
    capacityThisWeek: Number(cap?.n ?? 0),
    waitlistedNow: Number(wl?.n ?? 0),
    lateCancelsThisWeek: Number(wk?.late ?? 0),
    renewalsDue: Number(ms?.renewals ?? 0),
  };
}

/** Whether the studio sells memberships (the customer page hides them otherwise). */
export async function membershipsEnabled(ctx: AppContext, merchant: Merchant): Promise<boolean> {
  return (await getMerchantFeatures(ctx.db, merchant))["memberships.recurring"].enabled;
}
