"use client";
/**
 * Dashboard shell (v3-strategy.md 4.1): the shared AppShell (sidebar sections, rail at md, bottom bar under md) plus the top bar
 * (location, search with Ctrl K, language, help, alerts, account) and the command menu. Used by the merchant dashboard, the rep
 * console, admin and the BIA tools. Callers hand over translated labels; the shell draws and wires.
 */
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell, type NavItem, type NavSectionDef } from "@/components/ui/AppShell";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { CommandMenu, type CommandSearch } from "./CommandMenu";
import { HelpLink, LanguageMenu, SearchField, SearchIconButton } from "./TopBar";

export type ShellNavItem = NavItem & { icon: LucideIcon };
export interface ShellSection {
  key: string;
  /** Lowercase section label, already translated. */
  label?: string;
  items: ShellNavItem[];
}

export interface ShellProps {
  sections: ShellSection[];
  header: ReactNode;
  footer?: ReactNode;
  /** Shown above the page (e.g. "Viewing as" row). */
  notice?: ReactNode;
  /** The phone top bar's left side (the shop, or the console name). */
  mobileTitle: ReactNode;
  /** Top bar, left: where the shop is. */
  location?: ReactNode;
  /** Top bar, right, after help: the bell. */
  alerts?: ReactNode;
  /** Top bar, far right: the account menu. */
  account: ReactNode;
  search?: CommandSearch;
  searchPlaceholder?: string;
  /** Phone bottom bar; defaults to the items flagged `bottom`, or every item when there are five or fewer. */
  bottomNav?: ShellNavItem[];
  bottomLabel?: string;
  env?: "rep" | "admin";
  children: ReactNode;
}

export function Shell({ sections, header, footer, notice, mobileTitle, location, alerts, account, search, searchPlaceholder, bottomNav, bottomLabel, env, children }: ShellProps) {
  const { t } = useLocaleOrEnglish();
  const [cmd, setCmd] = useState(false);
  const placeholder = searchPlaceholder ?? t("shell.search.placeholder");

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

  const pages = useMemo(() => sections.flatMap((s) => s.items).filter((i) => !i.child).map((n) => ({ label: n.label, href: n.href, icon: n.icon })), [sections]);
  const defs: NavSectionDef[] = sections;

  return (
    <>
      <AppShell
        nav={sections.flatMap((s) => s.items)}
        sections={defs}
        header={header}
        footer={
          <>
            {footer}
            {/* The top bar's language, help and account do not fit on a phone: they sit at the foot of the menu sheet. */}
            <div className="flex items-center gap-1 border-t border-border pt-3 md:hidden">
              <LanguageMenu />
              <HelpLink label={t("shell.help")} />
              <span className="ms-auto">{account}</span>
            </div>
          </>
        }
        notice={notice}
        env={env}
        bottomNav={bottomNav}
        bottomLabel={bottomLabel}
        labels={{ more: t("shell.more"), main: t("shell.nav.label"), sidebar: t("shell.sidebar") }}
        mobileTitle={mobileTitle}
        mobileActions={
          <>
            <SearchIconButton onOpen={() => setCmd(true)} label={t("shell.search.label")} />
            {alerts}
          </>
        }
        topBar={
          <>
            {location}
            <SearchField onOpen={() => setCmd(true)} placeholder={placeholder} />
            <div className="ms-auto flex items-center gap-1">
              <LanguageMenu />
              <HelpLink label={t("shell.help")} />
              {alerts}
              {account}
            </div>
          </>
        }
      >
        {children}
      </AppShell>
      <CommandMenu open={cmd} onClose={() => setCmd(false)} pages={pages} search={search} placeholder={placeholder} />
    </>
  );
}

