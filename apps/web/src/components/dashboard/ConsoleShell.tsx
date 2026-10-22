"use client";
import {
  BadgeDollarSign, BarChart3, ClipboardList, Flag, Gauge, History, KanbanSquare, LayoutDashboard, MapPinned, Package, PlusCircle, Store, Users, CreditCard, type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { authApi } from "@ll/shared";
import { AppShell } from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Wordmark } from "@/components/site/Brand";
import { AccountMenu } from "./AccountMenu";

const ICONS: Record<string, LucideIcon> = {
  today: LayoutDashboard, leads: KanbanSquare, merchants: Store, new: PlusCircle, kits: Package, earnings: BadgeDollarSign,
  network: BarChart3, rollout: Gauge, plans: CreditCard, neighbourhoods: MapPinned, users: Users, ads: Flag, campaigns: ClipboardList, audit: History,
};

export type ConsoleKind = "rep" | "admin" | "bia";

const NAV: Record<ConsoleKind, { key: string; href: string; label: string; bottom?: boolean; exact?: boolean }[]> = {
  rep: [
    { key: "today", href: "/rep", label: "Today", bottom: true, exact: true },
    { key: "leads", href: "/rep/leads", label: "Leads", bottom: true },
    { key: "merchants", href: "/rep/merchants", label: "My merchants", bottom: true },
    { key: "new", href: "/rep/new", label: "New merchant", bottom: true },
    { key: "earnings", href: "/rep/earnings", label: "Earnings" },
  ],
  admin: [
    { key: "network", href: "/admin", label: "Network", bottom: true, exact: true },
    { key: "rollout", href: "/admin/rollout", label: "Rollout", bottom: true },
    { key: "merchants", href: "/admin/merchants", label: "Merchants", bottom: true },
    { key: "neighbourhoods", href: "/admin/neighbourhoods", label: "Neighbourhoods & perks" },
    { key: "users", href: "/admin/users", label: "Users & roles" },
    { key: "campaigns", href: "/admin/campaigns", label: "BIA campaigns", bottom: true },
    { key: "ads", href: "/admin/ads", label: "Ads review" },
    { key: "audit", href: "/admin/audit", label: "Audit log" },
  ],
  bia: [{ key: "campaigns", href: "/bia", label: "Campaigns", bottom: true, exact: false }],
};

/** Rep console / admin / BIA shell: dashboard shell + environment strip + role badge (system.md §7). */
export function ConsoleShell({ kind, me, children }: { kind: ConsoleKind; me: authApi.MeResponse; children: ReactNode }) {
  const nav = NAV[kind].map((n) => ({ ...n, icon: ICONS[n.key] ?? Store }));
  const badge = kind === "admin" ? <Badge tone="danger">Admin</Badge> : kind === "rep" ? <Badge tone="info">Rep</Badge> : <Badge tone="brand">BIA</Badge>;
  const links = [
    ...(me.platformRole === "admin" && kind !== "admin" ? [{ href: "/admin", label: "Admin" }] : []),
    ...(me.platformRole !== "none" && kind !== "rep" ? [{ href: "/rep", label: "Rep console" }] : []),
    ...me.merchants.slice(0, 3).map((m) => ({ href: `/m/${m.merchantId}`, label: m.name })),
  ];
  return (
    <AppShell
      env={kind === "bia" ? undefined : kind}
      nav={nav}
      header={
        <div className="flex flex-col gap-2">
          <Wordmark size={28} href={null} />
          <div>{badge}</div>
        </div>
      }
      footer={<AccountMenu name={me.user.name} email={me.user.email} links={links} />}
      mobileTitle={
        <span className="flex items-center gap-2">
          {kind === "admin" ? "Admin" : kind === "rep" ? "Rep console" : "BIA campaigns"} {badge}
        </span>
      }
    >
      {children}
    </AppShell>
  );
}
