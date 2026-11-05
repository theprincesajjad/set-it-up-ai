"use client";
import { ArrowRight, ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { LOCALES, LOCALE_LIST, normalizeLocale, type Locale } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { MarketingWordmark } from "@/components/marketing/landing/Wordmark";
import { marketingFontVars } from "@/lib/marketing/fonts";

/**
 * The header strings in every language, translated on the server by the layout (see `headerLabels`). The client never imports the
 * message catalogs: they are over 1 MB and only these seven strings per language are shown here.
 */
export interface HeaderLabels {
  nav: Record<string, string>;
  login: string;
  getStarted: string;
  language: string;
}
export type HeaderLabelsByLocale = Record<Locale, HeaderLabels>;

const RESTAURANTS = "/for-restaurants";

/** ?lang= first, then the saved language cookie. Read after mount so the page stays static; English until then. */
function readLocale(): Locale {
  try {
    const q = normalizeLocale(new URLSearchParams(window.location.search).get("lang"));
    if (q) return q;
    const m = /(?:^|; )ll_lang=([^;]+)/.exec(document.cookie);
    return normalizeLocale(m?.[1]) ?? "en";
  } catch {
    return "en";
  }
}

/** Remember the language for next visits (same cookie as lib/i18n/client `rememberLocale`; not imported from there because that module pulls in the message catalogs). */
function rememberLocale(locale: Locale) {
  try {
    document.cookie = `ll_lang=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // cookies blocked: ?lang= still carries the language
  }
}

const subscribeNever = () => () => undefined;

const isCurrent = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/**
 * Marketing top nav (wave T; wave V restyled it to direction B): white, a hairline, the black wordmark in the marketing text face (Halden since wave Y), plain
 * text links that underline on hover (the current page keeps the line), "Log in" as a text link and one black pill button. Its own `.mkt` scope, so the tokens resolve on every marketing page. Mobile menu uses <details> (no JS). The language menu and
 * translated labels appear only on /for-restaurants and /for-shoppers, the pages that have translated content (docs/research/landing-and-network.md 7.3).
 * On /for-bias the sign-in link and the black button become "BIA log in" and "Plan a campaign".
 */
export function SiteHeader({ labels }: { labels: HeaderLabelsByLocale }) {
  const pathname = usePathname() ?? "/";
  // Pages that have translated content (the restaurant page and the shopper page) get the language menu.
  const shoppers = pathname.startsWith("/for-shoppers");
  const translated = pathname.startsWith(RESTAURANTS) || shoppers;
  const langBase = shoppers ? "/for-shoppers" : RESTAURANTS;
  const bia = pathname.startsWith("/for-bias");
  // English on the server and while hydrating; then ?lang= / the cookie. A tap on a language switches the header at once.
  const stored = useSyncExternalStore(subscribeNever, readLocale, () => "en" as Locale);
  const [chosen, setChosen] = useState<Locale | null>(null);
  const locale: Locale = translated ? (chosen ?? stored) : "en";
  const info = LOCALES[locale];
  const nav = copy.nav.items.map((n) => ({ ...n, label: translated && locale !== "en" ? (labels[locale].nav[n.href] ?? n.label) : n.label }));
  const other = translated && locale !== "en";
  const login = bia ? { href: "/login?next=%2Fbia", label: copy.nav.biaLogin } : { href: "/login", label: other ? labels[locale].login : copy.nav.login };
  const cta = bia ? { href: "/for-bias#talk", label: copy.nav.planCampaign } : { href: "/signup", label: other ? labels[locale].getStarted : copy.nav.getStarted };

  const switcher = translated ? (
    <details className="group relative">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-1 rounded-full px-3 text-body text-mkt-body hover:bg-mkt-grey hover:text-mkt-black focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
        <span className="sr-only">{labels[locale].language}: </span>
        <span lang={info.bcp47}>{info.name}</span>
        <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.5} />
      </summary>
      <ul className="absolute end-0 top-12 z-sticky w-44 rounded-r5 border border-mkt-rule bg-mkt-paper p-1.5 shadow-mkt-float">
        {LOCALE_LIST.map((l) => (
          <li key={l.code}>
            <Link
              href={`${langBase}?lang=${l.code}`}
              lang={l.bcp47}
              hrefLang={l.bcp47}
              onClick={() => {
                rememberLocale(l.code);
                setChosen(l.code);
              }}
              aria-current={l.code === locale ? "true" : undefined}
              className={cn("flex min-h-11 items-center rounded-r4 px-3 text-body hover:bg-mkt-grey", l.code === locale ? "font-semibold text-mkt-black" : "text-mkt-body")}
            >
              {l.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  ) : null;

  return (
    <header className={`mkt ${marketingFontVars} sticky top-0 z-sticky border-b border-mkt-rule bg-mkt-paper font-mkt-sans text-mkt-black`} lang={translated ? info.bcp47 : undefined} dir={translated ? info.dir : undefined}>
      <div className="mx-auto flex h-18 max-w-360 items-center justify-between gap-4 px-5 md:px-10 xl:px-15">
        <MarketingWordmark />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isCurrent(pathname, n.href) ? "page" : undefined}
              className={cn("inline-flex h-11 items-center rounded-md px-3.5 text-base font-medium text-mkt-black underline decoration-1 underline-offset-8 transition-colors hover:decoration-mkt-black focus-visible:focus-ring", isCurrent(pathname, n.href) ? "decoration-mkt-black" : "decoration-transparent")}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {switcher}
          <Link href={login.href} className="inline-flex h-11 items-center rounded-md px-3.5 text-base font-medium text-mkt-black underline decoration-transparent decoration-1 underline-offset-8 transition-colors hover:decoration-mkt-black focus-visible:focus-ring">
            {login.label}
          </Link>
          <Link href={cta.href} className="ms-1 inline-flex h-11 items-center rounded-full bg-mkt-black px-5.5 text-base font-semibold text-mkt-on-black transition-colors hover:bg-mkt-black-hover focus-visible:focus-ring">
            {cta.label}
          </Link>
        </div>
        <details className="group relative lg:hidden">
          <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full bg-mkt-grey hover:bg-mkt-grey focus-visible:focus-ring [&::-webkit-details-marker]:hidden" aria-label={copy.nav.menu}>
            <Menu aria-hidden className="size-5" strokeWidth={1.5} />
          </summary>
          <div className="absolute end-0 top-14 w-[min(88vw,320px)] rounded-r7 border border-mkt-rule bg-mkt-paper p-2 shadow-mkt-float">
            <nav aria-label="Main" className="flex flex-col">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} aria-current={isCurrent(pathname, n.href) ? "page" : undefined} className="flex min-h-11 items-center rounded-r4 px-3 text-body font-medium text-mkt-black hover:bg-mkt-grey">
                  {n.label}
                </Link>
              ))}
              {translated ? (
                <div className="flex flex-wrap gap-1 px-1 py-2" role="group" aria-label={labels[locale].language}>
                  {LOCALE_LIST.map((l) => (
                    <Link
                      key={l.code}
                      href={`${langBase}?lang=${l.code}`}
                      lang={l.bcp47}
                              onClick={() => {
                        rememberLocale(l.code);
                        setChosen(l.code);
                      }}
                      aria-current={l.code === locale ? "true" : undefined}
                      className={cn("inline-flex min-h-11 items-center rounded-full border px-3 text-body", l.code === locale ? "border-mkt-black bg-mkt-black text-mkt-on-black" : "border-mkt-rule text-mkt-black")}
                    >
                      {l.name}
                    </Link>
                  ))}
                </div>
              ) : null}
              <Link href={login.href} className="flex min-h-11 items-center rounded-r4 px-3 text-body font-medium text-mkt-black hover:bg-mkt-grey">
                {login.label}
              </Link>
              {/* The page's primary button (landing.css .lp-btn): 56px, the arrow, darker on hover, the focus ring. */}
              <Link href={cta.href} className="group/cta mt-2 flex min-h-14 items-center justify-center gap-2.5 rounded-full bg-mkt-black px-6 text-lg font-semibold text-mkt-on-black transition-colors hover:bg-mkt-black-hover focus-visible:focus-ring">
                {cta.label}
                <ArrowRight aria-hidden strokeWidth={2} className="-me-1 size-4.5 transition-transform group-hover/cta:translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100" />
              </Link>
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
