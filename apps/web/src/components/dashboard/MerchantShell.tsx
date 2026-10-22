"use client";
import {
  BarChart3, Blocks, CalendarClock, ClipboardList, CreditCard, Gift, Home, IdCard, Mail, Megaphone, MapPin, Settings, ShoppingBag, Store, Tag, Users, UserCog,
  Wrench, Flag, type LucideIcon, Calculator,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { authApi } from "@ll/shared";
import { AppShell, type NavItem } from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/site/Brand";
import { buildMerchantNav, canOpen } from "@/lib/dashboard/nav";
import { AccountMenu } from "./AccountMenu";
import { useMerchant } from "./MerchantContext";
import { NoAccess } from "./PageStates";

const ICONS: Record<string, LucideIcon> = {
  home: Home, counter: Calculator, customers: Users, program: Gift, promos: Megaphone, "discount-cards": IdCard, messages: Mail, reports: BarChart3,
  locations: MapPin, staff: UserCog, integrations: Blocks, billing: CreditCard, settings: Settings, orders: ShoppingBag, catalog: Tag, tickets: Wrench,
  slots: CalendarClock, ads: Flag, campaigns: ClipboardList,
};

export function MerchantShell({ me, children }: { me: authApi.MeResponse; children: ReactNode }) {
  const { base, detail, role, features, viewingAs, enabled } = useMerchant();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const entries = buildMerchantNav(base, role, new Set(features.features.filter((f) => f.enabled).map((f) => f.key)));
  const nav: NavItem[] = entries.map((e) => ({ href: e.href, label: e.label, icon: ICONS[e.key] ?? Store, bottom: e.bottom, exact: e.exact }));
  const section = pathname.slice(base.length).split("/")[1] ?? "";
  const sectionKey = section === "" ? "home" : section === "setup" ? "home" : section;
  const allowed = canOpen(role, sectionKey);
  void enabled;

  const switcher =
    me.merchants.length > 1 ? (
      <label className="mt-3 block">
        <span className="sr-only">Switch shop</span>
        <select
          value={detail.merchant.id}
          onChange={(e) => router.push(`/m/${e.target.value}`)}
          className="min-h-11 w-full rounded-sm border border-border-strong bg-surface px-2 text-label text-fg"
        >
          {me.merchants.map((m) => (
            <option key={m.merchantId} value={m.merchantId}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    ) : (
      <p className="mt-3 truncate text-label text-fg">{detail.merchant.name}</p>
    );

  return (
    <AppShell
      nav={nav}
      env={viewingAs ?? undefined}
      header={
        <div>
          <Wordmark size={28} href={null} />
          {switcher}
          <Button href={`${base}/counter`} variant="tonal" size="sm" fullWidth className="mt-3" iconStart={Calculator}>
            Open counter
          </Button>
        </div>
      }
      footer={<AccountMenu name={me.user.name} email={me.user.email} links={me.platformRole === "admin" ? [{ href: "/admin", label: "Admin" }] : me.platformRole === "rep" ? [{ href: "/rep", label: "Rep console" }] : []} />}
      mobileTitle={
        <span className="flex items-center gap-2">
          {detail.merchant.name}
          {viewingAs ? <Badge tone="danger">{viewingAs === "admin" ? "Admin" : "Rep"}</Badge> : null}
        </span>
      }
      mobileActions={
        me.merchants.length > 1 ? (
          <select aria-label="Switch shop" value={detail.merchant.id} onChange={(e) => router.push(`/m/${e.target.value}`)} className="max-w-36 rounded-sm border border-border-strong bg-surface px-2 py-1 text-caption">
            {me.merchants.map((m) => (
              <option key={m.merchantId} value={m.merchantId}>
                {m.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {viewingAs ? (
        <Banner tone="danger" className="sticky top-1 z-banner mb-4 print:hidden" action={<Button variant="ghost" size="sm" href={viewingAs === "admin" ? `/admin/merchants/${detail.merchant.id}` : `/rep/merchants/${detail.merchant.id}`}>Exit</Button>}>
          Viewing as {detail.merchant.name}. Changes are logged.
        </Banner>
      ) : null}
      {allowed ? children : <NoAccess title="This page is for owners and managers" body="Staff can use Today and the counter. Ask the owner if you need more." action={<Button href={`${base}/counter`}>Open counter</Button>} />}
    </AppShell>
  );
}
