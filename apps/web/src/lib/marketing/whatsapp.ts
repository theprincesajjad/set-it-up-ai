import { BRAND } from "@ll/shared";

/** International digits for wa.me. NEXT_PUBLIC_WHATSAPP_NUMBER wins; BRAND.whatsappNumber is the placeholder default. */
export function whatsappNumber(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  return fromEnv || BRAND.whatsappNumber;
}

/** A wa.me link that opens a chat with us and pre-fills `text`. */
export function whatsappUrl(text?: string): string {
  const base = `https://wa.me/${whatsappNumber()}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
