import { BRAND, translator, type Locale } from "@ll/shared";
import { cn } from "@/lib/cn";

/** Where the line leads: the landing page for the shop's own trade, the nail-tech page (the broadest) for anything else. `?src=client` marks the visit as coming from a client. */
export function poweredByHref(vertical?: string | null): string {
  const page = vertical === "barber" ? "/for-barbers" : vertical === "pet" ? "/for-groomers" : "/for-nail-techs";
  return `${page}?src=client`;
}

/** Trades that take bookings: the shop page shows the line only for these (the booking and confirmation pages show it for every trade). */
export const POWERED_BY_TRADES: readonly string[] = ["nails", "brows_lashes", "makeup", "salon", "barber", "spa", "pet"];

/**
 * The client loop (solo-pro-launch.md 5.3): one quiet line on the booking page, the confirmation and the pass. It links to the landing page
 * that matches the shop's trade with `?src=client`, and is hidden on paid plans: pages pass `show` from the public shop response's
 * `poweredBy` (showsPoweredBy in @ll/shared plans.ts, computed by the API).
 */
export function PoweredBy({ locale, vertical, show = true, className, source }: { locale: Locale; vertical?: string | null; /** False on paid plans (`PublicShopResponse.poweredBy`). */ show?: boolean; className?: string; /** "preview" keeps it from being a live link on the marketing page. */ source?: "preview" }) {
  if (!show) return null;
  const t = translator(locale);
  const line = (
    <>
      <span className="font-semibold">{t("pass.poweredBy.by", { brand: BRAND.name })}</span>
      <span aria-hidden> · </span>
      <span>{t("pass.poweredBy.ask")}</span>
    </>
  );
  const cls = cn("block text-meta text-fg-muted", className);
  if (source === "preview") return <p className={cls}>{line}</p>;
  return (
    <p className={cn("text-center", className)} data-powered-by>
      {/* A plain anchor, not <Link>: the landing page's beacon runs only on a full document load, so a client-side navigation would never count this visit (ab-spec §4.1). */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full navigation on purpose, see above */}
      <a href={poweredByHref(vertical)} className="inline-flex min-h-11 items-center text-meta text-fg-muted underline underline-offset-2 hover:text-fg focus-visible:focus-ring">
        <span>{line}</span>
      </a>
    </p>
  );
}
