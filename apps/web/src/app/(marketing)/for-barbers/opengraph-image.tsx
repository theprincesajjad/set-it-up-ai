import { SOLO_OG_SIZE, soloOgImage } from "@/lib/marketing/solo-og";

export const size = SOLO_OG_SIZE;
export const contentType = "image/png";
export const alt = "Booking and walk-in line for barbershops"; // l10n-ok: social-card image is rendered once for crawlers

export default function Og() {
  return soloOgImage("barber");
}
