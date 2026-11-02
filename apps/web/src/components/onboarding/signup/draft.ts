/**
 * The stepped signup's state (wave P, team onboard). One draft object holds every answer; it lives in sessionStorage so a refresh,
 * Back, or a trip to sign in and back keeps it. The password is never stored. Nothing reaches the server before "Create my shop"
 * except the website read (POST /v1/site-import, which saves nothing for the shop).
 */
import { SOLO_ONLY_VERTICALS, VERTICALS, VERTICAL_TEMPLATES, merchantApi, normalizePostal, type siteImportApi } from "@ll/shared";

const { STAMP_GOAL_MAX, STAMP_GOAL_MIN } = merchantApi;
import type { SiteImportAccepted } from "../SiteImport";

export const STEPS = ["link", "shop", "kind", "where", "card", "account"] as const;
export type FlowStep = (typeof STEPS)[number] | "live";
export const isFlowStep = (s: string | null | undefined): s is FlowStep => !!s && ((STEPS as readonly string[]).includes(s) || s === "live");

export type Work = "home" | "shop" | "mobile";

export interface CreatedShop {
  id: string;
  name: string;
  vertical: string;
  workSetting: Work;
  joinUrl: string | null;
  brandColor: string | null;
  logo: string | null;
}

export interface SignupDraft {
  v: 1;
  /** Step 1: still to answer, skipped, or read (the result is kept so "Is this you?" survives a refresh). */
  link: "ask" | "skipped" | "read";
  imported: siteImportApi.SiteImportResult | null;
  /** What the owner kept on "Is this you?" (logo, colour, links, hours, services). Name, type, phone and address live below. */
  accepted: SiteImportAccepted | null;
  name: string;
  vertical: string;
  /** The type came from the import or a link and the owner has not picked one yet. */
  verticalGuess: boolean;
  sells: string;
  work: Work;
  workTouched: boolean;
  address: string;
  postal: string;
  /** null = the trade's own defaults. */
  card: { goal: number; reward: string } | null;
  phone: string;
  email: string;
  created: CreatedShop | null;
  /** The link values already laid over this draft, so a refresh of the same link never undoes an edit. */
  prefillKey: string;
}

export const STORAGE_KEY = "ll_signup_v1";

export function emptyDraft(): SignupDraft {
  return { v: 1, link: "ask", imported: null, accepted: null, name: "", vertical: "", verticalGuess: false, sells: "", work: "shop", workTouched: false, address: "", postal: "", card: null, phone: "", email: "", created: null, prefillKey: "" };
}

export interface Prefill {
  shop?: string;
  vertical?: string;
  phone?: string;
  email?: string;
}

/** A new link's values win over a stored draft, once (`prefillKey`); a sales-assistant link (`?shop=`) skips the website question. */
export function withPrefill(d: SignupDraft, p: Prefill | undefined): SignupDraft {
  if (!p) return d;
  const key = JSON.stringify([p.shop ?? "", p.vertical ?? "", p.phone ?? "", p.email ?? ""]);
  if (key === '["","","",""]' || key === d.prefillKey) return d;
  // A link that names a shop (the sales assistant, a landing form) is a new shop: a new start. So is any link after a shop was made.
  const out = { ...(d.created || p.shop ? emptyDraft() : d), prefillKey: key };
  if (p.shop) Object.assign(out, { name: p.shop, link: d.link === "ask" ? "skipped" : d.link });
  if (p.vertical) Object.assign(out, { vertical: p.vertical, verticalGuess: false, work: workFor(p.vertical), workTouched: false });
  if (p.phone) out.phone = p.phone;
  if (p.email) out.email = p.email;
  return out;
}

export const workFor = (vertical: string): Work => (SOLO_ONLY_VERTICALS.includes(vertical) ? "home" : "shop");

/** A stored draft, checked field by field (sessionStorage is the owner's, but it is still input). */
export function readDraft(raw: string | null): SignupDraft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<SignupDraft>;
    if (!o || o.v !== 1) return null;
    const d = emptyDraft();
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    d.link = o.link === "skipped" || o.link === "read" ? o.link : "ask";
    d.imported = o.imported && typeof o.imported === "object" && typeof o.imported.id === "string" ? o.imported : null;
    d.accepted = o.accepted && typeof o.accepted === "object" && typeof o.accepted.importId === "string" ? o.accepted : null;
    if (d.link === "read" && !d.imported) d.link = "ask";
    d.name = str(o.name, 120);
    d.vertical = (VERTICALS as readonly string[]).includes(o.vertical as string) ? (o.vertical as string) : "";
    d.verticalGuess = o.verticalGuess === true;
    d.sells = str(o.sells, 300);
    d.work = o.work === "home" || o.work === "mobile" ? o.work : "shop";
    d.workTouched = o.workTouched === true;
    d.address = str(o.address, 300);
    d.postal = str(o.postal, 7);
    d.card = o.card && Number.isInteger(o.card.goal) && typeof o.card.reward === "string" ? { goal: o.card.goal, reward: o.card.reward.slice(0, 120) } : null;
    d.phone = str(o.phone, 40).replace(/\D/g, "").slice(0, 10);
    d.email = str(o.email, 254);
    d.created = o.created && typeof o.created.id === "string" ? o.created : null;
    d.prefillKey = str(o.prefillKey, 600);
    return d;
  } catch {
    return null;
  }
}

export function loadDraft(): SignupDraft | null {
  try {
    return readDraft(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
export function saveDraft(d: SignupDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    // Private mode or a full quota: the flow still works, it just won't survive a refresh.
  }
}
export function clearDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to do
  }
}

// ---------------------------------------------------------------------------
// The loyalty card
// ---------------------------------------------------------------------------
export interface CardModel {
  earnType: "stamps" | "per_visit" | "per_dollar";
  terminology: string;
  /** Stamps (stamp cards) or points for the first reward. */
  goal: number;
  reward: string;
  /** Points per visit or per dollar (0 for stamps). */
  rate: number;
  min: number;
  max: number;
  step: number;
  /** The trade's own values. */
  defaults: { goal: number; reward: string };
  /** Other rewards the template knows for this trade, as one-tap suggestions. */
  suggestions: string[];
}

export function cardFor(vertical: string, card: SignupDraft["card"]): CardModel {
  const tpl = VERTICAL_TEMPLATES[(vertical || "other") as keyof typeof VERTICAL_TEMPLATES] ?? VERTICAL_TEMPLATES.other;
  const first = tpl.rewards[0];
  const stamps = tpl.earnType === "stamps";
  const defaults = { goal: stamps ? tpl.stampGoal || 10 : (first?.pointsCost ?? 100), reward: first?.name ?? "" };
  const rate = tpl.earnType === "per_dollar" ? tpl.pointsPerDollar : tpl.earnType === "per_visit" ? tpl.pointsPerVisit : 0;
  const step = stamps ? 1 : tpl.earnType === "per_visit" ? Math.max(1, tpl.pointsPerVisit) : Math.max(10, Math.round(defaults.goal / 10 / 10) * 10);
  return {
    earnType: tpl.earnType,
    terminology: tpl.terminology,
    goal: card?.goal ?? defaults.goal,
    reward: card?.reward ?? defaults.reward,
    rate,
    min: stamps ? STAMP_GOAL_MIN : step,
    max: stamps ? STAMP_GOAL_MAX : 100_000,
    step,
    defaults,
    suggestions: [...new Set(tpl.rewards.map((r) => r.name))],
  };
}

// ---------------------------------------------------------------------------
// Which steps are answered
// ---------------------------------------------------------------------------
export type StepErrors = Partial<Record<"link" | "name" | "vertical" | "address" | "postal" | "goal" | "reward" | "phone" | "email" | "password" | "colour", string>>;

/** The first step that still needs an answer; "account" when only the account is left, "live" once the shop exists. */
export function firstOpenStep(d: SignupDraft): FlowStep {
  if (d.created) return "live";
  if (d.link === "ask") return "link";
  if (d.name.trim().length < 2) return "shop";
  if (!d.vertical) return "kind";
  if (!whereDone(d)) return "where";
  const c = cardFor(d.vertical, d.card);
  if (!c.reward.trim() || c.goal < c.min || c.goal > c.max) return "card";
  return "account";
}

export function whereDone(d: SignupDraft): boolean {
  if (d.work === "shop") return d.address.trim().length >= 3;
  if (d.work === "home") return !!normalizePostal(d.postal);
  return true;
}

/** The step to show for a requested one: never past the first unanswered step, and never back into the form once the shop exists. */
export function resolveStep(requested: string | null | undefined, d: SignupDraft): FlowStep {
  const open = firstOpenStep(d);
  if (open === "live") return "live";
  if (!isFlowStep(requested) || requested === "live") return open;
  return STEPS.indexOf(requested) <= STEPS.indexOf(open as (typeof STEPS)[number]) ? requested : open;
}

export const stepIndex = (s: FlowStep) => (s === "live" ? STEPS.length : STEPS.indexOf(s));
