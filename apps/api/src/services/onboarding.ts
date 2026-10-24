/**
 * Onboarding and activation: milestones, the owner's activation view, the paid-tier moment, setup nudges and
 * the admin funnel. The rules (pace, upsell timing, nudge schedule, playbooks) are pure and live in
 * @ll/shared onboarding.ts; this file reads the database and applies them.
 */
import { and, count, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { auditLogs, integrations, loyaltyPrograms, merchantMilestones, merchantMembers, merchantStaff, merchants, rewards, users, type DbOrTx } from "@ll/db";
import {
  ACTIVATION,
  BRAND,
  NUDGE_RULES,
  PACE_LABEL,
  daysSince,
  dueNudge,
  nudgeText,
  paceFor,
  playbookFor,
  upsellMoment,
  type MilestoneKey,
  type NudgeKey,
  type adminApi,
  type merchantApi,
} from "@ll/shared";
import type { AppContext } from "../context.js";
import { notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";

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
export async function recordVisitMilestones(ctx: AppContext, tx: DbOrTx, merchant: Pick<Merchant, "id" | "activatedAt" | "status">): Promise<boolean> {
  const members = await visitedMembers(tx, merchant.id);
  const at = ctx.now();
  if (members >= 1) await recordMilestone(tx, merchant.id, "first_stamp", at);
  if (members >= ACTIVATION.previewMembers) await recordMilestone(tx, merchant.id, "members_10", at);
  if (merchant.activatedAt || members < ctx.config.activationThreshold) return false;
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
const STEP_LABELS: Record<merchantApi.OnboardingStepKey, string> = {
  program: "Program confirmed",
  first_stamp: "Give your first stamp",
  qr_kit: "Print the QR stand",
  staff: "Staff and counter app",
  first_members: "First 25 members",
  profile: "Logo, about text and GST/HST",
  pos: "Connect your POS",
};
const CORE: merchantApi.OnboardingStepKey[] = ["program", "first_stamp", "qr_kit", "staff", "first_members"];
const LATER: merchantApi.OnboardingStepKey[] = ["profile", "pos"];

const SOURCE_OF: Record<string, merchantApi.OnboardingSource["source"]> = { phone: "counter", pos: "counter", import: "counter", qr: "qr", app: "link", web: "link", wallet: "link", campaign: "link", referral: "link" };
const SOURCE_LABEL: Record<merchantApi.OnboardingSource["source"], string> = { counter: "At the counter, asked by staff", qr: "QR stand", link: "Join link", other: "Other" };

function minutesLabel(min: number): string {
  if (min < 1) return "under a minute later";
  if (min < 90) return `${Math.round(min)} min later`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h later`;
  return `day ${Math.floor(min / 1440)}`;
}

export async function getOnboardingChecklist(ctx: AppContext, merchantId: string): Promise<merchantApi.OnboardingChecklist> {
  const db = ctx.db;
  const now = ctx.now();
  const [m] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const [[program], [rewardRow], [staffRow], [posRow], marks, ms, members, sourceRows] = await Promise.all([
    db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1),
    db.select({ n: count() }).from(rewards).where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true))),
    db.select({ n: count() }).from(merchantStaff).where(eq(merchantStaff.merchantId, merchantId)),
    db.select({ n: count() }).from(integrations).where(and(eq(integrations.merchantId, merchantId), eq(integrations.status, "connected"))),
    db.select({ data: auditLogs.data }).from(auditLogs).where(and(eq(auditLogs.merchantId, merchantId), eq(auditLogs.action, "onboarding.step_completed"))),
    milestonesFor(db, merchantId),
    visitedMembers(db, merchantId),
    db.select({ via: merchantMembers.joinedVia, n: count() }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchantId), gte(merchantMembers.visitCount, 1))).groupBy(merchantMembers.joinedVia),
  ]);
  const marked = new Set(marks.map((r) => (r.data as { step?: string } | null)?.step).filter(Boolean));
  const target = ctx.config.activationThreshold;
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
  };
  const detail: Record<merchantApi.OnboardingStepKey, string | null> = {
    program: program ? `${program.earnType.replace("_", " ")} · ${program.terminology}` : null,
    first_stamp: firstStamp ? null : "Waiting for your first stamp",
    qr_kit: null,
    staff: `${Number(staffRow?.n ?? 0)} team member(s)`,
    first_members: `${Math.min(members, target)} of ${target} members have visited`,
    profile: null,
    pos: null,
  };
  const mk = (key: merchantApi.OnboardingStepKey) => ({ key, label: STEP_LABELS[key], done: done[key], detail: detail[key] });
  const steps = CORE.map(mk);
  const later = LATER.map(mk);
  const current = steps.find((s) => !s.done)?.key ?? "done";
  if (m.onboardingStep !== current) await db.update(merchants).set({ onboardingStep: current }).where(eq(merchants.id, merchantId));

  // Activation view
  const day = daysSince(m.createdAt, now);
  const pace = paceFor({ day, members, activated, target, windowDays: ACTIVATION.windowDays });
  const stampAt = ms.get("first_stamp") ?? null;
  const firstStampMinutes = stampAt ? Math.max(0, (stampAt.getTime() - m.createdAt.getTime()) / 60_000) : null;
  const at10 = ms.get("members_10") ?? null;
  const atActive = ms.get("activated") ?? m.activatedAt ?? null;
  const bySource = new Map<merchantApi.OnboardingSource["source"], number>();
  for (const r of sourceRows) {
    const s = SOURCE_OF[r.via] ?? "other";
    bySource.set(s, (bySource.get(s) ?? 0) + Number(r.n));
  }
  const sources = (["counter", "qr", "link", "other"] as const).filter((s) => bySource.get(s)).map((s) => ({ source: s, label: SOURCE_LABEL[s], count: bySource.get(s)! }));
  const milestones: merchantApi.OnboardingMilestone[] = [
    { key: "signed_up", label: "Signed up", at: iso(m.createdAt), detail: m.createdAt.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Toronto" }) },
    { key: "first_stamp", label: "First stamp", at: iso(stampAt), detail: stampAt ? minutesLabel(firstStampMinutes!) : "Not yet" },
    { key: "members_10", label: "10 members", at: iso(at10), detail: at10 ? `Day ${daysSince(m.createdAt, at10)}` : members >= 1 ? `Needs ${Math.max(0, 10 - members)} more` : "Not yet" },
    { key: "activated", label: `${target} members`, at: iso(atActive), detail: atActive ? `Day ${daysSince(m.createdAt, atActive)}` : `Needs ${Math.max(0, target - members)} more` },
  ];
  const playbook = playbookFor(m.vertical);
  const nextMove = nextMoveFor({ firstStamp, qrDone: done.qr_kit, staffDone: done.staff, activated, pace, members, target, sources, playbook });
  const paying = m.plan !== "free" || !!m.restaurantTier;
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
      windowDays: ACTIVATION.windowDays,
      day,
      daysLeft: Math.max(0, ACTIVATION.windowDays - day),
      members,
      target,
      leadingMembers: ACTIVATION.leadingMembers,
      leadingByDay: ACTIVATION.leadingByDay,
      pace,
      paceLabel: pace === "activated" || pace === "late" ? PACE_LABEL[pace] : `${PACE_LABEL[pace]} · day ${Math.min(day + 1, ACTIVATION.windowDays)} of ${ACTIVATION.windowDays}`,
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

function nextMoveFor(a: { firstStamp: boolean; qrDone: boolean; staffDone: boolean; activated: boolean; pace: string; members: number; target: number; sources: merchantApi.OnboardingSource[]; playbook: ReturnType<typeof playbookFor> }): merchantApi.OnboardingActivation["nextMove"] {
  if (!a.firstStamp) return { title: "Give your first stamp", body: a.playbook.firstStampHint, cta: "Stamp yourself", path: "/setup?step=first_stamp" };
  if (a.activated) return { title: "You are an active shop", body: "Your regulars are on the card. Connect your POS so stamps happen on their own.", cta: "Connect POS", path: "/integrations" };
  if (!a.qrDone) return { title: "Print the QR stand", body: "Customers join in 30 seconds with no app. Put it next to the card machine.", cta: "Print QR stand", path: "/locations/kit" };
  if (!a.staffDone && a.members >= 3) return { title: "Add your first cashier", body: "Every person at the till can stamp from their own phone, and members join faster when staff ask.", cta: "Add staff", path: "/setup?step=staff" };
  const counter = a.sources.find((s) => s.source === "counter")?.count ?? 0;
  const qr = a.sources.find((s) => s.source === "qr")?.count ?? 0;
  const tail = a.members > 0 && counter + qr > 0 ? ` ${counter} of your ${a.members} joined at the counter, ${qr} from the QR stand.` : "";
  return { title: "Best next move", body: `Say it at the till: "${a.playbook.tillLine}"${tail}`, cta: "Open counter", path: "/counter" };
}

export async function dismissUpsell(ctx: AppContext, merchantId: string, actorUserId: string) {
  await ctx.db.insert(merchantMilestones).values({ merchantId, key: "upsell_dismissed", reachedAt: ctx.now() }).onConflictDoUpdate({ target: [merchantMilestones.merchantId, merchantMilestones.key], set: { reachedAt: ctx.now() } });
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "onboarding.upsell_dismissed", entity: "merchant", entityId: merchantId, data: {} });
  return getOnboardingChecklist(ctx, merchantId);
}

export async function setNudges(ctx: AppContext, merchantId: string, actorUserId: string, enabled: boolean) {
  if (enabled) await removeMilestone(ctx.db, merchantId, "nudges_off");
  else await recordMilestone(ctx.db, merchantId, "nudges_off", ctx.now());
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "onboarding.nudges", entity: "merchant", entityId: merchantId, data: { enabled } });
  return getOnboardingChecklist(ctx, merchantId);
}

// ---------------------------------------------------------------------------
// Nudges (job)
// ---------------------------------------------------------------------------
async function ownerOf(db: DbOrTx, merchantId: string) {
  const [o] = await db
    .select({ name: users.name, email: users.email, phone: users.phone })
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
    // Claim the nudge first so a crash or a second worker cannot send it twice.
    if (!(await recordMilestone(ctx.db, m.id, key, now, { members }))) continue;
    // Earlier nudges that are now moot are marked sent too, so a late shop gets one message, not a pile.
    for (const r of NUDGE_RULES) if (r.key !== key && (now.getTime() - m.createdAt.getTime()) / 3_600_000 >= r.afterHours && !sentKeys.has(r.key) && r.afterHours < NUDGE_RULES.find((x) => x.key === key)!.afterHours) await recordMilestone(ctx.db, m.id, r.key, now, { skipped: true });
    const day = daysSince(m.createdAt, now);
    const text = nudgeText(key, {
      shopName: m.name,
      members,
      daysLeft: Math.max(0, ACTIVATION.windowDays - day),
      target: ctx.config.activationThreshold,
      tillLine: playbookFor(m.vertical).tillLine,
      url: `${ctx.config.publicWebUrl.replace(/\/$/, "")}/m/${m.id}/setup`,
    });
    const footer = `\nStop setup reminders: ${ctx.config.publicWebUrl.replace(/\/$/, "")}/m/${m.id}/setup`;
    try {
      if (smsTo) await ctx.providers.sms.send(smsTo, `${BRAND.name}: ${text.body}${footer}`);
      else await ctx.providers.email.send({ to: owner.email!, subject: text.subject, text: `${text.body}${footer}` });
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
    if (hasFirst) first++;
    if (hasTen) ten++;
    if (isAct) act++;
    const stamp = ms.get("first_stamp");
    if (stamp) minutes.push(Math.max(0, (stamp.getTime() - s.createdAt.getTime()) / 60_000));
    const v = vert.get(s.vertical) ?? { signedUp: 0, activated: 0 };
    v.signedUp++;
    if (isAct) v.activated++;
    vert.set(s.vertical, v);
    if (now.getTime() - s.createdAt.getTime() >= ACTIVATION.windowDays * DAY) {
      old++;
      if (s.activatedAt && s.activatedAt.getTime() - s.createdAt.getTime() <= ACTIVATION.windowDays * DAY) oldActive++;
    }
    if (!hasFirst && now.getTime() - s.createdAt.getTime() >= ACTIVATION.stuckAfterHours * 3_600_000) {
      stuck++;
      need.push({ s, day, n, reason: "No first stamp" });
    } else if (!isAct && day >= ACTIVATION.leadingByDay && day <= ACTIVATION.windowDays && n < ACTIVATION.leadingMembers) {
      behind14++;
      need.push({ s, day, n, reason: `${n} member${n === 1 ? "" : "s"}, needs ${ACTIVATION.leadingMembers} by day ${ACTIVATION.leadingByDay}` });
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
