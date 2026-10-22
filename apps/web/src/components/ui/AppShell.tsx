"use client";
import { Menu, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EnvironmentStrip } from "./Layout";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show in the < md bottom bar (max 4; the 5th slot is "More"). */
  bottom?: boolean;
  /** Match nested routes as active (default true). */
  exact?: boolean;
}

export interface AppShellProps {
  nav: NavItem[];
  /** Sidebar header: wordmark + merchant/location switchers. */
  header: ReactNode;
  /** Sidebar footer: help, account menu. */
  footer?: ReactNode;
  /** Mobile top bar title (merchant name). */
  mobileTitle: ReactNode;
  mobileActions?: ReactNode;
  env?: "rep" | "admin";
  children: ReactNode;
}

/**
 * Dashboard / rep console / admin shell (system.md §7, merchant-dashboard.md "Shell"):
 * lg+ 248px sidebar, md 72px rail, < md top bar + bottom nav with "More" sheet.
 */
export function AppShell({ nav, header, footer, mobileTitle, mobileActions, env, children }: AppShellProps) {
  const pathname = usePathname() ?? "";
  const [more, setMore] = useState(false);
  const isActive = (i: NavItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`));
  const bottom = nav.filter((n) => n.bottom).slice(0, 4);

  const link = (i: NavItem, rail = false) => {
    const active = isActive(i);
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={active ? "page" : undefined}
        title={rail ? i.label : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-md px-3 text-label transition-colors focus-visible:focus-ring",
          active ? "bg-brand-subtle text-on-brand-subtle" : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
          rail && "lg:justify-start justify-center",
        )}
      >
        <i.icon aria-hidden className="size-5 shrink-0" />
        <span className={cn(rail && "hidden lg:inline")}>{i.label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-dvh bg-canvas">
      {env ? <div className="sticky top-0 z-banner"><EnvironmentStrip env={env} /></div> : null}
      <div className="flex">
        <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col gap-4 overflow-y-auto border-e border-border bg-canvas-subtle p-3 md:flex lg:w-[248px]">
          <div className="hidden lg:block">{header}</div>
          <nav aria-label="Main" className="flex flex-col gap-1">
            {nav.map((i) => link(i, true))}
          </nav>
          {footer ? <div className="mt-auto hidden lg:block">{footer}</div> : null}
        </aside>
        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-sticky flex h-14 items-center justify-between gap-3 border-b border-border bg-canvas px-4 md:hidden">
            <div className="min-w-0 truncate text-title text-fg">{mobileTitle}</div>
            {mobileActions}
          </div>
          <main id="main" className="mx-auto w-full max-w-[1200px] px-4 py-6 pb-24 md:px-6 md:pb-10">
            {children}
          </main>
        </div>
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-sticky grid h-14 grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {bottom.map((i) => (
          <Link key={i.href} href={i.href} aria-current={isActive(i) ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-0.5 text-caption", isActive(i) ? "text-fg-brand" : "text-fg-muted")}>
            <i.icon aria-hidden className="size-6" />
            {i.label}
          </Link>
        ))}
        <button type="button" onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-0.5 text-caption text-fg-muted">
          <Menu aria-hidden className="size-6" />
          More
        </button>
      </nav>
      {more ? (
        <div className="fixed inset-0 z-modal md:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-overlay" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-xl bg-surface-raised p-4 shadow-lg motion-safe:animate-sheet-up">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-h3">More</span>
              <button type="button" aria-label="Close" onClick={() => setMore(false)} className="inline-flex size-12 items-center justify-center rounded-full hover:bg-surface-sunken">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <nav aria-label="More" className="flex flex-col gap-1" onClick={() => setMore(false)}>
              {nav.map((i) => link(i))}
            </nav>
            {footer ? <div className="mt-4 border-t border-border pt-4">{footer}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
