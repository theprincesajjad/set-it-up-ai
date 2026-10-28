import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BiaProvider } from "@/components/dashboard/bia/BiaContext";
import { ConsoleShell } from "@/components/dashboard/ConsoleShell";
import { requireMe } from "@/lib/auth/session";
import { LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: { default: "BIA overview", template: "%s · BIA" }, robots: { index: false, follow: false } };

/** BIA manager tools. Access is decided by the campaigns API (neighbourhood managers + admins). */
export default async function BiaLayout({ children }: { children: ReactNode }) {
  const me = await requireMe("/bia");
  return (
    <LocaleScope locale={await getLocale()}>
      <BiaProvider>
        <ConsoleShell kind="bia" me={me}>
          {children}
        </ConsoleShell>
      </BiaProvider>
    </LocaleScope>
  );
}
