import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BiaProvider } from "@/components/dashboard/bia/BiaContext";
import { ConsoleShell } from "@/components/dashboard/ConsoleShell";
import { SessionGuard } from "@/components/errors";
import { AccessDenied, ServiceUnreachable, homeFor } from "@/components/errors/server";
import { currentPath, requireMeOrOutage } from "@/lib/auth/session";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { preloadInter } from "@/lib/fonts/inter";

export const metadata: Metadata = { title: { default: "BIA overview", template: "%s · BIA" }, robots: { index: false, follow: false } };

/** BIA manager tools. Access is decided by the campaigns API (neighbourhood managers + admins). */
export default async function BiaLayout({ children }: { children: ReactNode }) {
  preloadInter();
  const auth = await requireMeOrOutage(await currentPath("/bia"));
  if (auth.outage) return <ServiceUnreachable audience="staff" homeHref="/" />;
  const me = auth.me;
  // Not a neighbourhood manager: a plain denied card, not the BIA shell around "this area is not for you" (and no 403 from the pages' own calls).
  if (!me.biaManager && me.platformRole !== "admin") {
    const t = await getT();
    const home = homeFor(me, t);
    const owner = me.merchants.length > 0;
    return <AccessDenied title={t("err.denied.bia.title")} description={t(owner ? "err.denied.bia.bodyOwner" : "err.denied.bia.bodyCustomer")} goHref={home.href} goLabel={owner ? t("err.action.dashboard") : home.label} />;
  }
  return (
    <LocaleScope locale={await getLocale()}>
      <SessionGuard />
      <BiaProvider>
        <ConsoleShell kind="bia" me={me}>
          {children}
        </ConsoleShell>
      </BiaProvider>
    </LocaleScope>
  );
}
