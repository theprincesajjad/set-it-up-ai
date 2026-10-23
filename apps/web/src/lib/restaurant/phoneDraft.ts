/** Pure helpers for the phone-order draft: adding a line (keeping the spoken quantity) and matching a "did they mean" chip to the menu. */
import type { commerceApi, whatsappApi } from "@ll/shared";

export interface DraftLine {
  catalogItemId: string;
  name: string;
  quantity: number;
  /** The assistant was not sure of this match; staff tap "Looks right" first. */
  uncertain?: boolean;
}

const MAX_QTY = 50;

/** Add `qty` of an item to the draft. A dish already on it gets the quantity added and stops being flagged (staff just chose it). */
export function addLine(lines: DraftLine[], item: { id: string; name: string }, qty = 1): DraftLine[] {
  const q = Math.min(MAX_QTY, Math.max(1, qty));
  return lines.some((l) => l.catalogItemId === item.id)
    ? lines.map((l) => (l.catalogItemId === item.id ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + q), uncertain: false } : l))
    : [...lines, { catalogItemId: item.id, name: item.name, quantity: q, uncertain: false }];
}

/**
 * The menu dish behind one chip of an ambiguous phrase. Chips carry the dish id; calls saved before that held only names,
 * so an empty id falls back to the dish with that name.
 */
export function resolveAmbiguous(_a: whatsappApi.PhoneCallDto["ambiguous"][number], option: { catalogItemId: string; name: string }, items: commerceApi.CatalogItemDto[]): commerceApi.CatalogItemDto | null {
  const byId = option.catalogItemId ? items.find((i) => i.id === option.catalogItemId) : undefined;
  return byId ?? items.find((i) => i.name.toLowerCase() === option.name.toLowerCase()) ?? null;
}
