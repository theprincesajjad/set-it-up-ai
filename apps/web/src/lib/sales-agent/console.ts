/** Pure helpers for the founder's sales-assistant console (app/(admin)/admin/sales-agent). */
import type { salesAgentApi } from "@ll/shared";

export const STATUS_LABEL: Record<salesAgentApi.ConversationStatus, string> = { open: "Assistant", handoff: "Needs a person", human: "You have it", closed: "Closed" };
export const STATUS_TONE: Record<salesAgentApi.ConversationStatus, "neutral" | "accent" | "positive"> = { open: "neutral", handoff: "accent", human: "positive", closed: "neutral" };
export const LANGUAGE_NAME: Record<string, string> = { en: "English", hi: "Hindi", ur: "Urdu", pa: "Punjabi" };
export const languageName = (code: string): string => LANGUAGE_NAME[code] ?? code;

/** "12 min", "3 h", "2 d": how long a hand-off has waited. */
export function waiting(handoffAt: string | null, now: number): string | null {
  if (!handoffAt) return null;
  const mins = Math.max(0, Math.floor((now - new Date(handoffAt).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  if (mins < 48 * 60) return `${Math.floor(mins / 60)} h`;
  return `${Math.floor(mins / 1440)} d`;
}

const TOOL_LABEL: Record<string, string> = {
  get_pricing: "Looked up pricing",
  search_knowledge: "Searched the FAQ and policies",
  get_network_stats: "Read network stats",
  create_lead: "Lead",
  start_signup: "Sign-up link",
  request_founder_call: "Founder call request",
  request_phone_verification: "Sent a phone code",
  get_my_account: "Read the owner's account",
  create_checkout_link: "Checkout link",
  escalate_to_human: "Asked for a person",
};
export const toolLabel = (name: string): string => TOOL_LABEL[name] ?? name;

export const GUARD_LABEL: Record<string, string> = {
  price_mismatch: "A dollar figure was not in plans.ts",
  percent_mismatch: "A percentage was not in plans.ts",
  promise_guarantee: "Promised a guarantee",
  promise_risk_free: "Promised risk-free or money-back",
  promise_results: "Promised results",
  promise_trial: "Offered a trial we do not have",
  promise_date_promise: "Promised a date",
  promise_legal_advice: "Gave legal advice",
  refusal: "The model declined",
};
export const guardLabel = (code: string): string => GUARD_LABEL[code] ?? code;

/** The queue shows how many wait. */
export const queueCount = (items: { status: string }[]): number => items.filter((i) => i.status === "handoff").length;
