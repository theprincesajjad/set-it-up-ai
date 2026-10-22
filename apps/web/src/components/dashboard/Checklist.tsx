import type { merchantApi } from "@ll/shared";

export const STEP_COPY: Record<merchantApi.OnboardingStepKey, { label: string; action: string; path: string }> = {
  profile: { label: "Shop details", action: "Add details", path: "/settings" },
  program: { label: "Program set", action: "Review program", path: "/program" },
  rewards: { label: "Rewards ready", action: "Check rewards", path: "/program?tab=rewards" },
  staff: { label: "Staff added", action: "Invite staff", path: "/staff" },
  qr_kit: { label: "QR stand printed", action: "Print QR kit", path: "/locations" },
  first_members: { label: "25 active members", action: "Open counter", path: "/counter" },
};

/** Ordered for display: incomplete first, completed (leaf check, normal text) below. */
export function orderSteps(steps: merchantApi.OnboardingStep[]): merchantApi.OnboardingStep[] {
  return [...steps.filter((s) => !s.done), ...steps.filter((s) => s.done)];
}
