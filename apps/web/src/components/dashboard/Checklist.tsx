import type { merchantApi } from "@ll/shared";

export const STEP_COPY: Record<merchantApi.OnboardingStepKey, { label: string; action: string; path: string }> = {
  // phase-solo B: the solo and appointment-led cards (labels come from the API in the owner's language; these are the English fallbacks).
  your_link: { label: "Your booking link", action: "Pick your link", path: "/setup?step=your_link" },
  services: { label: "Services and prices", action: "Add services", path: "/setup?step=services" },
  hours: { label: "Your hours", action: "Set hours", path: "/setup?step=hours" },
  privacy: { label: "Your address", action: "Choose", path: "/setup?step=privacy" },
  share: { label: "Share your link", action: "Share", path: "/setup?step=share" },
  invite: { label: "Invite your regulars", action: "Invite", path: "/setup?step=invite" },
  loyalty: { label: "Your stamp card", action: "See the card", path: "/program" },
  instagram_connect: { label: "Instagram messages", action: "See", path: "/setup?step=instagram_connect" },
  site: { label: "Your website", action: "See the presets", path: "/site" },
  promos: { label: "Promos to regulars", action: "Pick a template", path: "/messages" },
  program: { label: "Program confirmed", action: "Review program", path: "/program" },
  first_stamp: { label: "Give your first stamp", action: "Add your first stamp", path: "/setup?step=first_stamp" },
  qr_kit: { label: "Print the QR stand", action: "Print QR kit", path: "/locations/kit" },
  staff: { label: "Staff and counter app", action: "Invite staff", path: "/setup?step=staff" },
  first_members: { label: "First 25 customers", action: "Open counter", path: "/counter" },
  profile: { label: "Logo, about text and GST/HST", action: "Add details", path: "/settings" },
  pharmacy_rules: { label: "Pharmacist confirms the rules", action: "Confirm", path: "/pharmacy" },
  pos: { label: "Connect your POS", action: "Choose your POS", path: "/integrations" },
  trade_setup: { label: "Set up your shop's tools", action: "Set up", path: "/setup?step=trade_setup" },
};

/** Ordered for display: incomplete first, completed (leaf check, normal text) below. */
export function orderSteps(steps: merchantApi.OnboardingStep[]): merchantApi.OnboardingStep[] {
  return [...steps.filter((s) => !s.done), ...steps.filter((s) => s.done)];
}
