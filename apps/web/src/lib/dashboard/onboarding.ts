import type { merchantApi } from "@ll/shared";

/** Where the leading-signal marker sits on the 0..target bar. */
export function leadingMarkPct(a: Pick<merchantApi.OnboardingActivation, "leadingMembers" | "target">): number {
  return a.target > 0 ? Math.min(100, Math.max(0, (a.leadingMembers / a.target) * 100)) : 0;
}

export function paceTone(p: merchantApi.OnboardingPace): "positive" | "accent" | "neutral" {
  return p === "activated" || p === "ahead" || p === "on_track" ? "positive" : p === "behind" ? "accent" : "neutral";
}

/** "14 of 25 customers have visited" / "1 of 25 customers has visited". */
export function membersLine(members: number, target: number): string {
  return `${members} of ${target} customer${target === 1 ? "" : "s"} ${members === 1 ? "has" : "have"} visited`;
}

/** Setup steps still open before the shop is live (core steps only, first stamp is shown elsewhere on Home). */
export function stepsLeft(c: Pick<merchantApi.OnboardingChecklist, "steps">): merchantApi.OnboardingStep[] {
  return c.steps.filter((s) => !s.done && s.key !== "first_members");
}
