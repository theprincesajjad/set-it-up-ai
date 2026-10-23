/** "Share with the family on WhatsApp": a wa.me link with the message prefilled (no phone number: the guest picks the group). */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** wa.me link to the shop's own WhatsApp number (digits only, as wa.me wants). */
export function whatsappChatUrl(e164: string, message?: string): string {
  const digits = e164.replace(/\D/g, "");
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
