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

type PayFacts = Pick<commerceApi.OrderDto, "kind" | "depositCents" | "depositPaidAt" | "balanceDueCents" | "paymentStatus">;

/** Hall and catering bookings are run from their own page: no kitchen steps on the order card. */
export const isEventOrder = (o: Pick<commerceApi.OrderDto, "kind">): boolean => o.kind === "banquet" || o.kind === "catering";

/** The money line on a deposit order: what was paid up front and what is still owed, and when it falls due. */
export function depositLine(o: PayFacts, fmt: (cents: number) => string): string {
  const paid = o.depositPaidAt ? "paid" : "not paid yet";
  const head = `Deposit ${fmt(o.depositCents)} ${paid}`;
  if (o.balanceDueCents > 0) return `${head} · ${fmt(o.balanceDueCents)} due ${isEventOrder(o) ? "at the event" : "at pickup"}`;
  return o.paymentStatus === "paid" ? `${head} · paid in full` : `${head} · nothing more to pay`;
}
