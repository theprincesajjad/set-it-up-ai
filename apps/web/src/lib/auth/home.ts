import { routes } from "@/lib/routes";

type HomeMe = { platformRole: string; merchants: { merchantId: string }[]; biaManager?: boolean };

/** Where a signed-in person with a working role belongs, or null for a customer-only account (no shop, console or BIA role). */
export function roleHome(me: HomeMe | null): string | null {
  if (!me) return null;
  if (me.platformRole === "admin") return routes.admin;
  if (me.platformRole === "rep") return routes.rep;
  const first = me.merchants[0];
  if (first) return routes.dashboard(first.merchantId);
  if (me.biaManager) return routes.bia;
  return null;
}

/**
 * Where people land after signing in: `next`, else their role's home (admin, rep, shop dashboard, BIA), else a short
 * "not linked to a shop yet" page (never the signup wizard).
 */
export function staffHome(me: HomeMe | null, next?: string | null): string {
  if (next) return next;
  return roleHome(me) ?? routes.signedIn;
}
