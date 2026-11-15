"use client";
import { Lock } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

/**
 * A customer's session ended (a 401 from any wallet call): say so, and offer the one thing that fixes it. The signed-out /me is the
 * phone sign-in, so "Sign in again" reloads it (never "Try again", which cannot work on a 401).
 */
export function SessionEndedCard({ href, className }: { href?: string; className?: string }) {
  const { t } = useLocaleOrEnglish();
  // The signed-out page at this same address is the phone sign-in, so signing in again brings the person back to the tab they were on.
  const here = usePathname();
  href ??= here && here.startsWith("/me") ? here : "/me";
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-3 rounded-card border border-line bg-card p-4", className)}>
      <div className="flex items-start gap-3">
        <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" strokeWidth={1.75} />
        <div className="min-w-0">
          <p className="text-body-strong text-fg">{t("err.session.title")}</p>
          <p className="mt-0.5 text-meta text-fg-muted">{t("err.session.body")}</p>
        </div>
      </div>
      {/* A real navigation on purpose: the session is gone, so nothing in the client router is worth keeping. */}
      <Button href={href} size="md">{t("err.session.action")}</Button>
    </div>
  );
}
