import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LocaleScope } from "@/lib/i18n/LocaleScope";
import { getLocale, getT } from "@/lib/i18n/server";
import { headers } from "next/headers";
import { BRAND } from "@ll/shared";
import { CUT_LINK_HEADER, NOT_FOUND_KEYS, PATH_HEADER, notFoundContext } from "./notFoundCopy";

/** One of the owner's ways on: a 44px underlined link with an arrow (mirrors in Urdu). */
function RowLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-foreground underline decoration-input/60 underline-offset-2 hover:decoration-foreground focus-visible:focus-ring">
      {children}
      <ArrowRight aria-hidden className="size-4 rtl:-scale-x-100" strokeWidth={2.2} />
    </Link>
  );
}

/** The request's 404 context (a shop, an event, a text-message link, a cut-off link, or just a page), read from the path the proxy forwards. */
export async function currentNotFoundContext() {
  const h = await headers();
  return notFoundContext(h.get(PATH_HEADER), { cut: h.get(CUT_LINK_HEADER) === "1" });
}

/**
 * The public 404 card (visitors and shoppers): the 3D pin, an h1 that says what was not found ("We can’t find that shop", "We can’t find this
 * link", "That link looks cut off", or the page), one line of why, the shopper's way on (Find shops, Home) and under a hairline the owner's
 * (Pricing, Sign in). Server-rendered, translated, mirrors in Urdu. Used by the root 404 and the marketing 404.
 */
export async function NotFoundCard() {
  const [locale, t, ctx] = await Promise.all([getLocale(), getT(), currentNotFoundContext()]);
  const keys = NOT_FOUND_KEYS[ctx];
  return (
    <LocaleScope locale={locale} lazyCatalog>
      <NotFoundTitle />
      <div className="card-clear overflow-hidden text-center">
        <div className="flex flex-col items-center px-6 pt-10 pb-8 md:px-10">
          {/* loading="lazy": this card is also carried, unrendered, in every page's payload as its not-found boundary, and an eager image
              there made every page preload a picture it never shows (a console warning on each load). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons3d/pin_area@2x.png" alt="" aria-hidden width={128} height={128} loading="lazy" className="size-32 drop-shadow-md" />
          <p aria-hidden className="mt-1 rounded-full bg-muted px-3 py-1 text-meta-strong tabular-nums text-muted-foreground">
            404
          </p>
          <h1 className="mt-5 text-title font-bold text-balance text-foreground">{t(keys.title)}</h1>
          <p className="mt-2 max-w-sm text-body text-muted-foreground">{t(keys.body)}</p>
          <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
            <Button href="/map" size="lg">
              {t("auth.notFound.find")}
            </Button>
            <Button href="/" variant="secondary" size="lg">
              {t("err.action.home")}
            </Button>
          </div>
        </div>
        {/* A shop owner who mistyped a marketing URL gets a way on too, not only shoppers. */}
        <p className="flex flex-wrap items-center justify-center gap-x-1 border-t border-border bg-bg-subtle px-4 py-3 text-meta text-muted-foreground" data-testid="not-found-business">
          <span className="me-1">{t("auth.notFound.business")}</span>
          <RowLink href="/pricing">{t("auth.notFound.pricing")}</RowLink>
          <RowLink href="/login">{t("auth.notFound.signIn")}</RowLink>
        </p>
      </div>
    </LocaleScope>
  );
}

/**
 * The tab title of a 404 ("We can’t find that shop · Local Loyalty"), as a hoisted <title> (React 19): a not-found file's own metadata export
 * is not applied, and the page's own title ("Shop", "Neighbourhood event") or the marketing home title must not sit over a "not found" body.
 */
export async function NotFoundTitle() {
  const [t, ctx] = await Promise.all([getT(), currentNotFoundContext()]);
  const title = t(NOT_FOUND_KEYS[ctx].title).replace(/[.。।۔]$/, "");
  return <title>{`${title} · ${BRAND.name}`}</title>;
}

/** Tab title for a 404: "Page not found" in the visitor's language (the brand is added by the title template), never the marketing home title. */
export async function notFoundMetadata() {
  const [t, ctx] = await Promise.all([getT(), currentNotFoundContext()]);
  const title = t(NOT_FOUND_KEYS[ctx].title).replace(/[.。।۔]$/, "");
  return { title, robots: { index: false, follow: false } };
}
