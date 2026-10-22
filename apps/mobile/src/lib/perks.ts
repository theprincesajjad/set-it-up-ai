/**
 * Neighbourhood perk progress ("Visit 3 shops on Roncesvalles this month → +50 pts").
 * The API exposes the perk rules (network.md, NetworkPerkDto) but not per-member
 * progress, so we derive it from the wallet: distinct shops in that
 * neighbourhood visited inside the perk's window.
 */
export interface PerkLike {
  name: string;
  description: string | null;
  ruleType: string;
  threshold: number;
  windowDays: number;
  bonusPoints: number;
}

export function perkProgress(
  perk: PerkLike,
  memberships: { merchant: { neighbourhoodId: string | null }; lastVisitAt: string | null }[],
  neighbourhoodId: string | null,
  now = Date.now(),
): { visited: number; goal: number; done: boolean } {
  const since = now - perk.windowDays * 86_400_000;
  const visited = memberships.filter(
    (m) => (!neighbourhoodId || m.merchant.neighbourhoodId === neighbourhoodId) && m.lastVisitAt && new Date(m.lastVisitAt).getTime() >= since,
  ).length;
  const goal = Math.max(1, perk.threshold);
  return { visited: Math.min(visited, goal), goal, done: visited >= goal };
}

export function perkHeadline(perk: PerkLike, place: string | null): string {
  const window = perk.windowDays >= 28 && perk.windowDays <= 31 ? "this month" : perk.windowDays === 7 ? "this week" : `in ${perk.windowDays} days`;
  return `Visit ${perk.threshold} shops${place ? ` on ${place}` : ""} ${window} → +${perk.bonusPoints} pts`;
}
