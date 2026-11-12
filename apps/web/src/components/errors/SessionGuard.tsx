"use client";
import { Lock } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { onSessionEnded } from "@/lib/api/sessionEvents";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { SignInAgainLink } from "./actions";

/**
 * Mount once in each signed-in area (shop dashboard, admin, rep, BIA, door tablet). When any request from the browser comes back 401
 * after the session refresh failed, ONE banner appears: "You've been signed out" with "Sign in again", which returns to this page.
 * It replaces the per-list "couldn't load / try again" that could never succeed. The page underneath stays as it was, so the person at
 * the counter keeps the customer on screen while they sign in again.
 */
export function SessionGuard() {
  const [ended, setEnded] = useState(false);
  useEffect(() => onSessionEnded(() => setEnded(true)), []);
  // The text (and the catalogue behind it) is only needed once the session has ended.
  return ended ? <SessionEndedBanner /> : null;
}

function SessionEndedBanner() {
  const { t } = useLocaleOrEnglish();
  const pathname = usePathname() ?? "";
  const atCounter = pathname.includes("/counter") || pathname.startsWith("/door/");
  return (
    <div role="alert" data-testid="session-ended" className="fixed inset-x-0 top-0 z-banner border-b border-line bg-card px-4 py-3 shadow-card">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
        <Lock aria-hidden className="size-5 shrink-0 text-negative" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-body-strong text-fg">{t("err.signedOut.title")}</p>
          <p className="text-meta text-fg-muted">{atCounter ? t("err.session.counter") : t("err.session.body")}</p>
        </div>
        <SignInAgainLink label={t("err.session.action")} />
      </div>
    </div>
  );
}
