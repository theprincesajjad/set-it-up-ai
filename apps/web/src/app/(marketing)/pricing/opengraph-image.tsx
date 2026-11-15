import { BRAND } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { OG_SIZE, brandOgImage } from "@/lib/marketing/og-brand";
import { sentenceCase } from "@/lib/marketing/text";

const TITLE = sentenceCase(copy.pricing.title);
const FOOT = copy.landing.reassure.split(" · ").slice(0, 2).join(" · ");

export const alt = `${BRAND.name} pricing: ${TITLE}`;
export const size = OG_SIZE;
export const contentType = "image/png";

/** The pricing page's share card (lib/marketing/og-brand.tsx). */
export default function OgImage() {
  return brandOgImage({ kicker: "Pricing", title: TITLE, foot: FOOT, pass: true });
}
