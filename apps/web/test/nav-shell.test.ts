import { describe, expect, it } from "vitest";
import { FEATURES, VERTICALS, type FeatureKey } from "@ll/shared";
import legacyJson from "./fixtures/nav-legacy.json";
import { NAV_LABEL_KEYS } from "@/lib/dashboard/navLabels";
import { NAV_SECTIONS, buildMerchantNav, navSections, type StaffRole } from "@/lib/dashboard/nav";

/**
 * The v3 shell has five sections for every trade. Two promises are tested here:
 *  1. Every route that was in a shop's sidebar before the shell changed is still in it (fixture generated from the old nav).
 *  2. Every trade returns the same five sections in the same order; only `run` is the trade's own.
 */
const ALL = Object.keys(FEATURES) as FeatureKey[];
const FREE = ALL.filter((k) => (FEATURES[k] as { tier?: string }).tier === "free" || (FEATURES[k] as { tier?: string }).tier === undefined);
const PROFILES: Record<string, { enabled: FeatureKey[]; plan: "free" | "plus" | "pro" }> = {
  free: { enabled: [], plan: "free" },
  freeForever: { enabled: FREE, plan: "free" },
  all: { enabled: ALL, plan: "pro" },
  restaurantPartial: { enabled: ["restaurant.dietary_tags", "orders.order_ahead"], plan: "pro" },
  restaurantAll: { enabled: ALL.filter((k) => k.startsWith("restaurant.") || k.startsWith("orders.")), plan: "pro" },
  grocery: { enabled: ALL.filter((k) => k.startsWith("grocery.") || k.startsWith("orders.")), plan: "pro" },
  appointments: { enabled: ["booking.appointments", "booking.walkin_queue", "staff.payouts", "service.tickets", "service.invoices", "service.rebooking", "booking.dropoff_scheduling", "booking.pickup_slots"], plan: "plus" },
  studio: { enabled: ["booking.classes", "memberships.recurring"], plan: "plus" },
  pets: { enabled: ALL.filter((k) => k.startsWith("pets.")), plan: "plus" },
  auto: { enabled: ALL.filter((k) => k.startsWith("auto.")), plan: "plus" },
  plus: { enabled: ["promos.basic", "marketing.sms", "discount_cards"], plan: "plus" },
};
const STAGES = Object.fromEntries(ALL.map((k) => [k, "ga"])) as Record<FeatureKey, string>;
const ROLES: StaffRole[] = ["owner", "manager", "staff", "instructor"];

const legacy = legacyJson as unknown as { sets: string[][]; cases: Record<string, number> };
const nav = (vertical: string | undefined, role: StaffRole, profile: string) => {
  const p = PROFILES[profile]!;
  return buildMerchantNav("/m/x", role, new Set(p.enabled), { vertical, plan: p.plan, stages: STAGES, onOpenStreet: true });
};

describe("every route in the old sidebar is still in the new one", () => {
  it("covers every vertical in packages/shared, every role and every feature profile", () => {
    const verticals = new Set(Object.keys(legacy.cases).map((k) => k.split("|")[0]));
    for (const v of VERTICALS) expect(verticals.has(v), v).toBe(true);
    expect(Object.keys(legacy.cases).length).toBe((VERTICALS.length + 1) * ROLES.length * Object.keys(PROFILES).length);
  });

  for (const v of [...VERTICALS, undefined] as (string | undefined)[]) {
    it(`${v ?? "no vertical"}`, () => {
      const missing: string[] = [];
      for (const role of ROLES)
        for (const profile of Object.keys(PROFILES)) {
          const was = legacy.sets[legacy.cases[`${v ?? "none"}|${role}|${profile}`]!]!;
          const now = new Set(nav(v, role, profile).map((e) => e.href.replace("/m/x", "")));
          for (const href of was) if (!now.has(href)) missing.push(`${role}|${profile}: ${href || "/"}`);
        }
      expect(missing).toEqual([]);
    });
  }
});

describe("one shell for every trade", () => {
  const TRADES = ["cafe", "salon", "restaurant", "fitness", "grocery", "pharmacy", "barber", "pet", "repair_auto", "retail"];
  it("returns today, run, customers, grow, shop, in that order, for every trade", () => {
    for (const v of TRADES)
      for (const profile of Object.keys(PROFILES)) {
        const sections = navSections(nav(v, "owner", profile));
        expect(sections.map((s) => s.key), `${v} ${profile}`).toEqual([...NAV_SECTIONS]);
      }
  });
  it("lists entries in section order and never an unknown group", () => {
    for (const v of VERTICALS)
      for (const role of ROLES) {
        const entries = nav(v, role, "all");
        const order = entries.map((e) => NAV_SECTIONS.indexOf(e.group));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
      }
  });
  it("only run differs: today and shop are the same entries for every trade", () => {
    const keysOf = (v: string, section: (typeof NAV_SECTIONS)[number], profile = "plus") =>
      navSections(nav(v, "owner", profile)).find((s) => s.key === section)!.entries.map((e) => e.key);
    for (const v of TRADES) {
      expect(keysOf(v, "today"), v).toEqual(["home", "counter"]);
      expect(keysOf(v, "shop"), v).toEqual(["locations", "settings", "staff", "integrations", "billing"]);
      expect(keysOf(v, "customers"), v).toEqual(expect.arrayContaining(["customers", "program", "promos"]));
      expect(keysOf(v, "grow"), v).toContain("reports");
    }
    // and the trade's own modules are in run
    expect(keysOf("fitness", "run", "studio")).toEqual(expect.arrayContaining(["classes", "class-door"]));
    expect(keysOf("salon", "run", "appointments")).toEqual(expect.arrayContaining(["calendar", "queue"]));
    expect(keysOf("restaurant", "run", "restaurantAll")).toContain("orders");
  });
  it("puts Staff, POS & integrations and Billing under Settings", () => {
    const shop = navSections(nav("cafe", "owner", "all")).find((s) => s.key === "shop")!.entries;
    expect(shop.filter((e) => e.parent === "settings").map((e) => e.key)).toEqual(["staff", "integrations", "billing"]);
    expect(shop.find((e) => e.key === "settings")?.parent).toBeUndefined();
  });
  it("keeps staff to Today, Counter and their own modules", () => {
    const keys = nav("salon", "staff", "appointments").map((e) => e.key);
    expect(keys.slice(0, 2)).toEqual(["home", "counter"]);
    expect(keys).not.toContain("settings");
    expect(keys).not.toContain("billing");
  });
  it("has a translation key for every label the sidebar can show", () => {
    const labels = new Set<string>();
    for (const v of [...VERTICALS, undefined] as (string | undefined)[])
      for (const role of ROLES) for (const profile of Object.keys(PROFILES)) for (const e of nav(v, role, profile)) labels.add(e.label);
    expect([...labels].filter((l) => !(l in NAV_LABEL_KEYS))).toEqual([]);
  });
});
