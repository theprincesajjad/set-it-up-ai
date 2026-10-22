import type { networkApi } from "@ll/shared";

/**
 * Sponsored placement rules (system.md § PromoCard): max 1 sponsored item per
 * 5 feed items, never the first slot, never two close together. The server
 * already interleaves; this guards the client against over-delivery.
 */
export function capSponsored<T extends Pick<networkApi.FeedEntry, "sponsored">>(items: T[]): T[] {
  const out: T[] = [];
  let organicSinceLast = Infinity;
  for (const it of items) {
    if (it.sponsored) {
      if (out.length === 0 || organicSinceLast < 4) continue;
      organicSinceLast = 0;
    } else organicSinceLast += 1;
    out.push(it);
  }
  return out;
}

/** Screen-reader label for a feed card; sponsored ones always begin with "Sponsored." */
export function feedA11yLabel(item: { sponsored: boolean; shopName: string; title: string }): string {
  return `${item.sponsored ? "Sponsored. " : ""}${item.shopName}. ${item.title}`;
}
