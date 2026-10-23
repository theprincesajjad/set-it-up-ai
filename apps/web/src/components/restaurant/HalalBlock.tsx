"use client";
import { ShieldCheck } from "lucide-react";
import type { restaurantWebApi } from "@ll/shared";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import { halalBanner } from "@/lib/restaurant/halal";

/**
 * The shop's halal claim, once, as the owner stated it: scope, slaughter method, certifier and expiry.
 * The same sentences print on the shop page and the menu (frames 10 and 11). We never badge a shop ourselves and
 * print nothing the owner did not say; past its date the certifier name is withheld (the API already hides it).
 */
export function HalalBlock({ cert, variant = "menu", className }: { cert: restaurantWebApi.PublicHalalCertification; variant?: "shop" | "menu"; className?: string }) {
  const { t, date } = useLocale();
  const b = halalBanner(cert, t, (d) => date(`${d}T12:00:00Z`, { month: "short", year: "numeric" }, "UTC"));
  return (
    <section aria-label={t("halal.label")} className={cn("flex flex-col gap-0.5 rounded-card bg-bg-subtle px-4 py-3", className)}>
      <h2 className="flex items-center gap-2 text-body-strong text-fg">
        {b.expired ? null : <ShieldCheck aria-hidden className="size-4 shrink-0 text-fg-muted" strokeWidth={1.75} />}
        <span className="min-w-0">{b.title}</span>
      </h2>
      {b.sub ? <p className="text-meta text-fg-muted">{b.sub}</p> : null}
      {b.note ? <p className="text-meta text-fg-muted">{b.note}</p> : null}
      {variant === "shop" && b.fileUrl ? (
        <a href={b.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-1 self-start rounded-sm text-meta-strong text-fg underline decoration-line-strong underline-offset-4 focus-visible:focus-ring">
          {t("halal.seeCertificate")} <span aria-hidden className="inline-block rtl:rotate-180">›</span>
        </a>
      ) : null}
    </section>
  );
}
