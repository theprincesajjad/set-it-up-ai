"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sessionApi } from "@/lib/api/browser";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { Button } from "@/components/ui/Button";

/** Ends the session and returns to /login with a "You’re signed out" note. `switching` relabels it for "sign in as someone else". */
export function SignOutButton({ variant = "secondary", switching = false, fullWidth = false, className }: { variant?: "secondary" | "ghost" | "primary"; switching?: boolean; fullWidth?: boolean; className?: string }) {
  const router = useRouter();
  const { t } = useLocaleOrEnglish();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      fullWidth={fullWidth}
      className={className}
      loading={busy}
      iconStart={switching ? undefined : LogOut}
      onClick={async () => {
        setBusy(true);
        await sessionApi.logout().catch(() => undefined);
        router.push(switching ? "/login?switch=1" : "/login?signedout=1");
        router.refresh();
      }}
    >
      {switching ? t("auth.signedIn.other") : t("shell.account.signOut")}
    </Button>
  );
}
