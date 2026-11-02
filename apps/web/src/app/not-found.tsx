import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PassFooter } from "@/components/site/PassFooter";
// Direct import: the "@/lib/i18n" barrel also brings the client LanguageSwitcher into every page that renders this.
import { LocaleScope } from "@/lib/i18n/LocaleScope";
import { getLocale, getT } from "@/lib/i18n/server";

/** One of the owner's two ways on: a 44px underlined link with an arrow (mirrors in Urdu). */
function RowLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-foreground underline decoration-input/60 underline-offset-2 hover:decoration-foreground focus-visible:focus-ring">
      {children}
      <ArrowRight aria-hidden className="size-4 rtl:-scale-x-100" strokeWidth={2.2} />
    </Link>
  );
}

/**
 * The 404 (wave Q visual pass): one card with the 3D pin, the message, the shopper's way on (the map) and Home, and under a hairline
 * the owner's way on (pricing, sign in) as two 44px links. Server-rendered, translated, mirrors in Urdu.
 */
export default async function NotFound() {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  return (
    <>
      <main id="main" className="mx-auto max-w-[520px] px-4 py-12 md:py-20">
        <LocaleScope locale={locale} lazyCatalog>
          <div className="card-clear overflow-hidden text-center">
            <div className="flex flex-col items-center px-6 pt-10 pb-8 md:px-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons3d/pin_area@2x.png" alt="" aria-hidden width={128} height={128} className="size-32 drop-shadow-md" />
              <p aria-hidden className="mt-1 rounded-full bg-muted px-3 py-1 text-meta-strong tabular-nums text-muted-foreground">
                404
              </p>
              <h1 className="mt-5 text-title font-[700] text-balance text-foreground">{t("auth.notFound.title")}</h1>
              <p className="mt-2 max-w-sm text-body text-muted-foreground">{t("auth.notFound.body")}</p>
              <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
                <Button href="/map" size="lg">
                  {t("auth.notFound.find")}
                </Button>
                <Button href="/" variant="secondary" size="lg">
                  {t("auth.notFound.home")}
                </Button>
              </div>
            </div>
            {/* Wave P: a shop owner who mistyped a marketing URL gets a way on too, not only shoppers. */}
            <p className="flex flex-wrap items-center justify-center gap-x-1 border-t border-border bg-bg-subtle px-4 py-3 text-meta text-muted-foreground" data-testid="not-found-business">
              <span className="me-1">{t("auth.notFound.business")}</span>
              <RowLink href="/pricing">{t("auth.notFound.pricing")}</RowLink>
              <RowLink href="/login">{t("auth.notFound.signIn")}</RowLink>
            </p>
          </div>
        </LocaleScope>
      </main>
      <PassFooter lazyCatalog />
    </>
  );
}
