import Link from "next/link";
import { BRAND, translator, type Locale } from "@ll/shared";
import { cn } from "@/lib/cn";

/** Where the line leads: the landing page for the shop's own trade, the nail-tech page (the broadest) for anything else. `?src=client` marks the visit as coming from a client. */
export function poweredByHref(vertical?: string | null): string {
  const page = vertical === "barber" ? "/for-barbers" : vertical === "pet" ? "/for-groomers" : "/for-nail-techs";
  return `${page}?src=client`;
}

/** Trades that take bookings: the shop page and pass card show the line only for these. */
export const POWERED_BY_TRADES: readonly string[] = ["salon", "barber", "spa", "pet"];

/** Paid plans never show the line. `plan` is whatever the page knows about the shop; unknown means Free. */
export function showsPoweredBy(plan?: string | null): boolean {
  return !plan || plan === "free";
}

/**
 * The client loop (solo-pro-launch.md 5.3): one quiet line on the booking page, the confirmation and the pass. It links to the landing page
 * that matches the shop's trade with `?src=client`, and is hidden on paid plans.
 * TODO(A): the public shop response does not carry the plan yet; pages pass `plan` as soon as it does.
 */
export function PoweredBy({ locale, vertical, plan, className, source }: { locale: Locale; vertical?: string | null; plan?: string | null; className?: string; /** "preview" keeps it from being a live link on the marketing page. */ source?: "preview" }) {
  if (!showsPoweredBy(plan)) return null;
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
      <Link href={poweredByHref(vertical)} className="inline-flex min-h-11 items-center text-meta text-fg-muted underline underline-offset-2 hover:text-fg focus-visible:focus-ring">
        <span>{line}</span>
      </Link>
    </p>
  );
}
