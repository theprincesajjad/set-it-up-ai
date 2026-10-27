"use client";
/**
 * Dashboard shell (foundations.md "Merchant dashboard"): light grey sidebar with 32px rows,
 * header slot (switcher + setup progress), footer slot (help + account); a 56px top bar with
 * the page title left and search (⌘K) right. Below lg the sidebar becomes a left drawer.
 * Used by the merchant dashboard, rep console, admin and BIA tools.
 */
import { Menu, Search, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CommandMenu, type CommandSearch } from "./CommandMenu";
import { Kbd } from "./kit";

export interface ShellNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: string;
  /** Small heading above the group; read from the group's first item. */
  groupLabel?: string;
  exact?: boolean;
  /** A count after the label (restaurants: new orders in accent, calls and chats waiting in muted text). */
  badge?: { count: number; accent?: boolean };
}

export interface ShellProps {
  nav: ShellNavItem[];
  header: ReactNode;
  footer?: ReactNode;
  /** Shown above the page (e.g. "Viewing as" row). */
  notice?: ReactNode;
  /** Compact name for the phone top bar. */
  mobileTitle: ReactNode;
  /** Right side of the top bar, after search. */
  topActions?: ReactNode;
  search?: CommandSearch;
  searchPlaceholder?: string;
  /** Phones: a pill tab bar at the bottom that mirrors the sidebar items (BIA console). */
  bottomTabs?: boolean;
  children: ReactNode;
}

const CRUMBS: Record<string, string> = { kit: "QR kit", import: "Import", new: "New", developers: "Webhooks & API", automations: "Automations" };
/** Last path segment as a breadcrumb label (ids read as "Details"). */
function crumb(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean).pop() ?? "";
  return CRUMBS[seg] ?? (/^[0-9a-f-]{8,}$/i.test(seg) ? "Details" : seg.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase()));
}

function matches(pathname: string, i: ShellNavItem) {
  return i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
}
/** One row is current: when a longer entry also matches ("/classes/offers" inside "/classes"), the longer one wins. */
function isActive(pathname: string, i: ShellNavItem, nav?: ShellNavItem[]) {
  if (!matches(pathname, i)) return false;
  return !nav?.some((o) => o !== i && o.href.length > i.href.length && matches(pathname, o));
}

/** Most specific nav entry for the current path (for the top bar title). */
export function activeNav(pathname: string, nav: ShellNavItem[]): ShellNavItem | undefined {
  return [...nav].sort((a, b) => b.href.length - a.href.length).find((i) => matches(pathname, i) || pathname === i.href);
}

function NavList({ nav, pathname, onNavigate }: { nav: ShellNavItem[]; pathname: string; onNavigate?: () => void }) {
  const groups: ShellNavItem[][] = [];
  for (const i of nav) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.group === i.group) last.push(i);
    else groups.push([i]);
  }
  const ref = useRef<HTMLElement>(null);
  // A long nav scrolls inside the sidebar; keep the current page's row in view instead of half cut off at the bottom.
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname]);
  return (
    <nav ref={ref} aria-label="Main" className="flex flex-col gap-4">
      {groups.map((g, gi) => {
        const label = g[0]!.groupLabel;
        const list = (
        <ul key={gi} aria-label={label} className="flex flex-col gap-px">
          {g.map((i) => {
            const active = isActive(pathname, i, nav);
            return (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-[14px] leading-5 transition-colors focus-visible:focus-ring",
                    active ? "bg-bg-muted font-medium text-fg" : "text-fg hover:bg-bg-muted/60",
                  )}
                >
                  <i.icon aria-hidden className={cn("size-4 shrink-0", active ? "text-fg" : "text-fg-muted")} strokeWidth={1.75} />
                  <span className="truncate">{i.label}</span>
                  {i.badge && i.badge.count > 0 ? (
                    <span aria-label={`${i.badge.count} waiting`} className={cn("ms-auto shrink-0 text-[12px] font-medium leading-4 tabular", i.badge.accent ? "text-accent-text" : "text-fg-muted")}>
                      {i.badge.count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        );
        return label ? (
          <div key={gi}>
            <p aria-hidden className="px-2 pb-1 text-[12px] leading-4 text-fg-muted">
              {label}
            </p>
            {list}
          </div>
        ) : (
          list
        );
      })}
    </nav>
  );
}

export function Shell({ nav, header, footer, notice, mobileTitle, topActions, search, searchPlaceholder = "Search", bottomTabs, children }: ShellProps) {
  const pathname = usePathname() ?? "";
  const [drawer, setDrawer] = useState(false);
  const [cmd, setCmd] = useState(false);
  const current = activeNav(pathname, nav);
  const deeper = current && pathname !== current.href;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sidebar = (onNavigate?: () => void) => (
    <>
      <div className="px-3 pt-3">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <NavList nav={nav} pathname={pathname} onNavigate={onNavigate} />
      </div>
      {footer ? <div className="border-t border-line px-3 py-3">{footer}</div> : null}
    </>
  );

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="flex min-h-dvh">
      <aside className="hidden w-[240px] shrink-0 border-e border-line bg-bg-subtle lg:block print:!hidden">
        <div className="sticky top-0 flex h-dvh flex-col">{sidebar()}</div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-sticky flex h-14 items-center gap-3 border-b border-line bg-bg px-4 md:px-8 print:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setDrawer(true)} className="-ms-2 inline-flex size-9 items-center justify-center rounded-input text-fg hover:bg-bg-subtle lg:hidden focus-visible:focus-ring">
            <Menu aria-hidden className="size-5" strokeWidth={1.75} />
          </button>
          <div className="min-w-0 flex-1 truncate text-body">
            <span className="lg:hidden">
              <span className="font-semibold text-fg">{mobileTitle}</span>
            </span>
            <span className="hidden items-center gap-1.5 lg:flex">
              {current ? (
                deeper ? (
                  <>
                    <Link href={current.href} className="text-fg-muted hover:text-fg">
                      {current.label}
                    </Link>
                    <span aria-hidden className="text-fg-subtle">
                      /
                    </span>
                    <span className="text-fg">{crumb(pathname)}</span>
                  </>
                ) : (
                  <span className="font-medium text-fg">{current.label}</span>
                )
              ) : (
                <span className="font-medium text-fg">{crumb(pathname)}</span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCmd(true)}
            className="hidden h-8 w-[260px] items-center gap-2 rounded-input border border-line bg-bg-subtle px-2.5 text-meta text-fg-muted transition-colors hover:border-line-strong md:flex focus-visible:focus-ring"
          >
            <Search aria-hidden className="size-3.5" strokeWidth={1.75} />
            <span className="flex-1 text-start">{searchPlaceholder}</span>
            <Kbd>⌘K</Kbd>
          </button>
          <button type="button" aria-label="Search" onClick={() => setCmd(true)} className="inline-flex size-9 items-center justify-center rounded-input text-fg hover:bg-bg-subtle md:hidden focus-visible:focus-ring">
            <Search aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </button>
          {topActions}
        </header>
        <main id="main" className={cn("mx-auto w-full max-w-[1200px] px-4 pt-6 md:px-8 md:pt-8 print:max-w-none print:p-0", bottomTabs ? "pb-28 lg:pb-16" : "pb-16")}>
          {notice}
          {children}
        </main>
      </div>
      </div>

      {bottomTabs ? (
        <nav aria-label="Sections" className="fixed inset-x-4 bottom-4 z-sticky mx-auto flex max-w-md items-center justify-between rounded-full border border-line bg-bg p-1.5 shadow-float lg:hidden print:hidden">
          {nav.map((i) => {
            const active = isActive(pathname, i, nav);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn("inline-flex h-10 flex-1 items-center justify-center rounded-full px-2 text-meta-strong transition-colors focus-visible:focus-ring", active ? "bg-fg text-bg" : "text-fg-muted hover:text-fg")}
              >
                {i.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {drawer ? (
        <div className="fixed inset-0 z-modal lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" tabIndex={-1} className="absolute inset-0 bg-overlay" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 start-0 flex w-[280px] max-w-[85vw] flex-col bg-bg-subtle shadow-float motion-safe:animate-fade-in">
            <button type="button" aria-label="Close" onClick={() => setDrawer(false)} className="absolute end-2 top-2 z-[1] inline-flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-bg-muted">
              <X aria-hidden className="size-4" />
            </button>
            {sidebar(() => setDrawer(false))}
          </div>
        </div>
      ) : null}

      <CommandMenu open={cmd} onClose={() => setCmd(false)} pages={nav.map((n) => ({ label: n.label, href: n.href, icon: n.icon }))} search={search} placeholder={searchPlaceholder} />
    </div>
  );
}
