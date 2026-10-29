"use client";
import {
  BarChart3, Blocks, CalendarClock, CalendarDays, Tags, ChevronsUpDown, CreditCard, Gift, Home, IdCard, Mail, Megaphone, Map as MapIcon, QrCode, SlidersHorizontal, ShoppingBag, Store, Tag, Users, UserCog,
  Wrench, Beef, Newspaper, Repeat, Flag, UtensilsCrossed, Clock, Truck, PartyPopper, Building2, ChefHat, MessageCircle, Star, Sparkles, Phone, Plus, PawPrint, Dog, Bone, Car, Droplets, Disc3, BellRing, type LucideIcon, Calculator, Check, Ticket, ScanLine, ListOrdered, Wallet, FileText, Pill,
} from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { authApi } from "@ll/shared";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/primitives/dropdown-menu";
import { Button } from "@/components/ui/Button";
import { buildMerchantNav, canOpen, isBareRoute, navSections } from "@/lib/dashboard/nav";
import { navLabel } from "@/lib/dashboard/navLabels";
import { placeLabel } from "@/lib/dashboard/today";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useSoloCalendar } from "@/lib/dashboard/useSoloCalendar";
import { AccountMenu } from "./AccountMenu";
import type { CommandSearch } from "./CommandMenu";
import { useMerchant } from "./MerchantContext";
import { NoAccess } from "./PageStates";
import { Shell, type ShellNavItem } from "./Shell";
import { ShopMark } from "./ShopMark";
import { useThemeStyle } from "@/components/ui/ThemeStyle";
import { AlertsLink, LocationChip } from "./TopBar";

const ICONS: Record<string, LucideIcon> = {
  inbox: MessageCircle, // phase-solo D
  home: Home, counter: Calculator, customers: Users, program: Gift, promos: Megaphone, "discount-cards": IdCard, messages: Mail, reports: BarChart3,
  locations: QrCode, staff: UserCog, integrations: Blocks, billing: CreditCard, settings: SlidersHorizontal, orders: ShoppingBag, catalog: Tag, tickets: Wrench,
  "restaurant-menu": UtensilsCrossed, "restaurant-preorders": Clock, "restaurant-tiffin": Truck, "restaurant-catering": PartyPopper, "restaurant-banquet": Building2,
  "restaurant-kitchen": ChefHat, "restaurant-whatsapp": MessageCircle, "restaurant-reviews": Star, "restaurant-festivals": Sparkles, "restaurant-phone-orders": Phone, "restaurant-more": Plus,
  slots: CalendarClock, ads: Flag, campaigns: MapIcon, calendar: CalendarDays, services: Tags,
  classes: CalendarDays, "class-offers": Ticket, "class-door": ScanLine,
  "grocery-butcher": Beef, "grocery-flyer": Newspaper, "grocery-whatsapp": MessageCircle, "grocery-pantry": Repeat,
  pets: PawPrint, "groom-rebooking": Repeat, daycare: Dog, "food-cards": Bone,
  wash: Droplets, vehicles: Car, "service-reminders": BellRing, "tire-season": Disc3,
  queue: ListOrdered, payouts: Wallet, invoices: FileText, rebooking: Repeat, pharmacy: Pill,
};

/** Merchant switcher (avatar + name). With several shops the name opens a menu of the owner's other shops. */
function Switcher({ me }: { me: authApi.MeResponse }) {
  const { detail } = useMerchant();
  const { t, dir } = useLocaleOrEnglish();
  const { clear } = useThemeStyle();
  const router = useRouter();
  const m = detail.merchant;
  const many = me.merchants.length > 1;
  const street = placeLabel(detail.locations[0]?.address);
  const inner = (
    <>
      {/* Clear (audit #11, #12): a 32 r10 mark, 12 to two 16 px lines, so the brand row is 32 tall and centred on the toolbar's axis. */}
      <ShopMark name={m.name} brandColor={m.brandColor} logoUrl={m.logoUrl} size={clear ? 32 : 36} className={clear ? "rounded-r3" : "rounded-xl"} />
      <span className="min-w-0 flex-1 text-start group-data-[collapsible=icon]:hidden">
        <bdi className={clear ? "block truncate text-body font-[650] leading-4 text-foreground" : "block truncate text-body-strong text-foreground"}>{m.name}</bdi>
        {street ? <bdi className={clear ? "block truncate text-meta leading-4 text-muted-foreground" : "block truncate text-caption font-normal text-muted-foreground"}>{street}</bdi> : null}
      </span>
      {many ? <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" /> : null}
    </>
  );
  const row = clear ? "flex min-h-8 items-center gap-3 px-0 group-data-[collapsible=icon]:justify-center" : "flex min-h-11 items-center gap-2.5 px-1 group-data-[collapsible=icon]:justify-center";
  if (!many) return <div className={row}>{inner}</div>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t("shell.switchShop", { shop: m.name })} className={clear ? "flex min-h-8 w-full items-center gap-3 rounded-r3 px-0 hover:bg-lg-seg-track focus-visible:focus-ring max-md:min-h-11 group-data-[collapsible=icon]:justify-center" : "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 hover:bg-sidebar-accent focus-visible:focus-ring group-data-[collapsible=icon]:justify-center"}>
        {inner}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" dir={dir} className="w-64">
        {me.merchants.map((x) => (
          <DropdownMenuItem key={x.merchantId} className="min-h-11 gap-2 text-body md:min-h-9" onClick={() => router.push(`/m/${x.merchantId}`)}>
            <ShopMark name={x.name} size={20} className="rounded-full" />
            <bdi className="min-w-0 flex-1 truncate">{x.name}</bdi>
            {x.merchantId === m.id ? <Check aria-hidden className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Complete your setup  5 / 6" with a 3 px bar, until the checklist is done (v3 shell, sidebar zone 5). */
function SetupProgress() {
  const { api, base, role } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const { clear } = useThemeStyle();
  const pathname = usePathname();
  const ob = useApi((role === "owner" || role === "manager") ? () => api.onboarding() : null, [api, role, pathname]);
  const steps = ob.data?.steps ?? [];
  const done = steps.filter((x) => x.done).length;
  if (!ob.data || steps.length === 0 || done >= steps.length) return null;
  return (
    <Link href={`${base}/setup`} className="block min-h-11 rounded-lg py-1 focus-visible:focus-ring">
      <span className="flex justify-between text-meta text-muted-foreground">
        <span>{t("shell.setup.title")}</span>
        <span dir="ltr" className="tabular-nums">
          {done} / {steps.length}
        </span>
      </span>
      <span aria-hidden className={clear ? "mt-2 block h-1 overflow-hidden rounded-[2px] bg-lg-seg-track" : "mt-1.5 block h-0.75 overflow-hidden rounded-full bg-border"}>
        <span className={clear ? "block h-1 rounded-[2px] bg-foreground" : "block h-0.75 rounded-full bg-foreground"} style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
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
    <div role="status" data-testid="support-banner" className="mb-6 flex flex-col gap-2 rounded-input border border-border bg-muted px-4 py-2 text-meta print:hidden">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${session ? "bg-success" : "bg-destructive"}`} />
          <span className="truncate">
            {session ? `Support session open until ${new Date(session.expiresAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}. Changes are logged.` : `Viewing ${detail.merchant.name} as ${viewingAs}. You can look around; to change anything, start a support session.`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {session ? (
            <button type="button" disabled={busy} onClick={() => run(() => browserApi.support.end(session.id))} className="font-medium text-foreground hover:underline">End session</button>
          ) : null}
          <Link href={exit} className="font-medium text-foreground hover:underline">Exit</Link>
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
          <input aria-label="Reason (audit log)" placeholder="Reason, e.g. fix opening hours for the owner" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="h-8 min-w-0 flex-1 rounded-input border border-border bg-background px-3 text-meta" />
          <Button size="sm" type="submit" loading={busy} disabled={reason.trim().length < 5}>Start support session</Button>
        </form>
      ) : null}
      {err ? <p role="alert" className="text-destructive">{err}</p> : null}
    </div>
  );
}

export function MerchantShell({ me, children }: { me: authApi.MeResponse; children: ReactNode }) {
  const { base, detail, role, features, viewingAs, api } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const pathname = usePathname() ?? "";
  const soloCalendar = useSoloCalendar();
  const entries = buildMerchantNav(base, role, new Set(features.features.filter((f) => f.enabled).map((f) => f.key)), {
    vertical: detail.merchant.vertical,
    plan: features.plan,
    stages: Object.fromEntries(features.features.map((f) => [f.key, f.stage])),
    onOpenStreet: !!detail.merchant.neighbourhoodId,
    soloCalendar, // phase-solo D: a one-calendar solo pro has no Staff page in the sidebar
  });
  // Restaurants: counts after Orders, Phone orders and WhatsApp (new orders in orange; the others are waiting on someone, so muted).
  const isRestaurant = entries.some((e) => e.badge);
  const badges = useApi(isRestaurant ? () => api.restaurantBadges() : null, [api, isRestaurant], { pollMs: 30_000 });
  const badgeFor = (b: (typeof entries)[number]["badge"]) => (b && badges.data ? { count: badges.data[b], accent: b === "orders" } : undefined);
  const sections = navSections(entries).map((s) => ({
    key: s.key,
    label: t(`shell.section.${s.key}` as const),
    items: s.entries.map((e): ShellNavItem => ({ href: e.href, label: navLabel(t, e.label), icon: ICONS[e.key] ?? Store, exact: e.exact, badge: badgeFor(e.badge), child: !!e.parent })),
  }));
  // The phone bottom bar: Today, Counter, Customers, the trade's main module (the first row of run), More.
  const flat = navSections(entries);
  const pick = (key: string): ShellNavItem | null => {
    const e = entries.find((x) => x.key === key);
    // The first tab is "Today" on a phone, whatever the sidebar calls the row.
    return e ? { href: e.href, label: key === "home" ? t("shell.nav.today") : navLabel(t, e.label), icon: ICONS[e.key] ?? Store, exact: e.exact } : null;
  };
  const main = flat.find((s) => s.key === "run")?.entries[0];
  const bottomNav = [pick("home"), pick("counter"), pick("customers"), main ? pick(main.key) : null].filter((x): x is ShellNavItem => !!x);
  const section = pathname.slice(base.length).split("/")[1] ?? "";
  const sectionKey = section === "" ? "home" : section === "setup" ? "home" : section;
  const allowed = canOpen(role, sectionKey);

  const search = useMemo<CommandSearch | undefined>(
    () =>
      role === "staff" || role === "instructor"
        ? undefined
        : {
            label: t("shell.search.customers"),
            run: async (q) => (await api.customers({ q, limit: 6 })).items.map((c) => ({ id: c.memberId, label: c.name ?? t("shell.search.noName"), meta: c.phone ? c.phone.replace(/\*/g, "•") : undefined, href: `${base}/customers?member=${c.memberId}` })),
          },
    [api, base, role, t],
  );

  const links = me.platformRole === "admin" ? [{ href: "/admin", label: t("shell.console.admin") }] : me.platformRole === "rep" ? [{ href: "/rep", label: t("shell.console.rep") }] : [];
  const loc = detail.locations[0];
  const place = detail.locations.length > 1 ? t("shell.location.many", { n: detail.locations.length }) : loc ? placeLabel(loc.address) || loc.name : "";

  return (
    <Shell
      sections={sections}
      bottomNav={bottomNav.length ? bottomNav : undefined}
      search={search}
      searchPlaceholder={role === "staff" || role === "instructor" ? t("shell.search.jump") : t("shell.search.merchant")}
      header={<Switcher me={me} />}
      location={place ? <LocationChip label={place} href={detail.locations.length > 1 ? `${base}/locations` : undefined} /> : null}
      alerts={role === "owner" || role === "manager" ? <AlertsLink href={`${base}#needs-you`} label={t("shell.alerts")} /> : null}
      account={<AccountMenu name={me.user.name} email={me.user.email} links={links} />}
      footer={<SetupProgress />}
      bare={allowed && isBareRoute(pathname, base)}
      trade={detail.merchant.vertical}
      mobileTitle={<Switcher me={me} />}
      notice={
        viewingAs ? <SupportBanner viewingAs={viewingAs} /> : null
      }
    >
      {allowed ? (
        children
      ) : (
        <NoAccess title={t("shell.noAccess.title")} body={t("shell.noAccess.body")} action={<Button href={`${base}/counter`}>{t("shell.noAccess.action")}</Button>} />
      )}
    </Shell>
  );
}
