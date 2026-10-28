"use client";
import { ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { LOCALES, LOCALE_LIST, normalizeLocale, type Locale } from "@ll/shared";
import { buttonClasses } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { Wordmark } from "./Brand";

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
 * Marketing top nav: white, hairline, one black button. Mobile menu uses <details> (no JS). The language menu and
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
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-full px-3 text-meta-strong text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring [&::-webkit-details-marker]:hidden" >
        <span className="sr-only">{labels[locale].language}: </span>
        <span lang={info.bcp47}>{info.name}</span>
        <ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" strokeWidth={2} />
      </summary>
      <ul className="absolute end-0 top-10 z-sticky w-40 rounded-card border border-line bg-bg p-1 shadow-float">
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
              className={cn("block rounded-input px-3 py-2 text-body hover:bg-bg-subtle", l.code === locale ? "font-semibold text-fg" : "text-fg-muted")}
            >
              {l.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  ) : null;

  return (
    <header className="sticky top-0 z-sticky border-b border-line bg-bg/90 backdrop-blur-chrome" lang={translated ? info.bcp47 : undefined} dir={translated ? info.dir : undefined}>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-8">
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isCurrent(pathname, n.href) ? "page" : undefined}
              className={cn("rounded-full px-3.5 py-2 text-meta-strong transition-colors hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring", isCurrent(pathname, n.href) ? "text-fg" : "text-fg-muted")}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-1 lg:flex">
          {switcher}
          <Link href={login.href} className="rounded-full px-3.5 py-2 text-meta-strong text-fg hover:bg-bg-subtle focus-visible:focus-ring">
            {login.label}
          </Link>
          <Link href={cta.href} className={buttonClasses({ size: "sm" }) + " rounded-full!"}>
            {cta.label}
          </Link>
        </div>
        <details className="group relative lg:hidden">
          <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full hover:bg-bg-subtle focus-visible:focus-ring [&::-webkit-details-marker]:hidden" aria-label={copy.nav.menu}>
            <Menu aria-hidden className="size-5" strokeWidth={1.75} />
          </summary>
          <div className="absolute end-0 top-14 w-[min(88vw,320px)] rounded-card border border-line bg-bg p-2 shadow-float">
            <nav aria-label="Main" className="flex flex-col">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} aria-current={isCurrent(pathname, n.href) ? "page" : undefined} className="rounded-input px-3 py-3 text-body text-fg hover:bg-bg-subtle">
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
                      className={cn("rounded-full border px-3 py-1.5 text-meta-strong", l.code === locale ? "border-fg bg-fg text-bg" : "border-line text-fg")}
                    >
                      {l.name}
                    </Link>
                  ))}
                </div>
              ) : null}
              <Link href={login.href} className="rounded-input px-3 py-3 text-body text-fg hover:bg-bg-subtle">
                {login.label}
              </Link>
              <Link href={cta.href} className={buttonClasses({ fullWidth: true, size: "lg" }) + " mt-2"}>
                {cta.label}
              </Link>
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
