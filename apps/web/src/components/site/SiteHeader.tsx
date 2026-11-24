"use client";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type SyntheticEvent } from "react";
import { LOCALES, LOCALE_LIST, normalizeLocale, type Locale } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { MarketingWordmark } from "@/components/marketing/landing/Wordmark";
import { marketingFontVars } from "@/lib/marketing/fonts";
import { InlineScript } from "@/components/ui/ThemeStyle";

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
  /** The restaurant page's own ask: its sign-up starts the restaurant plan, not a stamp card. */
  restaurantCta?: string;
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
 * Translated pages: the header carries its words in all four languages and CSS shows the set named by `data-lang` (marketing.css). This
 * runs while the HTML is parsed, before first paint, and picks the language the page itself was rendered in (?lang=, then the cookie, the
 * same order as the pages' pageLocale), so the header never shows English left to right and then flips after hydration.
 */
const LANG_INFO = JSON.stringify(Object.fromEntries(LOCALE_LIST.map((l) => [l.code, [l.bcp47, l.dir]])));
const LANG_SCRIPT = `(function(){try{var I=${LANG_INFO},h=document.currentScript.parentElement,q=new URLSearchParams(location.search).get("lang"),m=/(?:^|; )ll_lang=([^;]+)/.exec(document.cookie),n=function(v){v=(v||"").trim().toLowerCase().split(/[-_]/)[0];return I[v]?v:""},l=n(q)||n(m&&m[1])||"en";h.setAttribute("data-lang",l);h.lang=I[l][0];h.dir=I[l][1]}catch(e){}})()`;

/**
 * A <details> menu that behaves like a menu: it closes when a link inside it is tapped, when the route changes (the header stays mounted
 * across pages, so an open panel would sit on top of the next one), on Escape (focus goes back to its button), on a tap outside and
 * when keyboard focus leaves it.
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
      // Outside the menu.
      if (el.open && e.target instanceof Element && !el.contains(e.target)) el.open = false;
    };
    // On its scrim (inside the <details>, behind the panel): closed on the click, not the pointerdown. Hiding the <details> content
    // under a pointer that is still down on it crashes Chromium's renderer.
    const onScrimClick = (e: Event) => {
      if (el.open && e.target instanceof Element && e.target.closest("[data-scrim]")) {
        e.preventDefault();
        el.open = false;
      }
    };
    // Tab past the last item (or Shift+Tab past the button): the menu closes, so focus never moves through the dimmed page behind it.
    const onFocusOut = (e: FocusEvent) => {
      if (el.open && e.relatedTarget instanceof Node && !el.contains(e.relatedTarget)) el.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    el.addEventListener("focusout", onFocusOut);
    el.addEventListener("click", onScrimClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      el.removeEventListener("focusout", onFocusOut);
      el.removeEventListener("click", onScrimClick);
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
 * customers, they become "My card" (/me) and "Find shops near me" (/map), the same two actions as that page's hero; on /for-restaurants the
 * button starts the restaurant plan (sign-up with the restaurant trade chosen).
 * Wide screens (xl): logo, links and actions in three columns, so the links stay put when the language menu joins the actions.
 * The translated pages' labels are longer (Urdu, Hindi, Punjabi), so their full row starts at xl and the menu serves below it.
 * Phones: the menu is a full-width panel under the bar over a scrim; the page behind does not scroll while it is open (marketing.css).
 */
export function SiteHeader({ labels }: { labels: HeaderLabelsByLocale }) {
  const pathname = usePathname() ?? "/";
  // Pages that have translated content (the restaurant page and the shopper page) get the language menu.
  const shoppers = pathname.startsWith("/for-shoppers");
  const restaurants = pathname.startsWith(RESTAURANTS);
  const translated = restaurants || shoppers;
  const langBase = shoppers ? "/for-shoppers" : RESTAURANTS;
  const bia = pathname.startsWith("/for-bias");
  // English on the server and while hydrating; then ?lang= / the cookie. A tap on a language switches the header at once. On a hard load
  // LANG_SCRIPT has already shown the right words before paint, so nothing visible changes when this catches up.
  const stored = useSyncExternalStore(subscribeNever, readLocale, () => "en" as Locale);
  const [chosen, setChosen] = useState<Locale | null>(null);
  const locale: Locale = translated ? (chosen ?? stored) : "en";
  const info = LOCALES[locale];
  /** One string in every language on the translated pages (CSS shows the header's `data-lang`), plain English elsewhere. */
  const say = (word: (l: Locale) => string) =>
    translated
      ? LOCALE_LIST.map((l) => (
          <span key={l.code} data-l={l.code} lang={l.bcp47}>
            {word(l.code)}
          </span>
        ))
      : word("en");
  const nav = copy.nav.items.map((n) => ({ ...n, label: say((l) => (l === "en" ? n.label : (labels[l].nav[n.href] ?? n.label))) }));
  const login = bia ? { href: "/login?next=%2Fbia", label: copy.nav.biaLogin } : shoppers ? { href: "/me", label: say((l) => labels[l].myCard) } : { href: "/login", label: say((l) => (l === "en" ? copy.nav.login : labels[l].login)) };
  const cta = bia
    ? { href: "/for-bias#talk", label: copy.nav.planCampaign }
    : shoppers
      ? { href: "/map", label: say((l) => labels[l].findShops) }
      : restaurants
        ? { href: "/signup?vertical=restaurant_south_asian", label: say((l) => labels[l].restaurantCta ?? labels[l].getStarted) }
        : { href: "/signup", label: copy.nav.getStarted };
  const langMenu = useMenu(pathname);
  const phoneMenu = useMenu(pathname);

  const switcher = translated ? (
    <details className="ll-pop group relative" {...langMenu.props}>
      <summary aria-expanded={langMenu.open} className="flex h-11 cursor-pointer list-none items-center gap-1 rounded-full px-3 text-body text-mkt-body transition-colors duration-150 hover:bg-mkt-grey hover:text-mkt-black active:bg-mkt-grey focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
        <span className="sr-only">{say((l) => labels[l].language)}: </span>
        {say((l) => LOCALES[l].name)}
        <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.5} />
      </summary>
      <ul data-panel className="absolute end-0 top-12 z-sticky w-44 rounded-r5 border border-mkt-rule bg-mkt-paper p-1.5 shadow-mkt-float">
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
              className={cn("flex min-h-11 items-center rounded-r4 px-3 text-body transition-colors duration-150 hover:bg-mkt-grey active:bg-mkt-grey", l.code === locale ? "font-semibold text-mkt-black" : "text-mkt-body")}
            >
              {l.name}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  ) : null;

  return (
    <header
      className={`mkt ${marketingFontVars} ll-hdr sticky top-0 z-sticky border-b border-mkt-rule bg-mkt-paper font-mkt-sans text-mkt-black`}
      lang={translated ? info.bcp47 : undefined}
      dir={translated ? info.dir : undefined}
      data-lang={translated ? locale : undefined}
      // LANG_SCRIPT sets lang, dir and data-lang from the URL before hydration; React's first pass is English and then agrees with it.
      suppressHydrationWarning
    >
      {translated ? <InlineScript html={LANG_SCRIPT} /> : null}
      <div className="mx-auto flex h-18 max-w-360 items-center justify-between gap-4 px-5 md:px-10 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:px-15">
        <MarketingWordmark />
        <nav aria-label="Main" className={cn("hidden items-center gap-1 whitespace-nowrap", translated ? "xl:flex" : "lg:flex")}>
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isCurrent(pathname, n.href) ? "page" : undefined}
              className={cn("inline-flex h-11 items-center rounded-md px-3.5 text-base font-medium text-mkt-black underline decoration-1 underline-offset-8 transition-[color,text-decoration-color,opacity] duration-150 hover:decoration-mkt-black active:opacity-60 focus-visible:focus-ring", isCurrent(pathname, n.href) ? "decoration-mkt-black" : "decoration-transparent")}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className={cn("hidden items-center gap-2 whitespace-nowrap xl:justify-self-end", translated ? "xl:flex" : "lg:flex")}>
          {switcher}
          <Link href={login.href} className="inline-flex h-11 items-center rounded-md px-3.5 text-base font-medium text-mkt-black underline decoration-transparent decoration-1 underline-offset-8 transition-[color,text-decoration-color,opacity] duration-150 hover:decoration-mkt-black active:opacity-60 focus-visible:focus-ring">
            {login.label}
          </Link>
          <Link href={cta.href} prefetch={false} className="ms-1 inline-flex h-11 items-center rounded-full bg-mkt-black px-5.5 text-base font-semibold text-mkt-on-black transition-[background-color,scale] duration-150 ease-out hover:bg-mkt-black-hover active:scale-96 active:bg-mkt-black-hover motion-reduce:active:scale-100 focus-visible:focus-ring">
            {cta.label}
          </Link>
        </div>
        <details className={cn("ll-menu group", translated ? "xl:hidden" : "lg:hidden")} {...phoneMenu.props}>
          <summary aria-expanded={phoneMenu.open} className="grid size-11 cursor-pointer list-none place-items-center rounded-full bg-mkt-grey transition-[background-color,scale] duration-150 ease-out hover:bg-mkt-grey-hover active:scale-96 active:bg-mkt-grey-hover motion-reduce:active:scale-100 focus-visible:focus-ring [&::-webkit-details-marker]:hidden" aria-label={copy.nav.menu}>
            {/* The lines become a cross while the menu is open: both icons stay in the DOM and cross-fade (marketing.css .ll-swap). */}
            <Menu aria-hidden className="ll-swap col-start-1 row-start-1 size-5 group-open:scale-25 group-open:opacity-0" strokeWidth={1.5} />
            <X aria-hidden className="ll-swap col-start-1 row-start-1 size-5 scale-25 opacity-0 group-open:scale-100 group-open:opacity-100" strokeWidth={1.5} />
          </summary>
          {/* The scrim: the page behind is dimmed, and a tap on it closes the menu (useMenu). */}
          <div aria-hidden data-scrim className="absolute inset-x-0 top-full h-dvh bg-overlay" />
          <div data-panel className="absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain rounded-b-r7 border-b border-mkt-rule bg-mkt-paper px-3 pt-2 pb-4 shadow-mkt-float">
            <nav aria-label="Main" className="mx-auto flex max-w-xl flex-col">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} aria-current={isCurrent(pathname, n.href) ? "page" : undefined} className="flex min-h-12 items-center rounded-r4 px-3 text-lg font-medium text-mkt-black transition-colors duration-150 hover:bg-mkt-grey active:bg-mkt-grey aria-[current=page]:underline aria-[current=page]:decoration-1 aria-[current=page]:underline-offset-8">
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
                      className={cn("inline-flex min-h-11 items-center rounded-full border px-3 text-body", l.code === locale ? "border-mkt-black bg-mkt-black text-mkt-on-black" : "border-mkt-rule text-mkt-black active:bg-mkt-grey")}
                    >
                      {l.name}
                    </Link>
                  ))}
                </div>
              ) : null}
              <Link href={login.href} className="flex min-h-12 items-center rounded-r4 px-3 text-lg font-medium text-mkt-black transition-colors duration-150 hover:bg-mkt-grey active:bg-mkt-grey">
                {login.label}
              </Link>
              {/* The page's primary button (landing.css .lp-btn): 56px, the arrow, darker on hover, the focus ring. */}
              <Link href={cta.href} prefetch={false} className="group/cta mt-2 flex min-h-14 items-center justify-center gap-2.5 rounded-full bg-mkt-black px-6 text-lg font-semibold text-mkt-on-black transition-[background-color,scale] duration-150 ease-out hover:bg-mkt-black-hover active:scale-96 active:bg-mkt-black-hover motion-reduce:active:scale-100 focus-visible:focus-ring">
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
