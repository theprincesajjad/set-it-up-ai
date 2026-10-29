/**
 * /admin/experiments: exposures, conversions and confidence for the pre-registered landing tests (packages/shared/src/experiments.ts;
 * docs/marketing/value-props.md §3.7–3.8). Reads only, except three admin writes: record the interim look, type a cost per signup,
 * end a test. Every write goes to the audit log.
 *
 * Counting (ab-spec §4.3):
 *  - exposures: distinct anonymous ids with a `view` row for the test, by variant; start submits likewise;
 *  - signed up: `signed_up` milestones whose data.experimentId is the test, by data.variant;
 *  - link live: those shops with `booking_link_live` within 7 days of signing up; first booking: `first_online_booking` within
 *    7 days of link live; paid: a Pro (`plus`) subscription created within 30 days of signing up;
 *  - unmatched: signups whose anonymous id has no `view` row (cookie cleared, GPC on, another device). They still count.
 *
 * Peeking guard: the p-values and lifts are in the response only while a pre-registered look is open (the interim at
 * `interimAt` × horizon until an admin records it, then the final at the horizon). At any other time `lift` is not sent at all.
 */
import { readFileSync } from "node:fs";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { experimentEnds, experimentGuardrailInputs, experimentLooks, landingEvents, merchantMilestones, subscriptions } from "@ll/db";
import { CONTROL_VARIANT, EXPERIMENTS, experimentById, isArm, isRunning, type Experiment, type experimentsApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { experimentClock } from "./landing-events.js";

type Rate = experimentsApi.Rate;
type Look = experimentsApi.Look;

// ---------------------------------------------------------------------------------------------------------------- statistics

/** z for a two-sided 95% interval. */
export const Z95 = 1.959963984540054;

/** Complementary error function (Numerical Recipes' erfcc, Chebyshev fit; fractional error < 1.2e-7 everywhere). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Standard normal CDF. */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

/** Wilson score interval for x successes in n trials (95% by default). n = 0 says nothing: [0, 1]. */
export function wilson(x: number, n: number, z = Z95): Rate {
  if (n <= 0) return { p: 0, lo: 0, hi: 1 };
  const k = Math.min(Math.max(x, 0), n);
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** Two-proportion z-test (pooled), two-sided: arm (x1/n1) against control (x2/n2). */
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): { z: number; pValue: number } {
  if (n1 <= 0 || n2 <= 0) return { z: 0, pValue: 1 };
  const p1 = Math.min(x1, n1) / n1;
  const p2 = Math.min(x2, n2) / n2;
  const pool = (Math.min(x1, n1) + Math.min(x2, n2)) / (n1 + n2);
  const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, pValue: 1 };
  const z = (p1 - p2) / se;
  return { z, pValue: Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))) };
}

/** Which pre-registered look is open: the final at the horizon; the interim from interimAt × horizon until it is recorded. */
export function lookFor(exp: Pick<Experiment, "horizonExposures" | "interimAt">, exposures: number, interimTaken: boolean): Look {
  if (exposures >= exp.horizonExposures) return "final";
  if (exposures >= exp.interimAt * exp.horizonExposures && !interimTaken) return "interim";
  return "none";
}

export function alphaFor(exp: Pick<Experiment, "alphaInterim" | "alphaFinal">, look: Look): number | null {
  return look === "interim" ? exp.alphaInterim : look === "final" ? exp.alphaFinal : null;
}

// ---------------------------------------------------------------------------------------------------------------- report

const DAY = 86_400_000;

function requireExperiment(id: string): Experiment {
  const exp = experimentById(id);
  if (!exp) throw notFound("Experiment");
  return exp;
}

/** Lighthouse scores from the last e2e run: { "<experimentId>:<variant>": 93, "<variant>": 91 }. Missing file → none. */
function lighthouseScores(ctx: AppContext): Record<string, number> {
  const path = ctx.config.experiments.lighthouseJson;
  if (!path) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === "number"));
  } catch {
    return {};
  }
}

async function endOf(ctx: AppContext, exp: Experiment): Promise<{ at: string; reason: string | null } | null> {
  const [row] = await ctx.db.select().from(experimentEnds).where(eq(experimentEnds.experimentId, exp.id)).limit(1);
  if (row) return { at: row.endedAt.toISOString(), reason: row.reason };
  if (exp.endedAt && new Date(exp.endedAt).getTime() <= ctx.now().getTime()) return { at: new Date(exp.endedAt).toISOString(), reason: null };
  return null;
}

function statusOf(exp: Experiment, now: Date, ended: boolean, look: Look): experimentsApi.ExperimentStatus {
  if (ended) return "ended";
  if (!isRunning(exp, now)) return now.getTime() < new Date(exp.startedAt).getTime() ? "scheduled" : "ended";
  return look === "final" ? "horizon" : look === "interim" ? "interim" : "running";
}

interface Signup {
  merchantId: string;
  variant: string;
  anonId: string | null;
  source: string | null;
  at: Date;
  linkLive: boolean;
  firstBooking: boolean;
  paid: boolean;
}

async function signupsFor(ctx: AppContext, exp: Experiment): Promise<Signup[]> {
  const rows = await ctx.db
    .select({ merchantId: merchantMilestones.merchantId, reachedAt: merchantMilestones.reachedAt, data: merchantMilestones.data })
    .from(merchantMilestones)
    .where(and(eq(merchantMilestones.key, "signed_up"), sql`${merchantMilestones.data}->>'experimentId' = ${exp.id}`));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.merchantId);
  const later = await ctx.db
    .select({ merchantId: merchantMilestones.merchantId, key: merchantMilestones.key, reachedAt: merchantMilestones.reachedAt })
    .from(merchantMilestones)
    .where(and(inArray(merchantMilestones.merchantId, ids), inArray(merchantMilestones.key, ["booking_link_live", "first_online_booking"])));
  const subs = await ctx.db
    .select({ merchantId: subscriptions.merchantId, createdAt: subscriptions.createdAt })
    .from(subscriptions)
    .where(and(inArray(subscriptions.merchantId, ids), eq(subscriptions.plan, "plus")));
  const at = (mid: string, key: string) => later.find((l) => l.merchantId === mid && l.key === key)?.reachedAt ?? null;
  return rows.map((r) => {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const live = at(r.merchantId, "booking_link_live");
    const first = at(r.merchantId, "first_online_booking");
    const linkLive = !!live && live.getTime() - r.reachedAt.getTime() <= 7 * DAY;
    return {
      merchantId: r.merchantId,
      variant: typeof d.variant === "string" ? d.variant : CONTROL_VARIANT,
      anonId: typeof d.anonId === "string" ? d.anonId : null,
      source: typeof d.source === "string" ? d.source : null,
      at: r.reachedAt,
      linkLive,
      firstBooking: linkLive && !!first && first.getTime() - live!.getTime() <= 7 * DAY,
      paid: subs.some((s) => s.merchantId === r.merchantId && s.createdAt.getTime() - r.reachedAt.getTime() <= 30 * DAY),
    };
  });
}

function guardrailsFor(
  exp: Experiment,
  variant: string,
  share: number | null,
  costs: { costPerSignupCents: number; createdAt: Date }[],
  lighthouse: number | null,
): experimentsApi.ArmGuardrails {
  const [latest, before] = costs;
  const max = exp.guardrails.maxCostPerSignupCents;
  let status: experimentsApi.ArmGuardrails["status"] = "ok";
  // A variant above the cost bar for two weekly readings in a row is paused (value-props §3.2); one reading is a warning.
  if (latest && latest.costPerSignupCents > max) status = before && before.costPerSignupCents > max ? "red" : "watch";
  if (variant !== CONTROL_VARIANT && share !== null && share < exp.guardrails.minLinkLiveShareOfControl) status = "red";
  if (lighthouse !== null && lighthouse < 90) status = "red";
  return { costPerSignupCents: latest?.costPerSignupCents ?? null, linkLiveShareOfControl: share, lighthouse, status };
}

export async function experimentReport(ctx: AppContext, id: string, clockHeader?: string | string[] | null): Promise<experimentsApi.ExperimentReport> {
  const exp = requireExperiment(id);
  const now = experimentClock(ctx, clockHeader);
  const events = await ctx.db
    .select({ anonId: landingEvents.anonId, variant: landingEvents.variant, kind: landingEvents.kind, trade: landingEvents.trade, src: landingEvents.src })
    .from(landingEvents)
    .where(and(eq(landingEvents.experimentId, exp.id), inArray(landingEvents.kind, ["view", "start_submit"])));
  const views = new Map<string, { variant: string; trade: string; src: string }>();
  const submits = new Map<string, string>();
  for (const e of events) {
    if (e.kind === "view" && !views.has(e.anonId)) views.set(e.anonId, { variant: e.variant, trade: e.trade, src: e.src ?? "direct" });
    if (e.kind === "start_submit") submits.set(e.anonId, e.variant);
  }
  const signups = await signupsFor(ctx, exp);
  const [taken] = await ctx.db.select().from(experimentLooks).where(and(eq(experimentLooks.experimentId, exp.id), eq(experimentLooks.look, "interim"))).limit(1);
  const exposures = views.size;
  const look = lookFor(exp, exposures, !!taken);
  const alpha = alphaFor(exp, look);
  const ended = await endOf(ctx, exp);
  const costs = await ctx.db.select().from(experimentGuardrailInputs).where(eq(experimentGuardrailInputs.experimentId, exp.id)).orderBy(desc(experimentGuardrailInputs.createdAt));
  const lh = lighthouseScores(ctx);

  const counts = exp.arms.map(({ variant }) => {
    const mine = signups.filter((s) => s.variant === variant);
    return {
      variant,
      exposures: [...views.values()].filter((v) => v.variant === variant).length,
      startSubmits: [...submits.values()].filter((v) => v === variant).length,
      signedUp: mine.length,
      linkLive: mine.filter((s) => s.linkLive).length,
      firstBooking7d: mine.filter((s) => s.firstBooking).length,
      paid30d: mine.filter((s) => s.paid).length,
      unmatchedSignups: mine.filter((s) => !s.anonId || !views.has(s.anonId)).length,
    };
  });
  const control = counts.find((c) => c.variant === CONTROL_VARIANT);
  const liveShare = (c: { linkLive: number; signedUp: number }) => (c.signedUp ? c.linkLive / c.signedUp : null);

  const arms: experimentsApi.ArmReport[] = counts.map((c) => {
    const rates = {
      startSubmit: wilson(c.startSubmits, c.exposures),
      linkLive: wilson(c.linkLive, c.exposures),
      firstBooking: wilson(c.firstBooking7d, c.exposures),
      paid: wilson(c.paid30d, c.exposures),
    };
    const lift =
      alpha !== null && control && c.variant !== CONTROL_VARIANT
        ? Object.fromEntries(
            (["startSubmit", "linkLive"] as const).map((k) => {
              const [x1, x2] = k === "startSubmit" ? [c.startSubmits, control.startSubmits] : [c.linkLive, control.linkLive];
              const { pValue } = twoProportionZ(x1, c.exposures, x2, control.exposures);
              const pc = control.exposures ? Math.min(x2, control.exposures) / control.exposures : 0;
              const pa = c.exposures ? Math.min(x1, c.exposures) / c.exposures : 0;
              return [k, { relative: pc > 0 ? (pa - pc) / pc : null, pValue, verdict: pValue < alpha ? "unlikely_chance" : "chance" }];
            }),
          )
        : undefined;
    const ctrlShare = control ? liveShare(control) : null;
    const mineShare = liveShare(c);
    const share = c.variant === CONTROL_VARIANT ? (ctrlShare === null ? null : 1) : ctrlShare && mineShare !== null ? mineShare / ctrlShare : null;
    const score = lh[`${exp.id}:${c.variant}`] ?? lh[c.variant] ?? null;
    const guardrails = guardrailsFor(exp, c.variant, share, costs.filter((r) => r.variant === c.variant), score);
    return { ...c, rates, ...(lift ? { lift: lift as experimentsApi.ArmReport["lift"] } : {}), guardrails };
  });

  // Breakdowns: counts only. A signup is placed by the trade and src of its anonymous id's view, else "unknown" / its own source.
  const byKey = (keyOf: (v: { trade: string; src: string }) => string, signupKey: (s: Signup) => string) => {
    const rows = new Map<string, { key: string; variant: string; exposures: number; startSubmits: number; linkLive: number }>();
    const row = (key: string, variant: string) => {
      const k = `${key}\u0000${variant}`;
      let r = rows.get(k);
      if (!r) rows.set(k, (r = { key, variant, exposures: 0, startSubmits: 0, linkLive: 0 }));
      return r;
    };
    for (const v of views.values()) row(keyOf(v), v.variant).exposures++;
    for (const [aid, variant] of submits) {
      const v = views.get(aid);
      row(v ? keyOf(v) : "unknown", variant).startSubmits++;
    }
    for (const s of signups.filter((x) => x.linkLive)) {
      const v = s.anonId ? views.get(s.anonId) : undefined;
      row(v ? keyOf(v) : signupKey(s), s.variant).linkLive++;
    }
    return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key) || a.variant.localeCompare(b.variant));
  };

  return {
    experiment: exp,
    status: statusOf(exp, now, !!ended, look),
    ended,
    exposures,
    horizonPct: Math.round((exposures / exp.horizonExposures) * 1000) / 10,
    look,
    alpha,
    interimTakenAt: taken ? taken.takenAt.toISOString() : null,
    arms,
    byTrade: byKey((v) => v.trade, () => "unknown").map(({ key, ...r }) => ({ trade: key, ...r })),
    bySrc: byKey((v) => v.src, (s) => s.source ?? "unknown").map(({ key, ...r }) => ({ src: key, ...r })),
  };
}

export async function listExperiments(ctx: AppContext, clockHeader?: string | string[] | null): Promise<{ items: experimentsApi.ExperimentSummary[]; nextCursor: null }> {
  const now = experimentClock(ctx, clockHeader);
  const ids = EXPERIMENTS.map((e) => e.id);
  const views = await ctx.db
    .select({ id: landingEvents.experimentId, n: count() })
    .from(landingEvents)
    .where(and(inArray(landingEvents.experimentId, ids), eq(landingEvents.kind, "view")))
    .groupBy(landingEvents.experimentId);
  const looks = await ctx.db.select({ id: experimentLooks.experimentId }).from(experimentLooks).where(eq(experimentLooks.look, "interim"));
  const items = [];
  for (const exp of EXPERIMENTS) {
    const exposures = Number(views.find((v) => v.id === exp.id)?.n ?? 0);
    const look = lookFor(exp, exposures, looks.some((l) => l.id === exp.id));
    const ended = await endOf(ctx, exp);
    items.push({ experiment: exp, status: statusOf(exp, now, !!ended, look), exposures, horizonPct: Math.round((exposures / exp.horizonExposures) * 1000) / 10 });
  }
  return { items, nextCursor: null };
}

// ---------------------------------------------------------------------------------------------------------------- admin writes

/** "Record interim look": allowed only while the interim is open. After it the report hides p-values until the horizon. */
export async function recordInterimLook(ctx: AppContext, adminId: string, id: string, ip: string | null): Promise<experimentsApi.ExperimentReport> {
  const report = await experimentReport(ctx, id);
  if (report.look !== "interim") throw conflict("The interim look is not open for this test.");
  await ctx.db.transaction(async (tx) => {
    await tx.insert(experimentLooks).values({ experimentId: id, look: "interim", takenAt: ctx.now(), adminId, snapshot: report as never }).onConflictDoNothing();
    await writeAudit(tx, { actorUserId: adminId, action: "experiment.look", entity: "experiment", entityId: id, data: { look: "interim", exposures: report.exposures }, ip });
  });
  return experimentReport(ctx, id);
}

/** A weekly cost per free signup for one arm, typed from the ads manager. */
export async function addGuardrailInput(ctx: AppContext, adminId: string, id: string, body: experimentsApi.GuardrailInputBody, ip: string | null): Promise<experimentsApi.ExperimentReport> {
  const exp = requireExperiment(id);
  if (!isArm(exp, body.variant)) throw badRequest(`"${body.variant}" is not an arm of ${exp.id}.`);
  await ctx.db.transaction(async (tx) => {
    await tx.insert(experimentGuardrailInputs).values({ experimentId: id, variant: body.variant, costPerSignupCents: body.costPerSignupCents, adminId, createdAt: ctx.now() });
    await writeAudit(tx, { actorUserId: adminId, action: "experiment.guardrail_input", entity: "experiment", entityId: id, data: body, ip });
  });
  return experimentReport(ctx, id);
}

/** "End experiment": the page stops assigning (the web proxy picks it up within a minute). A reason is required. */
export async function endExperiment(ctx: AppContext, adminId: string, id: string, reason: string, ip: string | null): Promise<experimentsApi.ExperimentReport> {
  const exp = requireExperiment(id);
  if (await endOf(ctx, exp)) throw conflict("This test has already ended.");
  await ctx.db.transaction(async (tx) => {
    await tx.insert(experimentEnds).values({ experimentId: id, endedAt: ctx.now(), adminId, reason });
    await writeAudit(tx, { actorUserId: adminId, action: "experiment.end", entity: "experiment", entityId: id, data: { reason }, ip });
  });
  return experimentReport(ctx, id);
}
