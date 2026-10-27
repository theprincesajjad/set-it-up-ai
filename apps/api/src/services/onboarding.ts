/**
 * Onboarding and activation: milestones, the owner's activation view, the paid-tier moment, setup nudges and
 * the admin funnel. The rules (pace, upsell timing, nudge schedule, playbooks) are pure and live in
 * @ll/shared onboarding.ts; this file reads the database and applies them.
 */
import { and, count, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { auditLogs, catalogItems, classSessions, integrations, loyaltyPrograms, merchantMilestones, merchantMembers, merchantStaff, merchants, rewards, services, users, type DbOrTx } from "@ll/db";
import {
  ACTIVATION,
  BRAND,
  activationFor,
  tradeSetupFor,
  NUDGE_RULES,
  daysSince,
  dueNudge,
  LOCALES,
  normalizeLocale,
  nudgeText,
  paceFor,
  playbookFor,
  t,
  upsellMoment,
  type Locale,
  type MessageKey,
  type MilestoneKey,
  type NudgeKey,
  type adminApi,
  type merchantApi,
} from "@ll/shared";
import type { AppContext } from "../context.js";
import { hmacSha256, safeEqual } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { getMerchantFeatures } from "./features.js";
import { isOptedOut, sendSms } from "./opt-out.js";

type Merchant = typeof merchants.$inferSelect;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const DAY = 86_400_000;

function localHour(at: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-CA", { timeZone, hour: "2-digit", hourCycle: "h23" }).formatToParts(at).find((p) => p.type === "hour")?.value;
  return Number(h ?? 12);
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
/** Record a milestone once. Returns true when this call created it. */
export async function recordMilestone(db: DbOrTx, merchantId: string, key: MilestoneKey | NudgeKey, at: Date, data?: Record<string, unknown>): Promise<boolean> {
  const rows = await db.insert(merchantMilestones).values({ merchantId, key, reachedAt: at, data: data ?? null }).onConflictDoNothing().returning({ id: merchantMilestones.id });
  return rows.length > 0;
}

export async function milestonesFor(db: DbOrTx, merchantId: string): Promise<Map<string, Date>> {
  const rows = await db.select({ key: merchantMilestones.key, at: merchantMilestones.reachedAt }).from(merchantMilestones).where(eq(merchantMilestones.merchantId, merchantId));
  return new Map(rows.map((r) => [r.key, r.at]));
}

export async function removeMilestone(db: DbOrTx, merchantId: string, key: MilestoneKey) {
  await db.delete(merchantMilestones).where(and(eq(merchantMilestones.merchantId, merchantId), eq(merchantMilestones.key, key)));
}

/** Members who have visited at least once: the activation count. */
export async function visitedMembers(db: DbOrTx, merchantId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchantId), gte(merchantMembers.visitCount, 1)));
  return Number(row?.n ?? 0);
}

/**
 * Called inside the visit transaction. Records first_stamp, members_10 and activated the moment each is reached,
 * and flips the shop to active at the activation threshold.
 */
export async function recordVisitMilestones(ctx: AppContext, tx: DbOrTx, merchant: Pick<Merchant, "id" | "activatedAt" | "status"> & { vertical?: string }): Promise<boolean> {
  const members = await visitedMembers(tx, merchant.id);
  const at = ctx.now();
  if (members >= 1) await recordMilestone(tx, merchant.id, "first_stamp", at);
  if (members >= ACTIVATION.previewMembers) await recordMilestone(tx, merchant.id, "members_10", at);
  // A florist or a hardware store is active at 10 members, a café at 25 (activationFor).
  if (merchant.activatedAt) return false;
  const vertical = merchant.vertical ?? (await tx.select({ v: merchants.vertical }).from(merchants).where(eq(merchants.id, merchant.id)).limit(1))[0]?.v;
  if (members < activationFor(vertical, ctx.config.activationThreshold).target) return false;
  await tx
    .update(merchants)
    .set({ activatedAt: at, status: merchant.status === "onboarding" ? "active" : merchant.status })
    .where(and(eq(merchants.id, merchant.id), isNull(merchants.activatedAt)));
  await recordMilestone(tx, merchant.id, "activated", at, { members });
  return true;
}

// ---------------------------------------------------------------------------
// Owner view
// ---------------------------------------------------------------------------
// The words the owner reads come from the shared catalog (ob.*) in the owner's language (users.locale); English is the default.
const STEP_KEYS: Record<merchantApi.OnboardingStepKey, MessageKey> = {
  program: "ob.step.program",
  first_stamp: "ob.step.first_stamp",
  qr_kit: "ob.step.qr_kit",
  staff: "ob.step.staff",
  first_members: "ob.step.first_members",
  profile: "ob.step.profile",
  pos: "ob.step.pos",
  pharmacy_rules: "ob.step.pharmacy_rules",
  // The label is per trade (ob.step.trade.<family>); this is the fallback.
  trade_setup: "ob.step.trade.menu",
};
const CORE: merchantApi.OnboardingStepKey[] = ["program", "first_stamp", "qr_kit", "staff", "first_members"];
/** A pharmacy's rules come right after the program: points stay off until the pharmacist-owner confirms them. */
const CORE_PHARMACY: merchantApi.OnboardingStepKey[] = ["program", "pharmacy_rules", "first_stamp", "qr_kit", "staff", "first_members"];
const LATER: merchantApi.OnboardingStepKey[] = ["profile", "pos"];

/** Core steps for a shop: its trade's own step comes right after the program (a restaurant's menu comes first of all). */
function coreFor(vertical: string): merchantApi.OnboardingStepKey[] {
  if (vertical === "pharmacy") return CORE_PHARMACY;
  const family = tradeSetupFor(vertical);
  if (!family) return CORE;
  return family === "menu" ? ["trade_setup", ...CORE] : ["program", "trade_setup", ...CORE.slice(1)];
}

const SOURCE_OF: Record<string, merchantApi.OnboardingSource["source"]> = { phone: "counter", pos: "counter", import: "counter", qr: "qr", app: "link", web: "link", wallet: "link", campaign: "link", referral: "link" };
const SOURCE_KEY: Record<merchantApi.OnboardingSource["source"], MessageKey> = { counter: "ob.src.counter", qr: "ob.src.qr", link: "ob.src.link", other: "ob.src.other" };

function minutesLabel(locale: Locale, min: number): string {
  if (min < 1) return t(locale, "ob.min.under");
  if (min < 90) return t(locale, "ob.min.min", { n: Math.round(min) });
  if (min < 48 * 60) return t(locale, "ob.min.hours", { n: Math.round(min / 60) });
  return t(locale, "ob.min.day", { n: Math.floor(min / 1440) });
}

/** An owner's language from `users.locale` ("hi", "pa-IN", "en-CA" ...); English when it is not one of ours. */
export const ownerLocale = (raw: string | null | undefined): Locale => normalizeLocale(raw) ?? "en";

/** The language the signed-in person reads the dashboard card in: their own `users.locale`. */
export async function userLocale(db: DbOrTx, userId: string | null | undefined): Promise<Locale> {
  if (!userId) return "en";
  const [u] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  return ownerLocale(u?.locale);
}

export async function getOnboardingChecklist(ctx: AppContext, merchantId: string, locale: Locale = "en"): Promise<merchantApi.OnboardingChecklist> {
  const db = ctx.db;
  const now = ctx.now();
  const [m] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const family = tradeSetupFor(m.vertical);
  const tradeCount = async () => {
    if (!family) return 0;
    const table = family === "services" ? services : family === "classes" ? classSessions : catalogItems;
    const [r] = await db.select({ n: count() }).from(table).where(eq(table.merchantId, merchantId));
    return Number(r?.n ?? 0);
  };
  const [[program], [rewardRow], [staffRow], [posRow], marks, ms, members, sourceRows, tradeItems] = await Promise.all([
    db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1),
    db.select({ n: count() }).from(rewards).where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true))),
    db.select({ n: count() }).from(merchantStaff).where(eq(merchantStaff.merchantId, merchantId)),
    db.select({ n: count() }).from(integrations).where(and(eq(integrations.merchantId, merchantId), eq(integrations.status, "connected"))),
    db.select({ data: auditLogs.data }).from(auditLogs).where(and(eq(auditLogs.merchantId, merchantId), eq(auditLogs.action, "onboarding.step_completed"))),
    milestonesFor(db, merchantId),
    visitedMembers(db, merchantId),
    db.select({ via: merchantMembers.joinedVia, n: count() }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchantId), gte(merchantMembers.visitCount, 1))).groupBy(merchantMembers.joinedVia),
    tradeCount(),
  ]);
  const marked = new Set(marks.map((r) => (r.data as { step?: string } | null)?.step).filter(Boolean));
  const plan = activationFor(m.vertical, ctx.config.activationThreshold);
  const target = plan.target;
  const activated = !!m.activatedAt || members >= target;
  const firstStamp = ms.has("first_stamp") || members >= 1 || !!m.activatedAt;
  const done: Record<merchantApi.OnboardingStepKey, boolean> = {
    program: (!!program && program.active) || marked.has("program"),
    first_stamp: firstStamp,
    qr_kit: marked.has("qr_kit") || ms.has("qr_printed"),
    staff: Number(staffRow?.n ?? 0) > 1 || marked.has("staff") || ms.has("staff_added"),
    first_members: activated,
    profile: (!!m.description && !!m.logoUrl) || marked.has("profile"),
    pos: Number(posRow?.n ?? 0) > 0 || marked.has("pos") || ms.has("pos_connected"),
    pharmacy_rules: !!m.pharmacyConfirmedAt,
    trade_setup: tradeItems > 0 || marked.has("trade_setup"),
  };
  const detail: Record<merchantApi.OnboardingStepKey, string | null> = {
    program: program ? `${program.earnType.replace("_", " ")} · ${program.terminology}` : null,
    first_stamp: firstStamp ? null : t(locale, "ob.step.waiting"),
    qr_kit: null,
    staff: t(locale, "ob.step.team", { n: Number(staffRow?.n ?? 0) }),
    first_members: t(locale, "ob.step.members", { have: Math.min(members, target), target }),
    profile: null,
    pos: null,
    pharmacy_rules: m.pharmacyConfirmedAt && m.pharmacyConfirmedByName ? m.pharmacyConfirmedByName : null,
    trade_setup: null,
  };
  const rx = m.vertical === "pharmacy";
  const mk = (key: merchantApi.OnboardingStepKey) => ({ key, label: t(locale, rx && key === "first_stamp" ? "ob.step.first_sale" : key === "trade_setup" && family ? (`ob.step.trade.${family}` as MessageKey) : STEP_KEYS[key], { target }), done: done[key], detail: detail[key] });
  const steps = coreFor(m.vertical).map(mk);
  const later = LATER.map(mk);
  const current = steps.find((s) => !s.done)?.key ?? "done";
  if (m.onboardingStep !== current) await db.update(merchants).set({ onboardingStep: current }).where(eq(merchants.id, merchantId));

  // Activation view
  const day = daysSince(m.createdAt, now);
  const pace = paceFor({ day, members, activated, target, windowDays: plan.windowDays });
  const stampAt = ms.get("first_stamp") ?? null;
  const firstStampMinutes = stampAt ? Math.max(0, (stampAt.getTime() - m.createdAt.getTime()) / 60_000) : null;
  const at10 = ms.get("members_10") ?? null;
  const atActive = ms.get("activated") ?? m.activatedAt ?? null;
  const bySource = new Map<merchantApi.OnboardingSource["source"], number>();
  for (const r of sourceRows) {
    const s = SOURCE_OF[r.via] ?? "other";
    bySource.set(s, (bySource.get(s) ?? 0) + Number(r.n));
  }
  const sources = (["counter", "qr", "link", "other"] as const).filter((s) => bySource.get(s)).map((s) => ({ source: s, label: t(locale, SOURCE_KEY[s]), count: bySource.get(s)! }));
  const milestones: merchantApi.OnboardingMilestone[] = [
    { key: "signed_up", label: t(locale, "ob.ms.signedUp"), at: iso(m.createdAt), detail: m.createdAt.toLocaleDateString(LOCALES[locale].bcp47, { month: "short", day: "numeric", timeZone: "America/Toronto" }) },
    { key: "first_stamp", label: t(locale, "ob.ms.firstStamp"), at: iso(stampAt), detail: stampAt ? minutesLabel(locale, firstStampMinutes!) : t(locale, "ob.ms.notYet") },
    { key: "members_10", label: t(locale, "ob.ms.members", { n: 10 }), at: iso(at10), detail: at10 ? t(locale, "ob.ms.day", { n: daysSince(m.createdAt, at10) }) : members >= 1 ? t(locale, "ob.ms.needs", { n: Math.max(0, 10 - members) }) : t(locale, "ob.ms.notYet") },
    { key: "activated", label: t(locale, "ob.ms.members", { n: target }), at: iso(atActive), detail: atActive ? t(locale, "ob.ms.day", { n: daysSince(m.createdAt, atActive) }) : t(locale, "ob.ms.needs", { n: Math.max(0, target - members) }) },
  ];
  const playbook = playbookFor(m.vertical);
  const nextMove = nextMoveFor(locale, { firstStamp, qrDone: done.qr_kit, staffDone: done.staff, activated, pace, members, target, sources, playbook });
  // A pilot or override shop can have the paid features on a free plan: do not sell it what it already has.
  const unlocked = await getMerchantFeatures(db, m);
  const paying = m.plan !== "free" || !!m.restaurantTier || (playbookFor(m.vertical).upsell.plan === "plus" && unlocked["promos.basic"].enabled);
  const dismissed = ms.get("upsell_dismissed");
  const upsellRaw = upsellMoment({
    vertical: m.vertical,
    members,
    firstStamp,
    activated,
    pace,
    paying,
    dismissedRecently: !!dismissed && now.getTime() - dismissed.getTime() < 14 * DAY,
    foundingSpotsLeft: await foundingSpotsLeft(db, m),
  });
  if (upsellRaw.moment === "offer") await recordMilestone(db, merchantId, "upsell_seen", now);

  return {
    steps,
    later,
    currentStep: current,
    percentComplete: Math.round((steps.filter((s) => s.done).length / steps.length) * 100),
    activeMembers: members,
    activationTarget: target,
    activatedAt: iso(m.activatedAt),
    activation: {
      windowDays: plan.windowDays,
      day,
      daysLeft: Math.max(0, plan.windowDays - day),
      members,
      target,
      leadingMembers: plan.leadingMembers,
      leadingByDay: plan.leadingByDay,
      pace,
      paceLabel: pace === "activated" || pace === "late" ? t(locale, `ob.pace.${pace}` as MessageKey, { have: members, target }) : t(locale, "ob.pace.dayOf", { label: t(locale, `ob.pace.${pace}` as MessageKey), day: Math.min(day + 1, plan.windowDays), total: plan.windowDays }),
      firstStampMinutes,
      milestones,
      sources,
      nextMove,
    },
    playbook: { key: playbook.key, label: playbook.label, tillLine: playbook.tillLine, tactic: playbook.tactic, tips: [...playbook.tips], firstStampHint: playbook.firstStampHint, scriptLanguages: [...playbook.scriptLanguages], tillLineLocal: playbook.tillLineLocal ? { ...playbook.tillLineLocal } : null },
    upsell: upsellRaw,
    nudgesOn: !ms.has("nudges_off"),
  };
}

async function foundingSpotsLeft(db: DbOrTx, m: Merchant): Promise<number | null> {
  if (!m.neighbourhoodId) return null;
  const [row] = await db.select({ n: count() }).from(merchants).where(and(eq(merchants.neighbourhoodId, m.neighbourhoodId), eq(merchants.foundingOffer, true)));
  return Math.max(0, 20 - Number(row?.n ?? 0));
}

function nextMoveFor(locale: Locale, a: { firstStamp: boolean; qrDone: boolean; staffDone: boolean; activated: boolean; pace: string; members: number; target: number; sources: merchantApi.OnboardingSource[]; playbook: ReturnType<typeof playbookFor> }): merchantApi.OnboardingActivation["nextMove"] {
  if (!a.firstStamp) return { title: t(locale, "ob.step.first_stamp"), body: a.playbook.firstStampHint, cta: t(locale, "ob.move.first.cta"), path: "/setup?step=first_stamp" };
  if (a.activated) return { title: t(locale, "ob.move.active.title"), body: t(locale, "ob.move.active.body"), cta: t(locale, "ob.move.active.cta"), path: "/integrations" };
  if (!a.qrDone) return { title: t(locale, "ob.step.qr_kit"), body: t(locale, "ob.move.qr.body"), cta: t(locale, "ob.step.qr_kit"), path: "/locations/kit" };
  if (!a.staffDone && a.members >= 3) return { title: t(locale, "ob.move.staff.title"), body: t(locale, "ob.move.staff.body"), cta: t(locale, "ob.move.staff.cta"), path: "/setup?step=staff" };
  const counter = a.sources.find((s) => s.source === "counter")?.count ?? 0;
  const qr = a.sources.find((s) => s.source === "qr")?.count ?? 0;
  const tail = a.members > 0 && counter + qr > 0 ? ` ${t(locale, "ob.move.best.tail", { counter, members: a.members, qr })}` : "";
  return { title: t(locale, "ob.move.best.title"), body: t(locale, "ob.move.best.body", { till: a.playbook.tillLine, tail }), cta: t(locale, "ob.move.best.cta"), path: "/counter" };
}

export async function dismissUpsell(ctx: AppContext, merchantId: string, actorUserId: string) {
  const locale = await userLocale(ctx.db, actorUserId);
  await ctx.db.insert(merchantMilestones).values({ merchantId, key: "upsell_dismissed", reachedAt: ctx.now() }).onConflictDoUpdate({ target: [merchantMilestones.merchantId, merchantMilestones.key], set: { reachedAt: ctx.now() } });
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "onboarding.upsell_dismissed", entity: "merchant", entityId: merchantId, data: {} });
  return getOnboardingChecklist(ctx, merchantId, locale);
}

export function nudgeUnsubscribeToken(ctx: AppContext, merchantId: string): string {
  return hmacSha256(ctx.config.jwtSecret, `nudge-unsub:${merchantId}`).slice(0, 32);
}

/** The one-step unsubscribe link printed in every setup reminder (GET opens a confirmation page; no sign-in). */
export function nudgeUnsubscribeUrl(ctx: AppContext, merchantId: string): string {
  return `${ctx.config.publicApiUrl.replace(/\/$/, "")}/v1/public/onboarding/unsubscribe?m=${merchantId}&t=${nudgeUnsubscribeToken(ctx, merchantId)}`;
}

/** Checks the link and names the shop, without changing anything (the page a GET opens asks before it acts). */
export async function previewNudgeUnsubscribe(ctx: AppContext, merchantId: string, token: string): Promise<{ merchantName: string }> {
  if (!safeEqual(token, nudgeUnsubscribeToken(ctx, merchantId))) throw badRequest("This unsubscribe link is invalid");
  const [m] = await ctx.db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Shop");
  return { merchantName: m.name };
}

/** Turns the reminders off. Only ever called from a POST (a GET just asks). */
export async function unsubscribeNudgesByToken(ctx: AppContext, merchantId: string, token: string): Promise<{ merchantName: string }> {
  if (!safeEqual(token, nudgeUnsubscribeToken(ctx, merchantId))) throw badRequest("This unsubscribe link is invalid");
  const [m] = await ctx.db.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Shop");
  await recordMilestone(ctx.db, merchantId, "nudges_off", ctx.now());
  await writeAudit(ctx.db, { actorUserId: null, merchantId, action: "onboarding.nudges_unsubscribe_link", entity: "merchant", entityId: merchantId, data: {} });
  return { merchantName: m.name };
}

export async function setNudges(ctx: AppContext, merchantId: string, actorUserId: string, enabled: boolean) {
  if (enabled) await removeMilestone(ctx.db, merchantId, "nudges_off");
  else await recordMilestone(ctx.db, merchantId, "nudges_off", ctx.now());
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "onboarding.nudges", entity: "merchant", entityId: merchantId, data: { enabled } });
  return getOnboardingChecklist(ctx, merchantId, await userLocale(ctx.db, actorUserId));
}

// ---------------------------------------------------------------------------
// Nudges (job)
// ---------------------------------------------------------------------------
async function ownerOf(db: DbOrTx, merchantId: string) {
  const [o] = await db
    .select({ name: users.name, email: users.email, phone: users.phone, locale: users.locale })
    .from(merchantStaff)
    .innerJoin(users, eq(users.id, merchantStaff.userId))
    .where(and(eq(merchantStaff.merchantId, merchantId), eq(merchantStaff.role, "owner")))
    .orderBy(merchantStaff.createdAt)
    .limit(1);
  return o ?? null;
}

/**
 * Setup nudges to the owner. These are service messages to the person who signed up (they facilitate the
 * account they asked for), sent at most five times in the first 25 days, only 9:00 to 20:00 Toronto time,
 * and can be turned off from the setup page.
 */
export async function runOnboardingNudges(ctx: AppContext): Promise<{ sent: number }> {
  const now = ctx.now();
  const since = new Date(now.getTime() - 35 * DAY);
  const candidates = await ctx.db
    .select()
    .from(merchants)
    .where(and(isNull(merchants.activatedAt), ne(merchants.status, "closed"), ne(merchants.status, "paused"), gte(merchants.createdAt, since), lte(merchants.createdAt, new Date(now.getTime() - NUDGE_RULES[0]!.afterHours * 3_600_000))));
  let sent = 0;
  for (const m of candidates) {
    const h = localHour(now, m.timezone);
    if (h < 9 || h >= 20) continue;
    const ms = await milestonesFor(ctx.db, m.id);
    if (ms.has("nudges_off")) continue;
    const members = await visitedMembers(ctx.db, m.id);
    const firstStamp = ms.has("first_stamp") || members >= 1;
    const sentKeys = new Set([...ms.keys()].filter((k) => k.startsWith("nudge_")));
    const key = dueNudge({ hoursSinceSignup: (now.getTime() - m.createdAt.getTime()) / 3_600_000, members, firstStamp, sent: sentKeys });
    if (!key) continue;
    const owner = await ownerOf(ctx.db, m.id);
    const smsTo = owner?.phone ?? m.phone;
    if (!owner || (!smsTo && !owner.email)) continue;
    // The owner replied STOP to a text from us: no more setup reminders on any channel.
    if (smsTo && (await isOptedOut(ctx.db, smsTo, "sms"))) continue;
    // Claim the nudge first so a crash or a second worker cannot send it twice.
    if (!(await recordMilestone(ctx.db, m.id, key, now, { members }))) continue;
    // Earlier nudges that are now moot are marked sent too, so a late shop gets one message, not a pile.
    for (const r of NUDGE_RULES) if (r.key !== key && (now.getTime() - m.createdAt.getTime()) / 3_600_000 >= r.afterHours && !sentKeys.has(r.key) && r.afterHours < NUDGE_RULES.find((x) => x.key === key)!.afterHours) await recordMilestone(ctx.db, m.id, r.key, now, { skipped: true });
    const day = daysSince(m.createdAt, now);
    // In the owner's own language (users.locale); the shop name, the till line and the link stay as they are.
    const locale = ownerLocale(owner.locale);
    const act = activationFor(m.vertical, ctx.config.activationThreshold);
    const text = nudgeText(
      key,
      {
        shopName: m.name,
        members,
        daysLeft: Math.max(0, act.windowDays - day),
        target: act.target,
        windowDays: act.windowDays,
        leadingMembers: act.leadingMembers,
        leadingByDay: act.leadingByDay,
        tillLine: playbookFor(m.vertical).tillLine,
        url: `${ctx.config.publicWebUrl.replace(/\/$/, "")}/m/${m.id}/setup`,
      },
      locale,
    );
    // CASL: say who we are and give a one-step way out. The link works with one tap and no sign-in.
    const stopUrl = nudgeUnsubscribeUrl(ctx, m.id);
    try {
      if (smsTo) await sendSms(ctx, smsTo, `${BRAND.name}: ${text.body}\n${t(locale, "ob.smsFoot", { stop: t(locale, "ob.stopLine"), url: stopUrl })}`);
      else await ctx.providers.email.send({ to: owner.email!, subject: text.subject, text: `${text.body}\n\n--\n${t(locale, "ob.emailFoot", { brand: BRAND.name, url: stopUrl })}`, headers: { "List-Unsubscribe": `<${stopUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
      sent += 1;
    } catch (err) {
      console.error("[onboarding.nudge]", m.id, err);
    }
    if (key === "nudge_d14" || (key === "nudge_d1" && !firstStamp && day >= 2)) await recordMilestone(ctx.db, m.id, "needs_call", now, { key });
  }
  return { sent };
}

// ---------------------------------------------------------------------------
// Admin funnel
// ---------------------------------------------------------------------------
export async function onboardingFunnel(ctx: AppContext, days: number): Promise<adminApi.OnboardingFunnel> {
  const now = ctx.now();
  const since = new Date(now.getTime() - days * DAY);
  const shops = await ctx.db.select().from(merchants).where(and(gte(merchants.createdAt, since), ne(merchants.status, "closed")));
  const ids = shops.map((s) => s.id);
  const rows = ids.length ? await ctx.db.select().from(merchantMilestones).where(inArray(merchantMilestones.merchantId, ids)) : [];
  const byShop = new Map<string, Map<string, Date>>();
  for (const r of rows) {
    if (!byShop.has(r.merchantId)) byShop.set(r.merchantId, new Map());
    byShop.get(r.merchantId)!.set(r.key, r.reachedAt);
  }
  const memberCounts = ids.length
    ? await ctx.db.select({ id: merchantMembers.merchantId, n: count() }).from(merchantMembers).where(and(inArray(merchantMembers.merchantId, ids), gte(merchantMembers.visitCount, 1))).groupBy(merchantMembers.merchantId)
    : [];
  const members = new Map(memberCounts.map((r) => [r.id, Number(r.n)]));
  let first = 0, ten = 0, act = 0, stuck = 0, behind14 = 0, old = 0, oldActive = 0;
  const minutes: number[] = [];
  const vert = new Map<string, { signedUp: number; activated: number }>();
  const calls: adminApi.OnboardingFunnel["callList"] = [];
  const need: { s: Merchant; day: number; n: number; reason: string }[] = [];
  for (const s of shops) {
    const ms = byShop.get(s.id) ?? new Map<string, Date>();
    const n = members.get(s.id) ?? 0;
    const day = daysSince(s.createdAt, now);
    const hasFirst = ms.has("first_stamp") || n >= 1 || !!s.activatedAt;
    const hasTen = ms.has("members_10") || n >= ACTIVATION.previewMembers || !!s.activatedAt;
    const isAct = !!s.activatedAt;
    // Slow trades (a florist, a hardware store) are judged on their own target and window, not a café's.
    const plan = activationFor(s.vertical, ctx.config.activationThreshold);
    if (hasFirst) first++;
    if (hasTen) ten++;
    if (isAct) act++;
    const stamp = ms.get("first_stamp");
    if (stamp) minutes.push(Math.max(0, (stamp.getTime() - s.createdAt.getTime()) / 60_000));
    const v = vert.get(s.vertical) ?? { signedUp: 0, activated: 0 };
    v.signedUp++;
    if (isAct) v.activated++;
    vert.set(s.vertical, v);
    if (now.getTime() - s.createdAt.getTime() >= plan.windowDays * DAY) {
      old++;
      if (s.activatedAt && s.activatedAt.getTime() - s.createdAt.getTime() <= plan.windowDays * DAY) oldActive++;
    }
    if (!hasFirst && now.getTime() - s.createdAt.getTime() >= ACTIVATION.stuckAfterHours * 3_600_000) {
      stuck++;
      need.push({ s, day, n, reason: "No first stamp" });
    } else if (!isAct && day >= plan.leadingByDay && day <= plan.windowDays && n < plan.leadingMembers) {
      behind14++;
      need.push({ s, day, n, reason: `${n} member${n === 1 ? "" : "s"}, needs ${plan.leadingMembers} by day ${plan.leadingByDay}` });
    }
  }
  need.sort((a, b) => (a.reason === "No first stamp" ? 0 : 1) - (b.reason === "No first stamp" ? 0 : 1) || b.day - a.day);
  for (const x of need.slice(0, 25)) {
    const o = await ownerOf(ctx.db, x.s.id);
    calls.push({ merchantId: x.s.id, name: x.s.name, vertical: x.s.vertical, day: x.day, members: x.n, reason: x.reason, phone: o?.phone ?? x.s.phone, ownerName: o?.name ?? null });
  }
  minutes.sort((a, b) => a - b);
  const median = minutes.length ? (minutes.length % 2 ? minutes[(minutes.length - 1) / 2]! : (minutes[minutes.length / 2 - 1]! + minutes[minutes.length / 2]!) / 2) : null;
  const total = shops.length;
  const pct = (x: number) => (total ? Math.round((x / total) * 1000) / 10 : 0);
  return {
    days,
    signedUp: total,
    steps: [
      { key: "signed_up", label: "Shop created", count: total, pct: total ? 100 : 0 },
      { key: "first_stamp", label: "First stamp", count: first, pct: pct(first) },
      { key: "members_10", label: "10 members", count: ten, pct: pct(ten) },
      { key: "activated", label: `${ctx.config.activationThreshold} members`, count: act, pct: pct(act) },
    ],
    activatedIn30dPct: old ? Math.round((oldActive / old) * 1000) / 10 : null,
    medianMinutesToFirstStamp: median === null ? null : Math.round(median),
    stuckNoStamp: stuck,
    behindAtDay14: behind14,
    byVertical: [...vert.entries()].map(([vertical, v]) => ({ vertical, signedUp: v.signedUp, activated: v.activated, pct: v.signedUp ? Math.round((v.activated / v.signedUp) * 1000) / 10 : 0 })).sort((a, b) => b.signedUp - a.signedUp),
    callList: calls,
  };
}

/** Fill the funnel for shops created without going through the app (demo seed, imports). Idempotent. */
export async function backfillMilestones(db: DbOrTx): Promise<void> {
  await db.execute(sql`INSERT INTO merchant_milestones (merchant_id, key, reached_at) SELECT id, 'signed_up', created_at FROM merchants ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO merchant_milestones (merchant_id, key, reached_at) SELECT merchant_id, 'first_stamp', min(created_at) FROM visits GROUP BY merchant_id ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO merchant_milestones (merchant_id, key, reached_at) SELECT id, 'activated', activated_at FROM merchants WHERE activated_at IS NOT NULL ON CONFLICT DO NOTHING`);
}
