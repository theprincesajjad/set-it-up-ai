import { BRAND } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { OG_SIZE, brandOgImage } from "@/lib/marketing/og-brand";
import { sentenceCase } from "@/lib/marketing/text";

const TITLE = sentenceCase(copy.bia.heroTitle);
const FOOT = copy.bia.heroSub;

export const alt = `${BRAND.name} for BIAs: ${TITLE}`;
export const size = OG_SIZE;
export const contentType = "image/png";

/** The BIA page's share card (lib/marketing/og-brand.tsx): what a board member sees when the link lands in their inbox. */
export default function OgImage() {
  return brandOgImage({ kicker: "For BIAs", title: TITLE, foot: FOOT });
}
