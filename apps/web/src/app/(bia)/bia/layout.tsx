import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/dashboard/ConsoleShell";
import { requireMe } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "BIA campaigns", template: "%s · BIA" }, robots: { index: false, follow: false } };

/** BIA manager tools. Access is decided by the campaigns API (neighbourhood managers + admins). */
export default async function BiaLayout({ children }: { children: ReactNode }) {
  const me = await requireMe("/bia");
  return (
    <ConsoleShell kind="bia" me={me}>
      {children}
    </ConsoleShell>
  );
}
