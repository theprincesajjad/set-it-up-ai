/**
 * Merchant dashboard navigation (merchant-dashboard.md "Shell", foundations.md "Merchant dashboard").
 * Pure so it is unit-tested: locked / unreleased features never appear in navigation.
 *
 * Pricing v2 (packages/shared/src/plans.ts): Free = the loyalty program + reporting on it.
 * Every dashboard section that depends on a paid feature lists its keys in NAV_FEATURES and is
 * shown only when at least one of them is enabled for the shop (plan + rollout + admin override).
 */
import type { FeatureKey } from "@ll/shared";

export type StaffRole = "owner" | "manager" | "staff";

/** Sidebar groups, drawn with a small gap between them (no headings). */
export type NavGroup = "main" | "loyalty" | "commerce" | "network" | "shop";

export interface NavEntry {
  key: string;
  href: string;
  label: string;
  group: NavGroup;
  exact?: boolean;
}

/**
 * Nav key → the paid feature keys that unlock it (any one is enough). Sections not listed here
 * are free forever (home, counter, customers, program, reports, locations, staff, integrations
 * (Google Business Profile), billing, settings).
 */
export const NAV_FEATURES: Record<string, readonly FeatureKey[]> = {
  promos: ["promos.basic", "promos.double_points", "promos.push_nearby"],
  "discount-cards": ["discount_cards"],
  messages: ["marketing.email", "marketing.sms", "marketing.automations"],
  orders: ["orders.order_ahead", "orders.pickup_status", "payments.in_app"],
  tickets: ["service.tickets", "service.quote_approval", "service.deposits", "service.invoices"],
  catalog: ["orders.order_ahead"],
  slots: ["booking.pickup_slots", "booking.dropoff_scheduling"],
  ads: ["ads.sponsored_listing", "ads.sponsored_promo", "ads.map_pin"],
  campaigns: ["campaigns.neighbourhood"],
};

/**
 * Paid keys that don't get their own sidebar entry but gate parts of a free page
 * (shown only when enabled): VIP / birthday / referrals on Program, CSV on Customers,
 * cohorts + network overlap on Reports, staff permissions on Staff, and the paid connectors on
 * Integrations (the page itself stays: Google Business Profile is free).
 */
export const IN_PAGE_FEATURES: readonly FeatureKey[] = [
  "loyalty.vip_levels",
  "loyalty.birthday_bonus",
  "loyalty.referrals",
  "customers.csv_export",
  "customers.csv_import",
  "reports.advanced",
  "staff.permissions",
  "integrations.pos_auto_award",
  "integrations.webhooks",
];

export function enabledSet(features: { key: string; enabled: boolean }[]): Set<FeatureKey> {
  return new Set(features.filter((f) => f.enabled).map((f) => f.key as FeatureKey));
}

/** Is a nav section unlocked for this shop? Free sections always are. */
export function navUnlocked(key: string, enabled: Set<FeatureKey>): boolean {
  const keys = NAV_FEATURES[key];
  return !keys || keys.some((k) => enabled.has(k));
}

export function buildMerchantNav(base: string, role: StaffRole, enabled: Set<FeatureKey>): NavEntry[] {
  const home: NavEntry = { key: "home", href: base, label: role === "staff" ? "Today" : "Home", group: "main", exact: true };
  const counter: NavEntry = { key: "counter", href: `${base}/counter`, label: "Counter", group: "main" };
  if (role === "staff") return [home, counter];

  const items: NavEntry[] = [
    home,
    counter,
    { key: "customers", href: `${base}/customers`, label: "Customers", group: "loyalty" },
    { key: "program", href: `${base}/program`, label: "Program & rewards", group: "loyalty" },
    { key: "promos", href: `${base}/promos`, label: "Promos", group: "loyalty" },
    { key: "discount-cards", href: `${base}/discount-cards`, label: "Discount cards", group: "loyalty" },
    { key: "messages", href: `${base}/messages`, label: "Messages", group: "loyalty" },
    { key: "reports", href: `${base}/reports`, label: "Reports", group: "loyalty" },
    { key: "orders", href: `${base}/orders`, label: "Orders", group: "commerce" },
    { key: "tickets", href: `${base}/tickets`, label: "Service tickets", group: "commerce" },
    { key: "catalog", href: `${base}/catalog`, label: "Menu & catalog", group: "commerce" },
    { key: "slots", href: `${base}/slots`, label: "Pickup & drop-off", group: "commerce" },
    { key: "ads", href: `${base}/ads`, label: "Ads", group: "network" },
    { key: "campaigns", href: `${base}/campaigns`, label: "Street campaigns", group: "network" },
    { key: "locations", href: `${base}/locations`, label: "Locations & QR kit", group: "shop" },
    { key: "staff", href: `${base}/staff`, label: "Staff", group: "shop" },
    { key: "integrations", href: `${base}/integrations`, label: "Integrations", group: "shop" },
    { key: "billing", href: `${base}/billing`, label: "Billing & plans", group: "shop" },
    { key: "settings", href: `${base}/settings`, label: "Settings", group: "shop" },
  ];
  return items.filter((i) => navUnlocked(i.key, enabled) && (i.key !== "billing" || role === "owner"));
}

/** Which nav keys a role may open directly (route guard for staff deep links). */
export function canOpen(role: StaffRole, key: string): boolean {
  if (role === "staff") return key === "home" || key === "counter";
  if (key === "billing") return role === "owner";
  return true;
}
