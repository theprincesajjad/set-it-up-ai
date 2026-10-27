/** Beauty supply claims guard (docs/research/barbers-beauty.md 2.6): no treatment claims in a shop's texts, offers or names. No-op for other verticals. */
import type { merchants } from "@ll/db";
import { beautyClaimMessage, checkBeautyClaims, isBeautySupplyVertical } from "@ll/shared";
import { HttpError } from "../lib/errors.js";

export function assertBeautyClaims(m: Pick<typeof merchants.$inferSelect, "vertical">, text: string | null | undefined, what: string): void {
  if (!isBeautySupplyVertical(m.vertical) || !text) return;
  const c = checkBeautyClaims(text);
  if (!c.ok) throw new HttpError(422, "beauty_claims", beautyClaimMessage(c, what), { term: c.term });
}
