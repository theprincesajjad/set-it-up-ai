import type { merchantApi } from "@ll/shared";
import { browserClient } from "@/lib/api/browser";

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

// ---- phase-solo: B ----
type Checklist = merchantApi.OnboardingChecklist;

/** The solo setup cards' saves (routes/merchant/onboarding-solo.ts). Each returns the fresh checklist. */
export function soloApi(merchantId: string) {
  const b = `/v1/merchants/${encodeURIComponent(merchantId)}/onboarding`;
  return {
    slug: (slug: string) => browserClient.get<{ slug: string; available: boolean; suggestion: string | null }>(`${b}/solo/slug`, { query: { slug } }),
    link: (body: merchantApi.SoloLinkBody) => browserClient.post<Checklist>(`${b}/solo/link`, body),
    services: (body: merchantApi.SoloServicesBody) => browserClient.post<Checklist>(`${b}/solo/services`, body),
    hours: (body: merchantApi.SoloHoursBody) => browserClient.post<Checklist>(`${b}/solo/hours`, body),
    privacy: (body: merchantApi.SoloPrivacyBody) => browserClient.post<Checklist>(`${b}/solo/privacy`, body),
    share: (channel: "instagram" | "text" | "qr" | "copy") => browserClient.post<Checklist>(`${b}/solo/share`, { channel }),
    invite: (body: merchantApi.SoloInviteBody) => browserClient.post<Checklist & { invite: { created: number; errors: number } }>(`${b}/solo/invite`, body),
    complete: (step: merchantApi.SoloCompleteStep) => browserClient.post<Checklist>(`${b}/solo/complete`, { step }),
    importLink: (url: string) => browserClient.post<merchantApi.ImportLinkResponse>(`${b}/import-link`, { url }),
  };
}

/** The 3D object on each card (onboarding-v1.md §6.4). */
export const SOLO_STEP_ICON: Record<string, "link" | "price_tag" | "calendar_week" | "pin_area" | "megaphone" | "phone_message" | "team" | "stamp_card" | "instagram_mark" | "site" | "pos" | "check_done"> = {
  your_link: "link",
  services: "price_tag",
  hours: "calendar_week",
  privacy: "pin_area",
  share: "megaphone",
  invite: "phone_message",
  staff: "team",
  profile: "check_done",
  loyalty: "stamp_card",
  instagram_connect: "instagram_mark",
  site: "site",
  promos: "megaphone",
  pos: "pos",
};

/** "45.00" from 4500, and back; empty or junk gives null. */
export const centsToField = (c: number) => (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2));
export function fieldToCents(v: string): number | null {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return v.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Pasted regulars, one a line: "Ava 416 555 0199" or "4165550199, Ava". Lines without 10 digits are dropped. */
export function parsePeople(text: string): { name: string | null; phone: string }[] {
  const out: { name: string | null; phone: string }[] = [];
  for (const line of text.split(/\n+/)) {
    const digits = line.replace(/\D/g, "");
    const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (ten.length !== 10) continue;
    const name = line.replace(/[+\d()\-.\s,]+/g, " ").trim().slice(0, 80) || null;
    out.push({ name, phone: ten });
  }
  return out;
}

/** The sms: link with a prefilled body (iOS uses `&body=`, Android `?body=`; both read `?&body=`). */
export const smsHref = (body: string, to = "") => `sms:${to}?&body=${encodeURIComponent(body)}`;
// ---- end phase-solo: B ----
