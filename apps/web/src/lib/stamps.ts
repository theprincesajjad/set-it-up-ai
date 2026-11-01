/**
 * A stamp card's numbers (wave N final audit). A shop picks any goal from 2 to 50 stamps (merchantApi.STAMP_GOAL_MIN/MAX), so the
 * customer screens never clamp the goal: "12 to go" on a 15-stamp card was a wrong number. Up to MAX_DRAWN_STAMPS the card draws one
 * circle per stamp; a longer card shows a progress bar with the same numbers.
 */
export const MAX_DRAWN_STAMPS = 20;

/** Columns for a drawn card: 5 or 6 wide, so 15 and 20 are tidy rows. */
export function stampCols(goal: number): number {
  if (goal <= 6) return goal;
  if (goal === 8) return 4;
  if (goal <= 10 || goal === 15 || goal === 20) return 5;
  return 6;
}

/**
 * balance: the member's stamps. goal: the card (the shop's stamp goal). nextRewardCost: the cheapest reward not reached yet (a tier
 * below the goal, "5 stamps: free nail art", comes first). toGo counts to that reward; onCard / goal is the card itself.
 */
export function stampCardNumbers(balance: number, goal: number, nextRewardCost?: number | null) {
  const g = Math.max(1, Math.round(goal || 10));
  const have = Math.max(0, balance);
  const onCard = have >= g ? g : have % g;
  const tier = nextRewardCost != null && nextRewardCost > have && nextRewardCost < g ? nextRewardCost : null;
  const toGo = Math.max(0, (tier ?? g) - (tier != null ? have : onCard));
  return { goal: g, onCard, toGo, ready: have >= g, drawn: g <= MAX_DRAWN_STAMPS, cols: stampCols(g) };
}
