import type { merchantApi } from "@ll/shared";

export const ONBOARDING_STEPS_UI: Record<merchantApi.OnboardingStepKey, { title: string; body: string }> = {
  program: { title: "Your program", body: "We set this up from your shop type, rewards included. Customers see it on their card." },
  first_stamp: { title: "Give your first stamp", body: "Nothing helps more than seeing a stamp work. It takes about three minutes." },
  qr_kit: { title: "Print your QR stand", body: "Customers scan it to join in 30 seconds, no app needed. Put it next to the till." },
  staff: { title: "Staff and counter app", body: "Each person gets their own login for the counter. Skip this if you work alone." },
  first_members: { title: "Your first 25 members", body: "Activation goal: 25 members who have visited within 30 days. 12 by day 14 is the pace that gets you there." },
  profile: { title: "Your shop", body: "Tell customers who you are. This shows on your shop page and the neighbourhood map." },
  pos: { title: "Connect your POS", body: "Optional. Once connected, stamps and points happen on their own at the till." },
};

/** Core steps count toward "live"; later steps never block the first stamp. */
export const SETUP_NEXT_AFTER_FIRST_STAMP = "Next: print the QR stand.";
