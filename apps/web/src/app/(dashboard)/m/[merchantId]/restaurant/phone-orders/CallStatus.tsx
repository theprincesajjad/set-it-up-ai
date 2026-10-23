import { LOCALES, isLocale, type whatsappApi } from "@ll/shared";
import { Dot, type DotTone } from "@/components/dashboard";

export const languageName = (code: string | null) => (code && isLocale(code) ? LOCALES[code].englishName : (code ?? "Not detected"));

/** Words for staff, not enum text: "Needs a look", "Order #57", "Missed". */
export function callStatus(c: Pick<whatsappApi.PhoneCallDto, "status" | "orderNumber" | "draftOrder">): { tone: DotTone; label: string; filter: "look" | "order" | "missed" | "other" } {
  switch (c.status) {
    case "drafted":
      return { tone: "info", label: "Needs a look", filter: "look" };
    case "confirmed":
      return { tone: "positive", label: c.orderNumber ? `Order #${c.orderNumber}` : "Order placed", filter: "order" };
    case "failed":
      return { tone: "negative", label: "Couldn't place", filter: "missed" };
    case "discarded":
      return { tone: "neutral", label: "Discarded", filter: "other" };
    default:
      return { tone: "neutral", label: c.draftOrder?.items.length ? "Needs a look" : "Missed", filter: c.draftOrder?.items.length ? "look" : "missed" };
  }
}

export function CallStatus({ call }: { call: Pick<whatsappApi.PhoneCallDto, "status" | "orderNumber" | "draftOrder"> }) {
  const s = callStatus(call);
  return <Dot tone={s.tone}>{s.label}</Dot>;
}
