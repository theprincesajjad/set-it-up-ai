import { BRAND, t } from "@ll/shared";
import { OG_SIZE, brandOgImage } from "@/lib/marketing/og-brand";
import { sentenceCase } from "@/lib/marketing/text";

const TITLE = sentenceCase(t("en", "sh.fs.h1"));
const FOOT = "Free for shoppers · No app needed";

export const alt = `${BRAND.name} for shoppers: ${TITLE}`;
export const size = OG_SIZE;
export const contentType = "image/png";

/** The shopper page's share card (lib/marketing/og-brand.tsx): the customer's promise, for the flyer and the friend who sends the link. */
export default function OgImage() {
  return brandOgImage({ kicker: "For shoppers", title: TITLE, foot: FOOT, pass: true });
}
