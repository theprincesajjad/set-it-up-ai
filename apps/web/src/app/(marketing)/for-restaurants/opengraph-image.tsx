import { BRAND, t } from "@ll/shared";
import { OG_SIZE, brandOgImage } from "@/lib/marketing/og-brand";
import { sentenceCase } from "@/lib/marketing/text";

const TITLE = sentenceCase(t("en", "mkt.rest.title"));
const FOOT = "Ordering, tiffin and catering · 0% commission on your own orders";

export const alt = `${BRAND.name} for restaurants: ${TITLE}`;
export const size = OG_SIZE;
export const contentType = "image/png";

/** The restaurant page's share card: its own headline, not the shop headline every other page shares (lib/marketing/og-brand.tsx). */
export default function OgImage() {
  return brandOgImage({ kicker: "For restaurants", title: TITLE, foot: FOOT });
}
