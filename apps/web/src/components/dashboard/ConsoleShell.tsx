"use client";
import {
  BarChart3, ClipboardList, Coins, FileText, Flag, Footprints, Gauge, History, KanbanSquare, LayoutDashboard, MapPinned, Package, PlusCircle, Rocket, Store, Users, CreditCard, type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { authApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { AccountMenu } from "./AccountMenu";
import type { CommandSearch } from "./CommandMenu";
import { BiaSwitcher } from "./bia/BiaSwitcher";
import { Shell } from "./Shell";

const ICONS: Record<string, LucideIcon> = {
  today: LayoutDashboard, day: Footprints, costs: Coins, leads: KanbanSquare, merchants: Store, new: PlusCircle, kits: Package,
  network: BarChart3, rollout: Gauge, plans: CreditCard, neighbourhoods: MapPinned, users: Users, ads: Flag, campaigns: ClipboardList, audit: History,
  overview: LayoutDashboard, shops: Store, reports: FileText, onboarding: Rocket,
};

export type ConsoleKind = "rep" | "admin" | "bia";

const NAV: Record<ConsoleKind, { key: string; href: string; label: string; group: string; exact?: boolean }[]> = {
  rep: [
    { key: "today", href: "/rep", label: "Today", group: "a", exact: true },
    { key: "day", href: "/rep/day", label: "Street day", group: "a" },
    { key: "leads", href: "/rep/leads", label: "Leads", group: "a" },
    { key: "merchants", href: "/rep/merchants", label: "Shops", group: "a" },
  ],
  admin: [
    { key: "today", href: "/admin", label: "Today", group: "a", exact: true },
    { key: "neighbourhoods", href: "/admin/neighbourhoods", label: "Areas & perks", group: "a" },
    { key: "merchants", href: "/admin/merchants", label: "Merchants", group: "a" },
    { key: "costs", href: "/admin/costs", label: "Costs", group: "a" },
    { key: "onboarding", href: "/admin/onboarding", label: "Activation", group: "a" },
    { key: "rollout", href: "/admin/rollout", label: "Rollout", group: "b" },
    { key: "campaigns", href: "/admin/campaigns", label: "BIA campaigns", group: "b" },
    { key: "ads", href: "/admin/ads", label: "Ads review", group: "b" },
    { key: "users", href: "/admin/users", label: "Users & roles", group: "c" },
    { key: "audit", href: "/admin/audit", label: "Audit log", group: "c" },
  ],
  bia: [
    { key: "overview", href: "/bia", label: "Overview", group: "a", exact: true },
    { key: "campaigns", href: "/bia/campaigns", label: "Campaigns", group: "a" },
    { key: "shops", href: "/bia/shops", label: "Shops", group: "a" },
    { key: "reports", href: "/bia/reports", label: "Reports", group: "a" },
  ],
};

const TITLE: Record<ConsoleKind, string> = { rep: "Rep console", admin: "Admin", bia: "BIA" };

/** Rep console / admin / BIA shell: same calm shell as the merchant dashboard, with a role label in place of the shop switcher. */
export function ConsoleShell({ kind, me, children }: { kind: ConsoleKind; me: authApi.MeResponse; children: ReactNode }) {
  const nav = NAV[kind].map((n) => ({ ...n, icon: ICONS[n.key] ?? Store }));
  const links = [
    ...(me.platformRole === "admin" && kind !== "admin" ? [{ href: "/admin", label: "Admin" }] : []),
    ...(me.platformRole !== "none" && kind !== "rep" ? [{ href: "/rep", label: "Rep console" }] : []),
    ...(kind === "rep" ? [{ href: "/rep/signup", label: "Sign up a shop" }, { href: "/rep/new", label: "Full setup" }] : []),
    ...me.merchants.slice(0, 3).map((m) => ({ href: `/m/${m.merchantId}`, label: m.name })),
  ];
  const search = useMemo<CommandSearch | undefined>(
    () =>
      kind === "admin"
        ? { label: "Merchants", run: async (q) => (await browserApi.admin.merchants({ q, limit: 6 })).items.map((m) => ({ id: m.id, label: m.name, meta: `${m.activeMembers} active`, href: `/admin/merchants/${m.id}` })) }
        : undefined,
    [kind],
  );
  return (
    <Shell
      nav={nav}
      search={search}
      searchPlaceholder={kind === "admin" ? "Search merchants or pages" : "Jump to"}
      header={
        kind === "bia" ? (
          <BiaSwitcher />
        ) : (
        <div className="flex h-10 items-center gap-2.5 px-2">
          <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-[8px] bg-fg text-[11px] font-bold text-bg">
            LL
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{TITLE[kind]}</span>
          {/* A neutral tag: a red dot read as an error, a blue one as "your location" (polish-audit D17). */}
          <span className="inline-flex h-5 items-center rounded-full border border-line px-2 text-caption font-medium text-fg-muted">{kind === "admin" ? "admin" : "rep"}</span>
        </div>
        )
      }
      footer={<AccountMenu name={me.user.name} email={me.user.email} links={links} />}
      mobileTitle={kind === "bia" ? <BiaSwitcher compact /> : TITLE[kind]}
      bottomTabs={kind === "bia" || kind === "rep"}
    >
      {children}
    </Shell>
  );
}
