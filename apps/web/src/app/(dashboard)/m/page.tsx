import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth/session";
import { routes } from "@/lib/routes";

/** /m → the user's first shop (or the right console / signup). */
export default async function DashboardIndex() {
  const me = await requireMe("/m");
  const first = me.merchants[0];
  if (first) redirect(routes.dashboard(first.merchantId));
  if (me.platformRole === "admin") redirect(routes.admin);
  if (me.platformRole === "rep") redirect(routes.rep);
  redirect(routes.signup);
}
