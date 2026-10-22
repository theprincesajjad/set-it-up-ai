/**
 * Merchant dashboard navigation (merchant-dashboard.md "Shell"). Pure so it is unit-tested:
 * locked / unreleased features never appear in navigation.
 */
import type { FeatureKey } from "@ll/shared";

export type StaffRole = "owner" | "manager" | "staff";

export interface NavEntry {
  key: string;
  href: string;
  label: string;
  /** In the < md bottom bar. */
  bottom?: boolean;
  exact?: boolean;
}

export function enabledSet(features: { key: string; enabled: boolean }[]): Set<FeatureKey> {
  return new Set(features.filter((f) => f.enabled).map((f) => f.key as FeatureKey));
}

export function buildMerchantNav(base: string, role: StaffRole, enabled: Set<FeatureKey>): NavEntry[] {
  const home: NavEntry = { key: "home", href: base, label: role === "staff" ? "Today" : "Home", bottom: true, exact: true };
  const counter: NavEntry = { key: "counter", href: `${base}/counter`, label: "Counter", bottom: true };
  if (role === "staff") return [home, counter];

  const on = (k: FeatureKey) => enabled.has(k);
  const items: (NavEntry | false)[] = [
    home,
    on("orders.order_ahead") && { key: "orders", href: `${base}/orders`, label: "Orders" },
    on("service.tickets") && { key: "tickets", href: `${base}/tickets`, label: "Service tickets" },
    { key: "customers", href: `${base}/customers`, label: "Customers", bottom: true },
    { key: "program", href: `${base}/program`, label: "Program & rewards" },
    { key: "promos", href: `${base}/promos`, label: "Promos", bottom: true },
    { key: "discount-cards", href: `${base}/discount-cards`, label: "Discount cards" },
    on("orders.order_ahead") && { key: "catalog", href: `${base}/catalog`, label: "Menu & catalog" },
    (on("booking.pickup_slots") || on("booking.dropoff_scheduling")) && { key: "slots", href: `${base}/slots`, label: "Pickup & drop-off" },
    { key: "messages", href: `${base}/messages`, label: "Messages" },
    { key: "reports", href: `${base}/reports`, label: "Reports" },
    (on("ads.sponsored_listing") || on("ads.sponsored_promo") || on("ads.map_pin")) && { key: "ads", href: `${base}/ads`, label: "Ads" },
    on("campaigns.neighbourhood") && { key: "campaigns", href: `${base}/campaigns`, label: "Street campaigns" },
    { key: "locations", href: `${base}/locations`, label: "Locations & QR kit" },
    { key: "staff", href: `${base}/staff`, label: "Staff" },
    { key: "integrations", href: `${base}/integrations`, label: "Integrations" },
    role === "owner" && { key: "billing", href: `${base}/billing`, label: "Billing & plans" },
    { key: "settings", href: `${base}/settings`, label: "Settings" },
    counter,
  ];
  return items.filter((i): i is NavEntry => !!i);
}

/** Which nav keys a role may open directly (route guard for staff deep links). */
export function canOpen(role: StaffRole, key: string): boolean {
  if (role === "staff") return key === "home" || key === "counter";
  if (key === "billing") return role === "owner";
  return true;
}
