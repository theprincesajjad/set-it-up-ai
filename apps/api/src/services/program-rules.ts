/**
 * wave-n: rules. Saving the shop's stamp rules safely:
 *  - validation beyond zod (ids belong to the shop, regulated categories can't earn, goal bounds);
 *  - one DB transaction for the program row, the goal reward's cost and the carry-over stamps;
 *  - an audit row with who, when, before and after (read back as "Change history");
 *  - the impact preview for the confirm sheet.
 * The goal rule (earn-engine.ts carryOverStamps): customers never lose stamps or rewards they earned.
 */
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { auditLogs, catalogItems, loyaltyPrograms, merchantCategories, merchants, rewards, services, users, type DbOrTx } from "@ll/db";
import { merchantApi } from "@ll/shared";

const { STAMP_GOAL_MAX, STAMP_GOAL_MIN } = merchantApi;
import type { AppContext } from "../context.js";
import { HttpError, badRequest, notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { balancesWithProgress, carryOverStamps, goalImpact } from "./earn-engine.js";
import { postTransaction, publishBalanceChange } from "./ledger.js";
import { kickOutbox } from "./outbox.js";
import { serializeProgram } from "./merchant.js";
import { isPharmacy, pharmacyVisitEarnError } from "./pharmacy-guard.js";

type ProgramRow = typeof loyaltyPrograms.$inferSelect;

/** Field labels for the change history (owner-facing words). */
const LABELS: Record<string, string> = {
  name: "Program name",
  earnType: "How customers earn",
  earnUnit: "What one stamp is worth",
  pointsPerDollar: "Points per $1",
  pointsPerVisit: "Stamps per visit",
  minSpendCents: "Minimum purchase",
  stampGoal: "Stamps for the reward",
  terminology: "Wording",
  welcomeBonus: "Welcome bonus",
  birthdayBonus: "Birthday reward",
  referralBonus: "Referral reward",
  expiryMonths: "Expiry (months)",
  visitCooldownMinutes: "Minutes between stamps",
  termsText: "Terms",
  active: "Program on",
  counterAutoStamp: "Stamp on scan",
  rewardCostCents: "What a reward costs you",
  earnScope: "What earns",
  earnCategoryIds: "Categories that earn",
  earnItemIds: "Items that earn",
  earnServiceIds: "Services that earn",
  maxStampsPerDay: "Most stamps per day",
  pointsCost: "Stamps needed",
  rewardType: "Reward type",
  value: "Reward value",
  description: "Description",
};
export const fieldLabel = (k: string) => LABELS[k] ?? k;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Only the fields that change, as { before, after }. */
export function diffFields<T extends Record<string, unknown>>(current: T, body: Partial<T>): { before: Partial<T>; after: Partial<T> } {
  const before: Partial<T> = {};
  const after: Partial<T> = {};
  for (const k of Object.keys(body) as (keyof T)[]) {
    if (body[k] === undefined || same(current[k], body[k])) continue;
    before[k] = current[k];
    after[k] = body[k] as T[keyof T];
  }
  return { before, after };
}

/** The selected ids must be the shop's own; regulated categories can never earn. */
async function checkEarnIds(db: DbOrTx, merchantId: string, body: merchantApi.UpdateProgramBody) {
  if (body.earnCategoryIds?.length) {
    const rows = await db.select({ id: merchantCategories.id, name: merchantCategories.name, earn: merchantCategories.earnEligible, dispensary: merchantCategories.dispensary }).from(merchantCategories).where(and(eq(merchantCategories.merchantId, merchantId), inArray(merchantCategories.id, body.earnCategoryIds)));
    if (rows.length !== body.earnCategoryIds.length) throw badRequest("One of the categories isn't in your shop");
    const locked = rows.find((r) => r.dispensary || !r.earn);
    if (locked) throw new HttpError(422, "no_earn_category", `"${locked.name}" never earns, so it can't be on the list.`, { category: locked.name });
  }
  if (body.earnItemIds?.length) {
    const rows = await db.select({ id: catalogItems.id }).from(catalogItems).where(and(eq(catalogItems.merchantId, merchantId), inArray(catalogItems.id, body.earnItemIds)));
    if (rows.length !== body.earnItemIds.length) throw badRequest("One of the items isn't in your shop");
  }
  if (body.earnServiceIds?.length) {
    const rows = await db.select({ id: services.id }).from(services).where(and(eq(services.merchantId, merchantId), inArray(services.id, body.earnServiceIds)));
    if (rows.length !== body.earnServiceIds.length) throw badRequest("One of the services isn't in your shop");
  }
}

/** Shared checks for a would-be program (PATCH and impact preview). Returns the body to store. */
async function validate(ctx: AppContext, merchantId: string, current: ProgramRow, input: merchantApi.UpdateProgramBody): Promise<merchantApi.UpdateProgramBody> {
  let body = { ...input };
  if (body.expiryMonths !== undefined && body.expiryMonths !== null && body.expiryMonths < 12) throw badRequest("Points expiry must be at least 12 months of inactivity");
  const next = { ...current, ...body };
  // Pharmacies earn on front-store dollars only: a visit or a stamp may include a prescription.
  const [shop] = await ctx.db.select({ vertical: merchants.vertical }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  const rxShop = isPharmacy(shop ?? { vertical: "" });
  if (rxShop && next.earnType !== "per_dollar") throw pharmacyVisitEarnError();
  // ...and never pay for joining or for a first visit: the welcome bonus stays 0 at a pharmacy.
  if (rxShop) body = { ...body, welcomeBonus: 0 };
  if (next.earnType === "per_dollar" && next.pointsPerDollar < 1) throw badRequest("Points per dollar must be at least 1");
  if (next.earnType !== "per_dollar" && next.pointsPerVisit < 1) throw badRequest("Points per visit must be at least 1");
  if (next.earnType === "stamps" && next.stampGoal < 1) throw badRequest("Set how many stamps earn the reward");
  if (next.earnType === "stamps" && body.stampGoal !== undefined && (body.stampGoal < STAMP_GOAL_MIN || body.stampGoal > STAMP_GOAL_MAX))
    throw badRequest(`Pick ${STAMP_GOAL_MIN} to ${STAMP_GOAL_MAX} stamps`, [{ path: "stampGoal", message: `Pick ${STAMP_GOAL_MIN} to ${STAMP_GOAL_MAX} stamps` }]);
  if (next.earnScope === "selected" && !next.earnCategoryIds.length && !next.earnItemIds.length && !next.earnServiceIds.length)
    throw badRequest("Choose at least one service, category or item that earns, or pick Everything", [{ path: "earnScope", message: "Choose at least one" }]);
  await checkEarnIds(ctx.db, merchantId, body);
  // Stamp on scan never applies to per-dollar programs (the amount must be typed), nor to "pickup" cards (orders stamp themselves).
  if (next.earnType === "per_dollar" || next.earnUnit === "pickup") body = { ...body, counterAutoStamp: false };
  // "One visit" has no minimum; "One purchase" may have one.
  if (body.earnUnit === "visit" && next.earnType !== "per_dollar") body = { ...body, minSpendCents: 0 };
  return body;
}

const goalChange = (current: ProgramRow, body: merchantApi.UpdateProgramBody) => {
  const nextType = body.earnType ?? current.earnType;
  if (current.earnType !== "stamps" || nextType !== "stamps") return null;
  const to = body.stampGoal ?? current.stampGoal;
  return current.stampGoal > 0 && to !== current.stampGoal ? { from: current.stampGoal, to } : null;
};

function impactLines(goal: { from: number; to: number } | null, i: ReturnType<typeof goalImpact>): string[] {
  if (!goal) return [];
  const people = (n: number) => `${n.toLocaleString("en-CA")} ${n === 1 ? "customer" : "customers"}`;
  if (goal.to < goal.from)
    return [
      `The card goes from ${goal.from} to ${goal.to} stamps. Everyone keeps their stamps.`,
      i.rewardsUnlocked ? `${people(i.rewardsUnlocked)} can claim their reward right away.` : "Nobody is close enough to claim a reward yet.",
    ];
  return [
    `The card goes from ${goal.from} to ${goal.to} stamps. Nobody loses stamps or a reward they earned.`,
    i.membersCarriedOver
      ? `${people(i.membersCarriedOver)} with stamps get ${i.stampsCarriedOver.toLocaleString("en-CA")} carry-over stamps in total, so they need the same number of visits as before for their current reward.`
      : "No customer has stamps yet, so nobody is affected.",
    "After their current reward, the new goal applies.",
  ];
}

async function loadProgramRow(db: DbOrTx, merchantId: string): Promise<ProgramRow> {
  const [p] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  if (!p) throw notFound("Loyalty program");
  return p;
}

export async function programImpact(ctx: AppContext, merchantId: string, input: merchantApi.UpdateProgramBody): Promise<merchantApi.ProgramImpact> {
  const current = await loadProgramRow(ctx.db, merchantId);
  const body = await validate(ctx, merchantId, current, input);
  const goal = goalChange(current, body);
  const balances = await balancesWithProgress(ctx.db, merchantId);
  const i = goal ? goalImpact(balances, goal.from, goal.to) : { membersWithProgress: balances.length, rewardsUnlocked: 0, membersCarriedOver: 0, stampsCarriedOver: 0 };
  return { goal, ...i, lines: impactLines(goal, i) };
}

/** PATCH /program: validate, save, move the goal reward, carry stamps over on a raised goal, audit before/after. */
export async function updateProgramRules(ctx: AppContext, merchantId: string, actorUserId: string, input: merchantApi.UpdateProgramBody, meta: { ip?: string | null } = {}) {
  const current = await loadProgramRow(ctx.db, merchantId);
  const body = await validate(ctx, merchantId, current, input);
  const goal = goalChange(current, body);
  const { before, after } = diffFields(current as unknown as Record<string, unknown>, body as Record<string, unknown>);
  const now = ctx.now();
  let carried = { members: 0, stamps: 0 };
  const saved = await ctx.db.transaction(async (tx) => {
    const [p] = await tx.update(loyaltyPrograms).set({ ...body, updatedAt: now }).where(eq(loyaltyPrograms.merchantId, merchantId)).returning();
    let movedRewards: string[] = [];
    if (goal) {
      // The goal reward costs the goal: move it with the goal (tiers below the goal keep their own cost).
      const moved = await tx.update(rewards).set({ pointsCost: goal.to }).where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true), eq(rewards.pointsCost, goal.from))).returning({ id: rewards.id });
      movedRewards = moved.map((r) => r.id);
    }
    if (goal && goal.to > goal.from) {
      const balances = await balancesWithProgress(tx, merchantId);
      const change = `${goal.from}-${goal.to}-${now.getTime()}`;
      for (const b of balances) {
        const add = carryOverStamps(b.balance, goal.from, goal.to);
        if (add <= 0) continue;
        const r = await postTransaction(tx, {
          merchantId,
          memberId: b.id,
          type: "adjust",
          source: "system",
          points: add,
          description: `Card changed from ${goal.from} to ${goal.to} stamps: your progress carries over`,
          staffUserId: actorUserId,
          idempotencyKey: `goal:${change}:${b.id}`,
          at: now,
        });
        if (r.duplicate) continue;
        carried = { members: carried.members + 1, stamps: carried.stamps + add };
        await publishBalanceChange(ctx, tx, {
          kind: "adjust",
          merchantId,
          memberId: b.id,
          userId: r.member.userId,
          delta: add,
          balance: r.member.balance,
          previousBalance: r.member.balance - add,
          source: "system",
          at: now,
          transactionId: r.transaction.id,
        });
      }
    }
    if (Object.keys(after).length || movedRewards.length) {
      await writeAudit(tx, {
        actorUserId,
        merchantId,
        action: "program.updated",
        entity: "loyalty_program",
        entityId: p!.id,
        ip: meta.ip ?? null,
        data: { before, after, ...(goal ? { goal, movedRewards, carriedOver: carried } : {}) },
      });
    }
    return p!;
  });
  if (carried.members) await kickOutbox(ctx);
  return serializeProgram(saved);
}

// ---------------------------------------------------------------------------
// Change history
// ---------------------------------------------------------------------------
const HISTORY_ACTIONS = ["program.updated", "reward.created", "reward.updated", "reward.deleted", "reward.archived"];

function historyNote(action: string, data: Record<string, unknown> | null): string | null {
  const carried = data?.carriedOver as { members: number; stamps: number } | undefined;
  const goal = data?.goal as { from: number; to: number } | undefined;
  if (goal && goal.to > goal.from) return carried?.members ? `${carried.members} ${carried.members === 1 ? "customer" : "customers"} got ${carried.stamps} carry-over stamps.` : "No customer had stamps to carry over.";
  if (goal) return "Everyone kept their stamps.";
  if (action === "reward.created") return `Added ${String((data?.after as { name?: string } | undefined)?.name ?? data?.name ?? "a reward")}.`;
  if (action === "reward.deleted" || action === "reward.archived") return `Removed ${String((data?.before as { name?: string } | undefined)?.name ?? "a reward")}.`;
  return null;
}

export async function programHistory(ctx: AppContext, merchantId: string, limit = 50): Promise<merchantApi.ProgramHistoryResponse> {
  const rows = await ctx.db
    .select({ a: auditLogs, name: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(eq(auditLogs.merchantId, merchantId), or(inArray(auditLogs.action, HISTORY_ACTIONS), like(auditLogs.action, "program.%"))))
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));
  return {
    items: rows.map(({ a, name }) => {
      const data = (a.data ?? null) as Record<string, unknown> | null;
      const before = (data?.before ?? {}) as Record<string, unknown>;
      const after = (data?.after ?? (data && !data.before ? data : {})) as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => k in LABELS);
      return {
        id: a.id,
        at: a.createdAt.toISOString(),
        action: a.action,
        actor: { userId: a.actorUserId, name },
        changes: keys.map((k) => ({ field: a.action.startsWith("reward.") && k === "name" ? "Reward name" : fieldLabel(k), before: before[k] ?? null, after: after[k] ?? null })),
        note: historyNote(a.action, data),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// What the shop sells (to choose what earns)
// ---------------------------------------------------------------------------
const REGULATED = /(prescription|\brx\b|pharmacy services?|dispensing|tobacco|cigarette|vape|lottery|lotto|gift ?cards?)/i;

export async function earnOptions(ctx: AppContext, merchantId: string): Promise<merchantApi.EarnOptions> {
  const [cats, items, svcs] = await Promise.all([
    ctx.db.select({ id: merchantCategories.id, name: merchantCategories.name, earn: merchantCategories.earnEligible, dispensary: merchantCategories.dispensary }).from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId)).orderBy(merchantCategories.name),
    ctx.db.select({ id: catalogItems.id, name: catalogItems.name, categoryId: catalogItems.categoryId }).from(catalogItems).where(and(eq(catalogItems.merchantId, merchantId), eq(catalogItems.available, true))).orderBy(catalogItems.sortOrder, catalogItems.name).limit(500),
    ctx.db.select({ id: services.id, name: services.name, categoryId: services.categoryId }).from(services).where(and(eq(services.merchantId, merchantId), eq(services.active, true))).orderBy(services.sort, services.name).limit(500),
  ]);
  return {
    categories: cats.map((c) => ({ id: c.id, name: c.name, protected: c.dispensary || !c.earn || REGULATED.test(c.name) })),
    items,
    services: svcs,
  };
}
