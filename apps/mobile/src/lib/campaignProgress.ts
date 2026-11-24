import type { campaignsApi } from "@ll/shared";

/** Shops visited, capped at the goal: a finished passport reads "3 of 3", never "4 of 3". */
export function clampCampaign<T extends Pick<campaignsApi.MyCampaign, "progress">>(c: T): T {
  const goal = Math.max(0, c.progress.goal);
  const visited = Math.max(0, Math.min(c.progress.visited, goal));
  return visited === c.progress.visited ? c : { ...c, progress: { ...c.progress, visited } };
}
