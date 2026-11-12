import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth/session";
import { staffHome } from "@/lib/auth/home";
import { preloadInter } from "@/lib/fonts/inter";

/** /m → the user's first shop (or the right console, or the "not linked to a shop yet" page). */
export default async function DashboardIndex() {
  preloadInter();
  const me = await requireMe("/m");
  redirect(staffHome(me));
}
