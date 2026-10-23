/** Pure helpers for the WhatsApp inbox: the status line under a chat, initials, language names and the 24-hour window. */
import type { whatsappApi } from "@ll/shared";

export type ChatTone = "neutral" | "info" | "positive" | "accent" | "negative";

/** What a chat is waiting on, as a dot and a short phrase. */
export function chatStatus(s: Pick<whatsappApi.WhatsappSession, "state" | "cartItems" | "takenOver">): { tone: ChatTone; label: string } {
  if (s.takenOver) return { tone: "neutral", label: "You have this chat" };
  switch (s.state) {
    case "awaiting_payment":
      return { tone: "info", label: "Awaiting payment" };
    case "checkout":
      return { tone: "info", label: "Checking out" };
    case "cart":
      return { tone: "neutral", label: s.cartItems ? `Cart · ${s.cartItems} ${s.cartItems === 1 ? "item" : "items"}` : "Cart" };
    case "done":
      return { tone: "positive", label: "Order placed" };
    case "opted_out":
      return { tone: "neutral", label: "Opted out" };
    default:
      return { tone: "neutral", label: "Browsing" };
  }
}

/** "HS" for Hira Siddiqui; "+1" for a bare number. */
export function initials(name: string | null | undefined, phone: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length) return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
  return phone.startsWith("+") ? phone.slice(0, 2) : "#";
}

const LANG: Record<string, string> = { en: "English", hi: "Hindi", ur: "Urdu", pa: "Punjabi" };
export const languageLabel = (code: string | null | undefined) => LANG[code ?? ""] ?? "English";

/** Whole hours left in the guest's 24-hour reply window, 0 when it has closed, null while unknown. */
export function windowHoursLeft(openUntil: string | null, now: number): number {
  if (!openUntil) return 0;
  const ms = new Date(openUntil).getTime() - now;
  return ms <= 0 ? 0 : Math.max(1, Math.floor(ms / 3_600_000));
}
