/** Pure helpers for the Orders screen: which filter chip an order sits under, and the split-bill line on its card. */
import type { commerceApi } from "@ll/shared";

export type OrderChip = "all" | "new" | "cooking" | "ready" | "preorder";

/** The status chip an open order belongs to (New, Cooking, Ready); null once it is finished. */
export const chipOf = (o: Pick<commerceApi.OrderDto, "status">): "new" | "cooking" | "ready" | null => (o.status === "pending" ? "new" : o.status === "accepted" || o.status === "preparing" ? "cooking" : o.status === "ready" ? "ready" : null);

const WORDS = ["", "", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "Split three ways: Asif card, Sana link, Zain cash (paid)". */
export function splitLine(splits: NonNullable<commerceApi.OrderDto["splits"]>): string {
  return `Split ${WORDS[splits.length] ?? splits.length} ways: ${splits.map((s) => `${s.label} ${s.tender}${s.status === "paid" ? " (paid)" : ""}`).join(", ")}`;
}
