"use client";
import {
  BarChart3, ClipboardList, MessageCircle, Coins, FileText, Flag, Footprints, Gauge, History, KanbanSquare, LayoutDashboard, MapPinned, Package, PlusCircle, Rocket, Store, Users, CreditCard, type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { authApi, MessageKey } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { AccountMenu } from "./AccountMenu";
import type { CommandSearch } from "./CommandMenu";
import { BiaSwitcher } from "./bia/BiaSwitcher";
import { Shell } from "./Shell";

const ICONS: Record<string, LucideIcon> = {
  today: LayoutDashboard, day: Footprints, costs: Coins, leads: KanbanSquare, merchants: Store, new: PlusCircle, kits: Package,
  network: BarChart3, rollout: Gauge, plans: CreditCard, neighbourhoods: MapPinned, users: Users, ads: Flag, campaigns: ClipboardList, audit: History,
  overview: LayoutDashboard, shops: Store, reports: FileText, onboarding: Rocket, salesAgent: MessageCircle,
};

export type ConsoleKind = "rep" | "admin" | "bia";

interface ConsoleItem {
  key: string;
  href: string;
  label: MessageKey;
  exact?: boolean;
}
interface ConsoleSection {
  key: string;
  label: MessageKey;
  items: ConsoleItem[];
}

/**
 * The same five-zone sidebar as the merchant dashboard: `today` first, then the console's own sections where a shop has `run`,
 * `customers` and `grow`. Rows are the pages each console already had.
 */
const NAV: Record<ConsoleKind, ConsoleSection[]> = {
  rep: [
    { key: "today", label: "shell.section.today", items: [{ key: "today", href: "/rep", label: "shell.console.today", exact: true }] },
    { key: "field", label: "shell.console.section.field", items: [{ key: "day", href: "/rep/day", label: "shell.console.day" }, { key: "leads", href: "/rep/leads", label: "shell.console.leads" }] },
    { key: "shops", label: "shell.console.section.shops", items: [{ key: "merchants", href: "/rep/merchants", label: "shell.console.shops" }] },
  ],
  admin: [
    { key: "today", label: "shell.section.today", items: [{ key: "today", href: "/admin", label: "shell.console.today", exact: true }] },
    {
      key: "network",
      label: "shell.console.section.network",
      items: [
        { key: "neighbourhoods", href: "/admin/neighbourhoods", label: "shell.console.areas" },
        { key: "merchants", href: "/admin/merchants", label: "shell.console.merchants" },
        { key: "onboarding", href: "/admin/onboarding", label: "shell.console.activation" },
        { key: "costs", href: "/admin/costs", label: "shell.console.costs" },
      ],
    },
    {
      key: "grow",
      label: "shell.section.grow",
      items: [
        { key: "rollout", href: "/admin/rollout", label: "shell.console.rollout" },
        { key: "campaigns", href: "/admin/campaigns", label: "shell.console.biaCampaigns" },
        { key: "ads", href: "/admin/ads", label: "shell.console.adsReview" },
        { key: "salesAgent", href: "/admin/sales-agent", label: "shell.console.salesAgent" },
        { key: "siteDomains", href: "/admin/site-domains", label: "shell.console.siteDomains" },
      ],
    },
    {
      key: "platform",
      label: "shell.console.section.platform",
      items: [
        { key: "users", href: "/admin/users", label: "shell.console.users" },
        { key: "audit", href: "/admin/audit", label: "shell.console.audit" },
      ],
    },
  ],
  bia: [
    { key: "today", label: "shell.section.today", items: [{ key: "overview", href: "/bia", label: "shell.console.overview", exact: true }] },
    {
      key: "street",
      label: "shell.console.section.street",
      items: [
        { key: "campaigns", href: "/bia/campaigns", label: "shell.console.campaigns" },
        { key: "shops", href: "/bia/shops", label: "shell.console.shops" },
        { key: "reports", href: "/bia/reports", label: "shell.console.reports" },
      ],
    },
  ],
};

const TITLE: Record<ConsoleKind, MessageKey> = { rep: "shell.console.rep", admin: "shell.console.admin", bia: "shell.console.bia" };

/** Rep console / admin / BIA shell: the merchant dashboard's shell with a console name in place of the shop switcher. */
export function ConsoleShell({ kind, me, children }: { kind: ConsoleKind; me: authApi.MeResponse; children: ReactNode }) {
  const { t } = useLocaleOrEnglish();
  const sections = NAV[kind].map((s) => ({
    key: s.key,
    label: t(s.label),
    items: s.items.map((n) => ({ href: n.href, label: t(n.label), exact: n.exact, icon: ICONS[n.key] ?? Store })),
  }));
  const links = [
    ...(me.platformRole === "admin" && kind !== "admin" ? [{ href: "/admin", label: t("shell.console.admin") }] : []),
    ...(me.platformRole !== "none" && kind !== "rep" ? [{ href: "/rep", label: t("shell.console.rep") }] : []),
    ...(kind === "rep" ? [{ href: "/rep/signup", label: t("shell.console.signupShop") }, { href: "/rep/new", label: t("shell.console.fullSetup") }] : []),
    ...me.merchants.slice(0, 3).map((m) => ({ href: `/m/${m.merchantId}`, label: m.name })),
  ];
  const search = useMemo<CommandSearch | undefined>(
    () =>
      kind === "admin"
        ? { label: t("shell.console.merchants"), run: async (q) => (await browserApi.admin.merchants({ q, limit: 6 })).items.map((m) => ({ id: m.id, label: m.name, meta: `${m.activeMembers} active`, href: `/admin/merchants/${m.id}` })) }
        : undefined,
    [kind, t],
  );
  const header =
    kind === "bia" ? (
      <BiaSwitcher />
    ) : (
      <div className="flex min-h-11 items-center gap-2.5 px-1 group-data-[collapsible=icon]:justify-center">
        <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-bold text-primary-foreground">
          LL
        </span>
        <span className="min-w-0 flex-1 truncate text-headline text-foreground group-data-[collapsible=icon]:hidden">{t(TITLE[kind])}</span>
        {/* A neutral tag: a red dot read as an error, a blue one as "your location" (polish-audit D17). */}
        <span className="inline-flex h-5 items-center rounded-full border border-border px-2 text-caption font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">{kind === "admin" ? t("shell.console.tagAdmin") : t("shell.console.tagRep")}</span>
      </div>
    );
  return (
    <Shell
      sections={sections}
      env={kind === "admin" ? "admin" : kind === "rep" ? "rep" : undefined}
      search={search}
      searchPlaceholder={kind === "admin" ? t("shell.search.admin") : t("shell.search.jump")}
      header={header}
      account={<AccountMenu name={me.user.name} email={me.user.email} links={links} />}
      mobileTitle={kind === "bia" ? <BiaSwitcher compact /> : t(TITLE[kind])}
      bottomLabel={kind === "bia" || kind === "rep" ? "Sections" : undefined}
    >
      {children}
    </Shell>
  );
}
