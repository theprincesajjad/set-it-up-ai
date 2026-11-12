import { AccessDenied } from "@/components/errors/server";
import { getT } from "@/lib/i18n/server";

/**
 * notFound() thrown by the shop layout itself (a shop id that does not exist): there is no shell to keep, so a standalone screen that says
 * which thing is missing and where to go. Pages inside a shop use `m/[merchantId]/not-found.tsx`, which keeps the shell.
 */
export default async function DashboardNotFound() {
  const t = await getT();
  return <AccessDenied title={t("err.nf.shop.title")} description={t("err.nf.shop.body")} goHref="/m" goLabel={t("err.action.dashboard")} />;
}
