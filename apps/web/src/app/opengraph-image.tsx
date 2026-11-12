import { BRAND } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { plainText } from "@/lib/marketing/emphasis";
import { OG_SIZE, brandOgImage } from "@/lib/marketing/og-brand";

const L = copy.landing;
/** "Free forever · No credit card": the first two parts of the line under every sign-up button. */
const FOOT = L.reassure.split(" · ").slice(0, 2).join(" · ");

export const alt = `${BRAND.name}: ${plainText(L.hero.title)} ${FOOT}`;
export const size = OG_SIZE;
export const contentType = "image/png";

/** The default share card: the home page's headline in the site's own identity (lib/marketing/og-brand.tsx). */
export default function OgImage() {
  return brandOgImage({ title: L.hero.title, foot: FOOT });
}
