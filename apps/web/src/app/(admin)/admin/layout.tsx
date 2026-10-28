import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/dashboard/ConsoleShell";
import { NoAccess } from "@/components/dashboard/PageStates";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Layout";
import { requireMe } from "@/lib/auth/session";
import { LocaleScope } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

/** Admin guard (admin.md): platform role admin only. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireMe("/admin");
  if (me.platformRole !== "admin")
    return (
      <Container size="public" className="py-16">
        <NoAccess title="This area is for platform admins." body="Your account doesn't have admin access." action={<Button href="/m">Go to your dashboard</Button>} />
      </Container>
    );
  return (
    <LocaleScope locale={await getLocale()}>
      <ConsoleShell kind="admin" me={me}>
        {children}
      </ConsoleShell>
    </LocaleScope>
  );
}
