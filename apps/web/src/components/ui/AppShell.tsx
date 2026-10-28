"use client";
/**
 * The one shell for every trade and every console (v3-strategy.md 4.1): a sidebar of lowercase sections, a 56 px top bar,
 * the page, and under `md` a bottom bar. Built on the shadcn Sidebar (Base UI):
 *   lg and up   248 px sidebar
 *   md          72 px icon rail (names move to tooltips)
 *   under md    top bar + bottom nav (Today, Counter, Customers, the trade's main module, More); More opens the full sidebar as a sheet
 * In a right-to-left language the sidebar sits on the right and every logical utility mirrors with it.
 */
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { DirectionProvider } from "@/components/primitives/direction";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  useSidebar,
} from "@/components/primitives/sidebar";
import { TooltipProvider } from "@/components/primitives/tooltip";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { EnvironmentStrip } from "./Layout";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show in the < md bottom bar when `bottomNav` is not given (max 4; the last slot is "More"). */
  bottom?: boolean;
  /** Match nested routes as active (default true). */
  exact?: boolean;
  /** A count after the label: new orders in points orange, calls and chats waiting in muted text. */
  badge?: { count: number; accent?: boolean };
  /** Drawn indented under the item before it, without an icon (Staff, POS & integrations and Billing under Settings). */
  child?: boolean;
}

/** One sidebar section: a lowercase label over its rows. A section with no items is not drawn. */
export interface NavSectionDef {
  key: string;
  label?: string;
  items: NavItem[];
}

export interface AppShellProps {
  /** Flat list: one section with no label. Use `sections` for the grouped sidebar. */
  nav: NavItem[];
  sections?: NavSectionDef[];
  /** Sidebar header: the shop (or console) switcher. */
  header: ReactNode;
  /** Sidebar footer: setup progress. */
  footer?: ReactNode;
  /** Phone top bar title (shop name). */
  mobileTitle: ReactNode;
  mobileActions?: ReactNode;
  /** The 56 px bar over the page: location, search, language, help, alerts, account. */
  topBar?: ReactNode;
  /** The phone bottom bar. Defaults to the items flagged `bottom`; with five or fewer items in all, every item shows and there is no More. */
  bottomNav?: NavItem[];
  /** aria-label of the bottom bar (the merchant dashboard says "Main"; the consoles say "Sections"). */
  bottomLabel?: string;
  /** Translated words the shell draws itself. */
  labels?: { more?: string; menu?: string; main?: string; sidebar?: string };
  env?: "rep" | "admin";
  /** Shown above the page (the "Viewing as" row). */
  notice?: ReactNode;
  /** Chrome-free: no sidebar, top bar or bottom bar, just the page edge to edge (the counter, Figma 15:2). The page supplies its own way back. */
  bare?: boolean;
  children: ReactNode;
}

function matches(pathname: string, i: NavItem) {
  return i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
}
/** One row is current: when a longer entry also matches ("/classes/offers" inside "/classes"), the longer one wins. */
export function isNavActive(pathname: string, i: NavItem, all: NavItem[]) {
  if (!matches(pathname, i)) return false;
  return !all.some((o) => o !== i && o.href.length > i.href.length && matches(pathname, o));
}
/** Most specific nav entry for the current path (for the page title in a crumb). */
export function activeNavItem<T extends NavItem>(pathname: string, nav: T[]): T | undefined {
  return [...nav].sort((a, b) => b.href.length - a.href.length).find((i) => matches(pathname, i));
}

const subscribeLg = (cb: () => void) => {
  const m = window.matchMedia("(min-width: 1024px)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
/** True from lg up. The server and the first client render say true, so a desktop never flashes the rail. */
function useWide() {
  return useSyncExternalStore(subscribeLg, () => window.matchMedia("(min-width: 1024px)").matches, () => true);
}

// 32 px rows with a mouse (the spec), 44 px under a finger: on a phone sheet and on a touch tablet in rail mode.
const ROW = "h-8 text-body max-md:h-11 pointer-coarse:h-11 group-data-[collapsible=icon]:pointer-coarse:size-11! focus-visible:focus-ring focus-visible:ring-0 data-active:font-semibold";

function Rows({ nav, all, pathname }: { nav: NavItem[]; all: NavItem[]; pathname: string }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);
  const out: ReactNode[] = [];
  nav.forEach((i, idx) => {
    if (i.child) return; // drawn under its parent
    const active = isNavActive(pathname, i, all);
    const kids: NavItem[] = [];
    for (let j = idx + 1; j < nav.length && nav[j]!.child; j++) kids.push(nav[j]!);
    out.push(
      <SidebarMenuItem key={i.href}>
        <SidebarMenuButton
          tooltip={i.label}
          isActive={active}
          className={ROW}
          render={<Link href={i.href} onClick={close} aria-current={active ? "page" : undefined} />}
        >
          <i.icon aria-hidden strokeWidth={1.75} className={cn(active ? "text-sidebar-foreground" : "text-muted-foreground")} />
          <span>{i.label}</span>
        </SidebarMenuButton>
        {i.badge && i.badge.count > 0 ? (
          <SidebarMenuBadge className={cn("text-meta-strong", i.badge.accent ? "text-points-text" : "text-muted-foreground")}>{i.badge.count}</SidebarMenuBadge>
        ) : null}
        {kids.length ? (
          <SidebarMenuSub>
            {kids.map((k) => {
              const kActive = isNavActive(pathname, k, all);
              return (
                <SidebarMenuSubItem key={k.href}>
                  <SidebarMenuSubButton isActive={kActive} className="h-8 text-body max-md:h-11 pointer-coarse:h-11 focus-visible:focus-ring focus-visible:ring-0 data-active:font-semibold" render={<Link href={k.href} onClick={close} aria-current={kActive ? "page" : undefined} />}>
                    <span>{k.label}</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        ) : null}
      </SidebarMenuItem>,
    );
  });
  return <SidebarMenu>{out}</SidebarMenu>;
}

/** Up and Down move between the sidebar's links (Home and End jump to the first and last); Tab still walks them all. */
function arrowKeys(e: React.KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const links = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>("a[href]")];
  const at = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (at < 0) return;
  e.preventDefault();
  const next = e.key === "Home" ? 0 : e.key === "End" ? links.length - 1 : Math.min(links.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)));
  links[next]?.focus();
}

function SidebarBody({ sections, header, footer, pathname, label, sidebarLabel }: { sections: NavSectionDef[]; header: ReactNode; footer?: ReactNode; pathname: string; label: string; sidebarLabel: string }) {
  const ref = useRef<HTMLElement>(null);
  const all = sections.flatMap((x) => x.items);
  // A long nav scrolls inside the sidebar; keep the current page's row in view instead of half cut off at the bottom.
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname]);
  return (
    <div role="complementary" aria-label={sidebarLabel} className="flex size-full min-h-0 flex-col">
      <SidebarHeader className="px-3 pt-3 group-data-[collapsible=icon]:px-2">{header}</SidebarHeader>
      <SidebarContent className="px-1">
        <nav ref={ref} aria-label={label} className="flex flex-col" onKeyDown={arrowKeys}>
          {sections
            .filter((s) => s.items.length > 0)
            .map((s) => (
              <SidebarGroup key={s.key} className="py-1.5">
                {s.label ? (
                  <SidebarGroupLabel className="h-6 text-meta-strong font-normal text-muted-foreground group-data-[collapsible=icon]:hidden">{s.label}</SidebarGroupLabel>
                ) : null}
                <Rows nav={s.items} all={all} pathname={pathname} />
              </SidebarGroup>
            ))}
        </nav>
      </SidebarContent>
      {footer ? <SidebarFooter className="gap-3 px-4 pb-4 group-data-[collapsible=icon]:hidden">{footer}</SidebarFooter> : null}
    </div>
  );
}

function BottomBar({ items, hasMore, label, moreLabel, pathname }: { items: NavItem[]; hasMore: boolean; label: string; moreLabel: string; pathname: string }) {
  const { setOpenMobile } = useSidebar();
  const cell = "flex min-h-11 flex-col items-center justify-center gap-0.5 text-caption focus-visible:focus-ring";
  return (
    <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-raised flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
      {items.map((i) => {
        const active = isNavActive(pathname, i, items);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn(cell, "h-14 min-w-0 flex-1 px-1", active ? "font-semibold text-foreground" : "text-muted-foreground")}>
            <i.icon aria-hidden className="size-6" strokeWidth={1.75} />
            <span className="max-w-full truncate">{i.label}</span>
          </Link>
        );
      })}
      {hasMore ? (
        <button type="button" onClick={() => setOpenMobile(true)} className={cn(cell, "h-14 min-w-0 flex-1 px-1 text-muted-foreground")}>
          <MoreHorizontal aria-hidden className="size-6" strokeWidth={1.75} />
          <span>{moreLabel}</span>
        </button>
      ) : null}
    </nav>
  );
}

export function AppShell({ nav, sections, header, footer, mobileTitle, mobileActions, topBar, bottomNav, bottomLabel = "Main", labels, env, notice, bare = false, children }: AppShellProps) {
  const pathname = usePathname() ?? "";
  const { dir } = useLocaleOrEnglish();
  const wide = useWide();
  const secs: NavSectionDef[] = sections ?? [{ key: "main", items: nav }];
  const all = secs.flatMap((s) => s.items);
  const bottomItems = bottomNav ?? all.filter((n) => n.bottom).slice(0, 4);
  const fits = !bottomNav && all.length <= 5;
  const bar = fits ? all : (bottomItems.length ? bottomItems : all.filter((i) => !i.child)).slice(0, 4);

  if (bare)
    return (
      <DirectionProvider direction={dir}>
        <TooltipProvider>
          <div data-shell="bare" className="min-h-dvh bg-background text-foreground">
            {env ? <div className="fixed inset-x-0 top-0 z-banner print:hidden"><EnvironmentStrip env={env} /></div> : null}
            {notice ? <div className="px-4 pt-4">{notice}</div> : null}
            <main id="main" className="min-h-dvh w-full">
              {children}
            </main>
          </div>
        </TooltipProvider>
      </DirectionProvider>
    );

  return (
    <DirectionProvider direction={dir}>
      <TooltipProvider>
        <SidebarProvider
          open={wide}
          onOpenChange={() => undefined}
          style={{ "--sidebar-width": "248px", "--sidebar-width-icon": "72px" } as React.CSSProperties}
          className="min-h-dvh bg-background text-foreground print:block print:min-h-0 print:[&_[data-slot=sidebar]]:hidden"
        >
          {env ? <div className="fixed inset-x-0 top-0 z-banner print:hidden"><EnvironmentStrip env={env} /></div> : null}
          <Sidebar side={dir === "rtl" ? "right" : "left"} collapsible="icon" dir={dir} className="print:hidden">
            <SidebarBody sections={secs} header={header} footer={footer} pathname={pathname} label={labels?.main ?? "Main"} sidebarLabel={labels?.sidebar ?? "Sidebar"} />
          </Sidebar>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-raised flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4 md:px-6 print:hidden">
              {/* Phone: the shop and its actions. md and up: the top bar slot. */}
              <div className="min-w-0 flex-1 truncate text-headline md:hidden">{mobileTitle}</div>
              {mobileActions ? <div className="flex items-center gap-1 md:hidden">{mobileActions}</div> : null}
              <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">{topBar}</div>
            </header>
            <main id="main" className={cn("mx-auto w-full max-w-300 flex-1 px-4 pt-6 md:px-8 md:pt-8 print:max-w-none print:p-0", bar.length ? "pb-24 md:pb-16" : "pb-16")}>
              {notice}
              {children}
            </main>
          </div>
          {bar.length ? <BottomBar items={bar} hasMore={!fits} label={bottomLabel} moreLabel={labels?.more ?? "More"} pathname={pathname} /> : null}
        </SidebarProvider>
      </TooltipProvider>
    </DirectionProvider>
  );
}
