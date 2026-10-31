/**
 * Rollout control rules (admin.md §1). Pure so the guard rails are unit-tested:
 *  - free-forever features are locked to GA (server enforces FREE_FOREVER too),
 *  - GA changes require typing the feature key,
 *  - every stage change explains its effect in plain words.
 */
import type { adminApi } from "@ll/shared";

export type Stage = "hidden" | "beta" | "ga";
export const STAGE_LABEL: Record<Stage, string> = { hidden: "Hidden", beta: "Early access", ga: "Live" };

export function stageLocked(f: Pick<adminApi.AdminFeature, "freeForever">): boolean {
  return f.freeForever;
}

export function allowedStages(f: Pick<adminApi.AdminFeature, "freeForever">): Stage[] {
  return f.freeForever ? ["ga"] : ["hidden", "beta", "ga"];
}

export function requiresTypedKey(to: Stage): boolean {
  return to === "ga";
}

export function canConfirmStage(f: Pick<adminApi.AdminFeature, "key" | "freeForever" | "stage">, to: Stage, typed: string): boolean {
  if (!allowedStages(f).includes(to) || f.stage === to) return false;
  return !requiresTypedKey(to) || typed.trim() === f.key;
}

const PLAN_NAME: Record<string, string> = { free: "every plan", plus: "Pro", pro: "Service" };

export function stageEffect(f: Pick<adminApi.AdminFeature, "name" | "minPlan" | "phase">, to: Stage): string {
  const who = f.minPlan === "free" ? "every shop" : `shops on ${PLAN_NAME[f.minPlan]}`;
  if (to === "hidden") return `${f.name} disappears for everyone except shops that were given access by hand. Their data is kept.`;
  if (to === "beta") return `${f.name} turns on for ${who} who turned on early access. Their customers will see it too. Everyone else keeps seeing "Coming soon".`;
  return `${f.name} turns on for ${who}. ${f.minPlan === "free" ? "" : `The ${PLAN_NAME[f.minPlan]} plan becomes purchasable. `}This is a public launch.`;
}

/** DensityGauge status (system.md): low < 40% of target, building 40–99%, ready ≥ 100%. */
export function gaugeStatus(value: number, target: number): "low" | "building" | "ready" {
  if (target <= 0) return "ready";
  const r = value / target;
  if (r >= 1) return "ready";
  return r >= 0.4 ? "building" : "low";
}

/** An override can force a feature off only when it isn't free forever. */
export function canForceOff(f: Pick<adminApi.AdminFeature, "freeForever">): boolean {
  return !f.freeForever;
}

export function groupFeatures(items: adminApi.AdminFeature[]): { id: string; title: string; items: adminApi.AdminFeature[] }[] {
  const groups = [
    { id: "plus", title: "Phase 2 · Pro", test: (f: adminApi.AdminFeature) => f.phase === 2 && f.minPlan === "plus" },
    // Studio (founder packaging, Oct 29): its own plan now, so its features (order-ahead, POS auto-award …) need their own group or the page drops them.
    { id: "studio", title: "Phase 2 · Studio", test: (f: adminApi.AdminFeature) => f.phase === 2 && f.minPlan === "studio" },
    { id: "pro", title: "Phase 2 · Service", test: (f: adminApi.AdminFeature) => f.phase === 2 && f.minPlan === "pro" },
    { id: "network", title: "Phase 3 · Needs many shops", test: (f: adminApi.AdminFeature) => f.phase === 3 },
    { id: "free", title: "Free forever · Phase 1", test: (f: adminApi.AdminFeature) => f.freeForever || (f.phase === 1 && f.minPlan === "free") },
  ];
  const used = new Set<string>();
  return groups.map((g) => {
    const its = items.filter((f) => !used.has(f.key) && g.test(f));
    its.forEach((f) => used.add(f.key));
    return { id: g.id, title: g.title, items: its };
  });
}
