/**
 * The "Message us on WhatsApp" buttons open a chat with our own AI assistant (apps/api/src/services/sales-agent) on the
 * platform number. The number is configuration, not code: NEXT_PUBLIC_WHATSAPP_NUMBER (digits, international format). Unset or
 * not a number: there is no button at all, so we never link to a placeholder. Keep it equal to the API's SALES_AGENT_WHATSAPP_NUMBER.
 */
export function whatsappNumber(raw: string | undefined = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** A wa.me link that opens a chat with us and pre-fills `text`; null when no number is configured (hide the button). */
export function whatsappUrl(text?: string, raw?: string): string | null {
  const n = whatsappNumber(raw);
  if (!n) return null;
  const base = `https://wa.me/${n}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
