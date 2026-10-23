import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BiaProvider } from "@/components/dashboard/bia/BiaContext";
import { ConsoleShell } from "@/components/dashboard/ConsoleShell";
import { requireMe } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "BIA overview", template: "%s · BIA" }, robots: { index: false, follow: false } };

/** BIA manager tools. Access is decided by the campaigns API (neighbourhood managers + admins). */
export default async function BiaLayout({ children }: { children: ReactNode }) {
  const me = await requireMe("/bia");
  return (
    <BiaProvider>
      <ConsoleShell kind="bia" me={me}>
        {children}
      </ConsoleShell>
    </BiaProvider>
  );
}
