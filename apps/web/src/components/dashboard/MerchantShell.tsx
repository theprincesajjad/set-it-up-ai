"use client";
import {
  BarChart3, Blocks, CalendarClock, CalendarDays, Tags, ChevronsUpDown, ClipboardList, CreditCard, Gift, Home, IdCard, Mail, Megaphone, MapPin, Settings, ShoppingBag, Store, Tag, Users, UserCog,
  Wrench, Beef, Newspaper, Repeat, Flag, UtensilsCrossed, Clock, Truck, PartyPopper, Building2, ChefHat, MessageCircle, Star, Sparkles, Phone, Plus, PawPrint, Dog, Bone, Car, Droplets, Disc3, BellRing, type LucideIcon, Calculator, Check, Ticket, ScanLine,
} from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { authApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { NAV_GROUP_LABELS, buildMerchantNav, canOpen } from "@/lib/dashboard/nav";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
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
  slots: CalendarClock, ads: Flag, campaigns: ClipboardList, calendar: CalendarDays, services: Tags,
  classes: CalendarDays, "class-offers": Ticket, "class-door": ScanLine,
  "grocery-butcher": Beef, "grocery-flyer": Newspaper, "grocery-whatsapp": MessageCircle, "grocery-pantry": Repeat,
  pets: PawPrint, "groom-rebooking": Repeat, daycare: Dog, "food-cards": Bone,
  wash: Droplets, vehicles: Car, "service-reminders": BellRing, "tire-season": Disc3,
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
  const ob = useApi((role === "owner" || role === "manager") ? () => api.onboarding() : null, [api, role, pathname]);
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

/**
 * Shown to an admin or rep inside a shop that is not theirs. Reading is always open; changing anything needs a
 * support session, which is one click with a reason (30 minutes, every change audited).
 */
function SupportBanner({ viewingAs }: { viewingAs: "admin" | "rep" }) {
  const { detail, merchantId } = useMerchant();
  const router = useRouter();
  const current = useApi(() => browserApi.support.current(merchantId), [merchantId]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const session = current.data?.session ?? null;
  const exit = viewingAs === "admin" ? `/admin/merchants/${detail.merchant.id}` : `/rep/merchants/${detail.merchant.id}`;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setReason("");
      await current.reload();
      router.refresh();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="status" data-testid="support-banner" className="mb-6 flex flex-col gap-2 rounded-input border border-line bg-bg-subtle px-4 py-2 text-meta print:hidden">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${session ? "bg-positive" : "bg-negative"}`} />
          <span className="truncate">
            {session ? `Support session open until ${new Date(session.expiresAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}. Changes are logged.` : `Viewing ${detail.merchant.name} as ${viewingAs}. You can look around; to change anything, start a support session.`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {session ? (
            <button type="button" disabled={busy} onClick={() => run(() => browserApi.support.end(session.id))} className="font-medium text-fg hover:underline">End session</button>
          ) : null}
          <Link href={exit} className="font-medium text-fg hover:underline">Exit</Link>
        </span>
      </div>
      {!session && !current.loading ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 5) void run(() => browserApi.support.start(merchantId, reason.trim()));
          }}
        >
          <input aria-label="Reason (audit log)" placeholder="Reason, e.g. fix opening hours for the owner" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="h-8 min-w-0 flex-1 rounded-input border border-line bg-bg px-3 text-meta" />
          <Button size="sm" type="submit" loading={busy} disabled={reason.trim().length < 5}>Start support session</Button>
        </form>
      ) : null}
      {err ? <p role="alert" className="text-negative">{err}</p> : null}
    </div>
  );
}

export function MerchantShell({ me, children }: { me: authApi.MeResponse; children: ReactNode }) {
  const { base, detail, role, features, viewingAs, api } = useMerchant();
  const pathname = usePathname() ?? "";
  const entries = buildMerchantNav(base, role, new Set(features.features.filter((f) => f.enabled).map((f) => f.key)), {
    vertical: detail.merchant.vertical,
    plan: features.plan,
    stages: Object.fromEntries(features.features.map((f) => [f.key, f.stage])),
    onOpenStreet: !!detail.merchant.neighbourhoodId,
  });
  // Restaurants: counts after Orders, Phone orders and WhatsApp (new orders in accent; the others are waiting on someone, so muted).
  const isRestaurant = entries.some((e) => e.badge);
  const badges = useApi(isRestaurant ? () => api.restaurantBadges() : null, [api, isRestaurant], { pollMs: 30_000 });
  const badgeFor = (b: (typeof entries)[number]["badge"]) => (b && badges.data ? { count: badges.data[b], accent: b === "orders" } : undefined);
  const nav: ShellNavItem[] = entries.map((e) => ({ href: e.href, label: e.label, icon: ICONS[e.key] ?? Store, group: e.group, groupLabel: NAV_GROUP_LABELS[e.group], exact: e.exact, badge: badgeFor(e.badge) }));
  const section = pathname.slice(base.length).split("/")[1] ?? "";
  const sectionKey = section === "" ? "home" : section === "setup" ? "home" : section;
  const allowed = canOpen(role, sectionKey);

  const search = useMemo<CommandSearch | undefined>(
    () =>
      role === "staff" || role === "instructor"
        ? undefined
        : {
            label: "Customers",
            run: async (q) => (await api.customers({ q, limit: 6 })).items.map((c) => ({ id: c.memberId, label: c.name ?? "No name", meta: c.phone ? c.phone.replace(/\*/g, "•") : undefined, href: `${base}/customers?member=${c.memberId}` })),
          },
    [api, base, role],
  );

  // Settings lives in the account menu so the sidebar stays at the sections a café uses every week.
  const links = [
    ...(role === "owner" || role === "manager" ? [{ href: `${base}/settings`, label: "Settings", icon: <Settings aria-hidden className="size-4" strokeWidth={1.75} /> }] : []),
    ...(me.platformRole === "admin" ? [{ href: "/admin", label: "Admin" }] : me.platformRole === "rep" ? [{ href: "/rep", label: "Rep console" }] : []),
  ];

  return (
    <Shell
      nav={nav}
      search={search}
      searchPlaceholder={role === "staff" || role === "instructor" ? "Jump to" : "Search customers or pages"}
      header={
        <div>
          <Switcher me={me} />
          <SetupProgress />
        </div>
      }
      footer={<AccountMenu name={me.user.name} email={me.user.email} links={links} />}
      mobileTitle={detail.merchant.name}
      notice={
        viewingAs ? <SupportBanner viewingAs={viewingAs} /> : null
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

