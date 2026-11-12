import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/dashboard/ConsoleShell";
import { SessionGuard } from "@/components/errors";
import { AccessDenied, ServiceUnreachable, homeFor } from "@/components/errors/server";
import { currentPath, requireMeOrOutage } from "@/lib/auth/session";
import { LocaleScope } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { preloadInter } from "@/lib/fonts/inter";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

/** Admin guard (admin.md): platform role admin only. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  preloadInter();
  const auth = await requireMeOrOutage(await currentPath("/admin"));
  if (auth.outage) return <ServiceUnreachable audience="admin" homeHref="/" />;
  const me = auth.me;
  if (me.platformRole !== "admin") {
    const t = await getT();
    const home = homeFor(me, t);
    return <AccessDenied title={t("err.denied.admin.title")} description={t("err.denied.admin.body")} goHref={home.href} goLabel={home.label} />;
  }
  return (
    <LocaleScope locale={await getLocale()}>
      <SessionGuard />
      <ConsoleShell kind="admin" me={me}>
        {/* Admin pages are written in English only; the menu follows the chosen language (and its direction), the pages stay
            left to right so numbers like "-70.6%" and "12 h ago" are not reordered in Urdu. */}
        <div lang="en" dir="ltr">
          {children}
        </div>
      </ConsoleShell>
    </LocaleScope>
  );
}
