"use client";
import { ArrowRight, ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type SyntheticEvent } from "react";
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
  /** The shopper page's own header actions: its visitors are customers, not shop owners. */
  findShops: string;
  myCard: string;
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

/**
 * A <details> menu that behaves like a menu: it closes when a link inside it is tapped, when the route changes (the header stays mounted
 * across pages, so an open panel would sit on top of the next one), on Escape (focus goes back to its button) and on a tap outside.
 * Without JS it is still a plain <details> that opens and closes.
 */
function useMenu(pathname: string) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  // A menu opened before this script loaded (the <details> works on its own) is already open: pick that up, or Escape and a tap
  // outside would not close it and the button would announce "collapsed".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the DOM's own state, readable only after mount
    if (ref.current?.open) setOpen(true);
  }, []);
  // Close when the route changes. Not on mount: a menu the visitor opened before the script loaded stays open.
  const was = useRef(pathname);
  useEffect(() => {
    if (was.current === pathname) return;
    was.current = pathname;
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  // Listening from mount, not only while React knows the menu is open: the <details> opens by itself, and a tap that follows at once
  // must still close it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !el.open) return;
      el.open = false;
      el.querySelector("summary")?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (el.open && e.target instanceof Node && !el.contains(e.target)) el.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);
  return {
    open,
    props: {
      ref,
      onToggle: (e: SyntheticEvent<HTMLDetailsElement>) => setOpen(e.currentTarget.open),
      onClick: (e: MouseEvent<HTMLDetailsElement>) => {
        if (ref.current && e.target instanceof Element && e.target.closest("a")) ref.current.open = false;
      },
    },
  };
}

const isCurrent = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/**
 * Marketing top nav (wave T; wave V restyled it to direction B): white, a hairline, the black wordmark in the marketing text face (Halden since wave Y), plain
 * text links that underline on hover (the current page keeps the line), "Sign in" as a text link and one black pill button. Its own `.mkt` scope, so the tokens resolve on every marketing page. The phone menu and the language menu are <details> that `useMenu` closes. The language menu and
 * translated labels appear only on /for-restaurants and /for-shoppers, the pages that have translated content (docs/research/landing-and-network.md 7.3).
 * On /for-bias the sign-in link and the black button become "BIA sign in" and "Plan a campaign"; on /for-shoppers, whose visitors are
 * customers, they become "My card" (/me) and "Find shops near me" (/map), the same two actions as that page's hero.
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
  const login = bia ? { href: "/login?next=%2Fbia", label: copy.nav.biaLogin } : shoppers ? { href: "/me", label: labels[locale].myCard } : { href: "/login", label: other ? labels[locale].login : copy.nav.login };
  const cta = bia ? { href: "/for-bias#talk", label: copy.nav.planCampaign } : shoppers ? { href: "/map", label: labels[locale].findShops } : { href: "/signup", label: other ? labels[locale].getStarted : copy.nav.getStarted };
  const langMenu = useMenu(pathname);
  const phoneMenu = useMenu(pathname);

  const switcher = translated ? (
    <details className="group relative" {...langMenu.props}>
      <summary aria-expanded={langMenu.open} className="flex h-11 cursor-pointer list-none items-center gap-1 rounded-full px-3 text-body text-mkt-body hover:bg-mkt-grey hover:text-mkt-black focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
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
        <details className="group relative lg:hidden" {...phoneMenu.props}>
          <summary aria-expanded={phoneMenu.open} className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full bg-mkt-grey hover:bg-mkt-grey focus-visible:focus-ring [&::-webkit-details-marker]:hidden" aria-label={copy.nav.menu}>
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
