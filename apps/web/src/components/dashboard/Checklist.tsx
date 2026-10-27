import type { merchantApi } from "@ll/shared";

export const STEP_COPY: Record<merchantApi.OnboardingStepKey, { label: string; action: string; path: string }> = {
  program: { label: "Program confirmed", action: "Review program", path: "/program" },
  first_stamp: { label: "Give your first stamp", action: "Stamp yourself", path: "/setup?step=first_stamp" },
  qr_kit: { label: "Print the QR stand", action: "Print QR kit", path: "/locations/kit" },
  staff: { label: "Staff and counter app", action: "Invite staff", path: "/setup?step=staff" },
  first_members: { label: "First 25 members", action: "Open counter", path: "/counter" },
  profile: { label: "Logo, about text and GST/HST", action: "Add details", path: "/settings" },
  pharmacy_rules: { label: "Pharmacist confirms the rules", action: "Confirm", path: "/pharmacy" },
  pos: { label: "Connect your POS", action: "Choose your POS", path: "/integrations" },
  trade_setup: { label: "Set up your trade", action: "Set up", path: "/setup?step=trade_setup" },
};

/** Ordered for display: incomplete first, completed (leaf check, normal text) below. */
export function orderSteps(steps: merchantApi.OnboardingStep[]): merchantApi.OnboardingStep[] {
  return [...steps.filter((s) => !s.done), ...steps.filter((s) => s.done)];
}
