import type { merchantApi } from "@ll/shared";

export const ONBOARDING_STEPS_UI: Record<merchantApi.OnboardingStepKey, { title: string; body: string }> = {
  profile: { title: "Your shop", body: "Tell customers who you are. This shows on your shop page and the neighbourhood map." },
  program: { title: "Your program", body: "We set this up from your shop type. Customers see it on their card." },
  rewards: { title: "Your rewards", body: "What customers earn. Most shops start with one simple reward." },
  staff: { title: "Your staff", body: "Each person gets their own login for the counter. Skip this if you work alone." },
  qr_kit: { title: "Print your QR stand", body: "Customers scan it to join in 30 seconds, no app needed. Put it next to the till." },
  first_members: { title: "Your first 25 members", body: "Activation goal: 25 members who have visited. Most shops get there in two weeks." },
};
