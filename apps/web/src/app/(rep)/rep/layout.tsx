import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/dashboard/ConsoleShell";
import { SessionGuard } from "@/components/errors";
import { AccessDenied, ServiceUnreachable, homeFor } from "@/components/errors/server";
import { currentPath, requireMeOrOutage } from "@/lib/auth/session";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { preloadInter } from "@/lib/fonts/inter";

export const metadata: Metadata = { title: { default: "Rep console", template: "%s · Rep console" }, robots: { index: false, follow: false } };

/** Rep console guard (rep-console.md): platform role rep (admins pass). */
export default async function RepLayout({ children }: { children: ReactNode }) {
  preloadInter();
  const auth = await requireMeOrOutage(await currentPath("/rep"));
  if (auth.outage) return <ServiceUnreachable audience="staff" homeHref="/" />;
  const me = auth.me;
  if (me.platformRole !== "rep" && me.platformRole !== "admin") {
    const t = await getT();
    const home = homeFor(me, t);
    return <AccessDenied title={t("err.denied.rep.title")} description={t("err.denied.rep.body")} goHref={home.href} goLabel={home.label} />;
  }
  return (
    <LocaleScope locale={await getLocale()}>
      <SessionGuard />
      <ConsoleShell kind="rep" me={me}>
        {children}
      </ConsoleShell>
    </LocaleScope>
  );
}
