"use client";
import {
  BarChart3, Blocks, CalendarClock, ChevronsUpDown, ClipboardList, CreditCard, Gift, Home, IdCard, Mail, Megaphone, MapPin, Settings, ShoppingBag, Store, Tag, Users, UserCog,
  Wrench, Flag, UtensilsCrossed, Clock, Truck, PartyPopper, Building2, ChefHat, MessageCircle, Star, Sparkles, Phone, Plus, type LucideIcon, Calculator, Check,
} from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { authApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { NAV_GROUP_LABELS, buildMerchantNav, canOpen } from "@/lib/dashboard/nav";
import { useApi } from "@/lib/dashboard/useApi";
import { AccountMenu } from "./AccountMenu";
import type { CommandSearch } from "./CommandMenu";
import { useMerchant } from "./MerchantContext";
import { NoAccess } from "./PageStates";
import { Shell, type ShellNavItem } from "./Shell";
import { ShopMark } from "./ShopMark";

const ICONS: Record<string, LucideIcon> = {
  home: Home, counter: Calculator, customers: Users, program: Gift, promos: Megaphone, "discount-cards": IdCard, messages: Mail, reports: BarChart3,
  locations: MapPin, staff: UserCog, integrations: Blocks, billing: CreditCard, settings: Settings, orders: ShoppingBag, catalog: Tag, tickets: Wrench,
  "restaurant-menu": UtensilsCrossed, "restaurant-preorders": Clock, "restaurant-tiffin": Truck, "restaurant-catering": PartyPopper, "restaurant-banquet": Building2,
  "restaurant-kitchen": ChefHat, "restaurant-whatsapp": MessageCircle, "restaurant-reviews": Star, "restaurant-festivals": Sparkles, "restaurant-phone-orders": Phone, "restaurant-more": Plus,
  slots: CalendarClock, ads: Flag, campaigns: ClipboardList,
};

/** Merchant switcher (avatar + name) with a small popover listing the owner's other shops. */
function Switcher({ me }: { me: authApi.MeResponse }) {
  const { detail } = useMerchant();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const m = detail.merchant;
  const many = me.merchants.length > 1;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const inner = (
    <>
      <ShopMark name={m.name} brandColor={m.brandColor} logoUrl={m.logoUrl} size={28} />
      <span className="min-w-0 flex-1 text-start">
        <span className="block truncate text-[14px] font-semibold leading-5 text-fg">{m.name}</span>
      </span>
      {many ? <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-fg-muted" /> : null}
    </>
  );
  if (!many) return <div className="flex h-10 items-center gap-2.5 px-2">{inner}</div>;
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Switch shop (current: ${m.name})`} onClick={() => setOpen((v) => !v)} className="flex h-10 w-full items-center gap-2.5 rounded-[8px] px-2 hover:bg-bg-muted/60 focus-visible:focus-ring">
        {inner}
      </button>
      {open ? (
        <div role="menu" className="absolute inset-x-0 top-11 z-popover rounded-input border border-line bg-bg p-1 shadow-float">
          {me.merchants.map((x) => (
            <button
              key={x.merchantId}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push(`/m/${x.merchantId}`);
              }}
              className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-start text-meta text-fg hover:bg-bg-subtle"
            >
              <ShopMark name={x.name} size={20} />
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              {x.merchantId === m.id ? <Check aria-hidden className="size-3.5" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** "Complete your setup  5 / 6" with a 3 px bar, until the checklist is done (canvas Dashboard sidebar). */
function SetupProgress() {
  const { api, base, role } = useMerchant();
  const pathname = usePathname();
  const ob = useApi(role !== "staff" ? () => api.onboarding() : null, [api, role, pathname]);
  const steps = ob.data?.steps ?? [];
  const done = steps.filter((x) => x.done).length;
  if (!ob.data || steps.length === 0 || done >= steps.length) return null;
  return (
    <Link href={`${base}/setup`} aria-label={`Complete your setup, ${done} of ${steps.length} done`} className="block rounded-[8px] px-1.5 pb-0.5 pt-2.5 hover:bg-bg-muted/60 focus-visible:focus-ring">
      <span className="flex justify-between text-[12px] leading-4 text-fg-muted">
        <span>Complete your setup</span>
        <span className="tabular">
          {done} / {steps.length}
        </span>
      </span>
      <span aria-hidden className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-[#E0E0DE] dark:bg-bg-muted">
        <span className="block h-[3px] rounded-full bg-fg" style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
      </span>
    </Link>
  );
}

export function MerchantShell({ me, children }: { me: authApi.MeResponse; children: ReactNode }) {
  const { base, detail, role, features, viewingAs, api } = useMerchant();
  const pathname = usePathname() ?? "";
  const entries = buildMerchantNav(base, role, new Set(features.features.filter((f) => f.enabled).map((f) => f.key)));
  const nav: ShellNavItem[] = entries.map((e) => ({ href: e.href, label: e.label, icon: ICONS[e.key] ?? Store, group: e.group, groupLabel: NAV_GROUP_LABELS[e.group], exact: e.exact }));
  const section = pathname.slice(base.length).split("/")[1] ?? "";
  const sectionKey = section === "" ? "home" : section === "setup" ? "home" : section;
  const allowed = canOpen(role, sectionKey);

  const search = useMemo<CommandSearch | undefined>(
    () =>
      role === "staff"
        ? undefined
        : {
            label: "Customers",
            run: async (q) => (await api.customers({ q, limit: 6 })).items.map((c) => ({ id: c.memberId, label: c.name ?? "No name", meta: c.phone ? c.phone.replace(/\*/g, "•") : undefined, href: `${base}/customers?member=${c.memberId}` })),
          },
    [api, base, role],
  );

  const links = me.platformRole === "admin" ? [{ href: "/admin", label: "Admin" }] : me.platformRole === "rep" ? [{ href: "/rep", label: "Rep console" }] : [];

  return (
    <Shell
      nav={nav}
      search={search}
      searchPlaceholder={role === "staff" ? "Jump to" : "Search customers or pages"}
      header={
        <div>
          <Switcher me={me} />
          <SetupProgress />
        </div>
      }
      footer={<AccountMenu name={me.user.name} email={me.user.email} links={links} />}
      mobileTitle={detail.merchant.name}
      notice={
        viewingAs ? (
          <div role="status" className="mb-6 flex items-center justify-between gap-3 rounded-input border border-line bg-bg-subtle px-4 py-2 text-meta print:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-negative" />
              <span className="truncate">
                Viewing as {detail.merchant.name} ({viewingAs === "admin" ? "admin" : "rep"}). Changes are logged.
              </span>
            </span>
            <Link href={viewingAs === "admin" ? `/admin/merchants/${detail.merchant.id}` : `/rep/merchants/${detail.merchant.id}`} className="shrink-0 font-medium text-fg hover:underline">
              Exit
            </Link>
          </div>
        ) : null
      }
    >
      {allowed ? (
        children
      ) : (
        <NoAccess title="This page is for owners and managers" body="Staff can use Today and the counter. Ask the owner if you need more." action={<Button href={`${base}/counter`}>Open counter</Button>} />
      )}
    </Shell>
  );
}

