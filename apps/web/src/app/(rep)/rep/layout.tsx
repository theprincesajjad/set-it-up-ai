import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/dashboard/ConsoleShell";
import { NoAccess } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Layout";
import { requireMe } from "@/lib/auth/session";
import { LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: { default: "Rep console", template: "%s · Rep console" }, robots: { index: false, follow: false } };

/** Rep console guard (rep-console.md): platform role rep (admins pass). */
export default async function RepLayout({ children }: { children: ReactNode }) {
  const me = await requireMe("/rep");
  if (me.platformRole !== "rep" && me.platformRole !== "admin")
    return (
      <Container size="public" className="py-16">
        <NoAccess title="This area is for the onboarding team." body="Signed in as a shop? Your dashboard has everything for your shop." action={<Button href="/m">Go to your dashboard</Button>} />
      </Container>
    );
  return (
    <LocaleScope locale={await getLocale()}>
      <ConsoleShell kind="rep" me={me}>
        {children}
      </ConsoleShell>
    </LocaleScope>
  );
}
