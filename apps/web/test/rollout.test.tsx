import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { adminApi } from "@ll/shared";
import { StageDialog } from "@/components/dashboard/admin/StageDialog";
import { allowedStages, canConfirmStage, canForceOff, gaugeStatus, groupFeatures, stageEffect } from "@/lib/dashboard/rollout";
import { PAID_FEATURES, FREE_FOREVER, type FeatureKey } from "@ll/shared";
import { IN_PAGE_FEATURES, NAV_FEATURES, buildMerchantNav, canOpen, navUnlocked } from "@/lib/dashboard/nav";

const feat = (over: Partial<adminApi.AdminFeature>): adminApi.AdminFeature => ({
  key: "orders.order_ahead", name: "Order-ahead", description: "", minPlan: "plus", phase: 2, stage: "hidden", defaultStage: "hidden", freeForever: false,
  unlockAtMerchants: 100, activeMerchants: 12, readyToUnlock: false, overrides: { enabled: 0, disabled: 0 }, interestCount: 3, note: null, updatedBy: null, updatedByName: null, updatedAt: null, ...over,
});

describe("rollout control rules", () => {
  it("locks free-forever features to GA and never lets them be forced off", () => {
    const free = feat({ key: "loyalty.points", freeForever: true, stage: "ga", minPlan: "free", phase: 1 });
    expect(allowedStages(free)).toEqual(["ga"]);
    expect(canConfirmStage(free, "hidden", "")).toBe(false);
    expect(canForceOff(free)).toBe(false);
    expect(canForceOff(feat({}))).toBe(true);
  });

  it("requires typing the key for GA, not for beta; no-op changes can't be confirmed", () => {
    const f = feat({});
    expect(canConfirmStage(f, "beta", "")).toBe(true);
    expect(canConfirmStage(f, "ga", "")).toBe(false);
    expect(canConfirmStage(f, "ga", "orders.order_ahead")).toBe(true);
    expect(canConfirmStage(f, "hidden", "")).toBe(false);
  });

  it("explains the effect in plain words", () => {
    expect(stageEffect(feat({}), "beta")).toMatch(/shops on Pro who turned on early access/);
    expect(stageEffect(feat({}), "ga")).toMatch(/Pro plan becomes purchasable/);
  });

  it("colours gauges by share of target (low < 40%, building, ready >= 100%)", () => {
    expect(gaugeStatus(10, 100)).toBe("low");
    expect(gaugeStatus(40, 100)).toBe("building");
    expect(gaugeStatus(100, 100)).toBe("ready");
    expect(gaugeStatus(5, 0)).toBe("ready");
  });

  it("groups by phase and plan", () => {
    const g = groupFeatures([feat({}), feat({ key: "service.tickets", minPlan: "pro" }), feat({ key: "ads.map_pin", phase: 3, minPlan: "free" }), feat({ key: "loyalty.points", freeForever: true, phase: 1, minPlan: "free" })]);
    expect(g.map((x) => x.items.map((i) => i.key))).toEqual([["orders.order_ahead"], ["service.tickets"], ["ads.map_pin"], ["loyalty.points"]]);
  });
});

describe("<StageDialog>", () => {
  it("only enables GA after the feature key is typed, and passes the note", async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(<StageDialog feature={feat({})} to="ga" onClose={() => undefined} onConfirm={onConfirm} />);
    expect(screen.getByRole("heading", { name: "Switch Order-ahead to Live?" })).toBeTruthy();
    expect(screen.getByText(/12 shops are active/)).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Set to Live" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Note (optional)"), "Pilot done");
    await userEvent.type(screen.getByLabelText("Type orders.order_ahead to confirm"), "orders.order_ahead");
    expect(btn.disabled).toBe(false);
    await userEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith("ga", "Pilot done");
  });

  it("beta needs no typed key", () => {
    render(<StageDialog feature={feat({})} to="beta" onClose={() => undefined} onConfirm={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Set to Early access" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByLabelText(/to confirm/)).toBeNull();
  });
});

describe("merchant navigation", () => {
  it("never shows locked features and gives staff only Today + Counter", () => {
    const none = buildMerchantNav("/m/x", "owner", new Set());
    expect(none.map((n) => n.key)).not.toContain("orders");
    expect(none.map((n) => n.key)).not.toContain("tickets");
    expect(none.map((n) => n.key)).toContain("billing");
    const pilot = buildMerchantNav("/m/x", "manager", new Set(["service.tickets", "orders.order_ahead"]));
    expect(pilot.map((n) => n.key)).toEqual(expect.arrayContaining(["tickets", "orders", "catalog"]));
    expect(pilot.map((n) => n.key)).not.toContain("billing");
    expect(buildMerchantNav("/m/x", "staff", new Set(["service.tickets"])).map((n) => n.label)).toEqual(["Today", "Counter"]);
    expect(canOpen("staff", "customers")).toBe(false);
    expect(canOpen("manager", "billing")).toBe(false);
  });

  it("Pricing v2: a free shop sees only loyalty + reporting in the sidebar", () => {
    const keys = buildMerchantNav("/m/x", "owner", new Set(FREE_FOREVER)).map((n) => n.key);
    // phase-solo G: the Website builder is open to every owner (preview); Publish is gated inside the page.
    expect(keys).toEqual(["home", "counter", "customers", "program", "reports", "site", "locations", "settings", "staff", "integrations", "billing"]);
    for (const k of ["promos", "discount-cards", "messages", "orders", "tickets", "catalog", "slots", "ads", "campaigns"]) expect(keys).not.toContain(k);
  });

  it("maps every paid feature key to a nav entry or an in-page section", () => {
    const covered = new Set<FeatureKey>([...Object.values(NAV_FEATURES).flat(), ...IN_PAGE_FEATURES]);
    expect(PAID_FEATURES.filter((k) => !covered.has(k))).toEqual([]);
  });

  it("each paid section appears as soon as any of its keys is on", () => {
    expect(navUnlocked("promos", new Set(["promos.double_points"]))).toBe(true);
    expect(navUnlocked("messages", new Set(["marketing.sms"]))).toBe(true);
    expect(navUnlocked("discount-cards", new Set(["promos.basic"]))).toBe(false);
    expect(navUnlocked("integrations", new Set())).toBe(true);
    const plus = buildMerchantNav("/m/x", "owner", new Set(["promos.basic", "discount_cards", "marketing.email"])).map((n) => n.key);
    expect(plus).toEqual(expect.arrayContaining(["promos", "discount-cards", "messages"]));
  });
});
