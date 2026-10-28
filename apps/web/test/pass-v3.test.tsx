import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contrastRatio, hsl } from "@ll/design-tokens";
import type { customerApi } from "@ll/shared";

const replace = vi.fn();
let pathname = "/me";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AwningStripe, PassTopBar } from "@/components/pass/PassChrome";
import { PassTabBar } from "@/components/pass/PassTabBar";
import { heroMembership } from "@/components/pass/ShopPassHero";
import { RewardCard } from "@/components/ui/RewardCard";
import { ShopLogo } from "@/components/ui/ShopTile";
import { onColor } from "@/lib/shopAvatar";
import { LocaleProvider } from "@/lib/i18n/client";

beforeEach(() => {
  replace.mockClear();
  pathname = "/me";
});

describe("shop initials on any brand colour (v3 section 5.1: text pairs need 4.5:1)", () => {
  it("picks black or white so every brand colour reaches 4.5:1", () => {
    let worst = 21;
    for (let h = 0; h < 360; h += 6) for (const s of [0, 20, 45, 70, 100]) for (const l of [4, 12, 25, 38, 50, 62, 75, 88, 96]) {
      const bg = hsl(h, s, l);
      worst = Math.min(worst, contrastRatio(onColor(bg), bg));
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
  it("ShopLogo writes that text colour on the shop's own colour, and only there", () => {
    const { container } = render(<ShopLogo shop={{ name: "Sunny Side", vertical: "cafe", brandColor: "#FFD60A" }} />);
    const el = container.querySelector("span")!;
    expect(el.style.color).toBe("rgb(0, 0, 0)");
    expect(el.style.background).toContain("rgb(255, 214, 10)");
  });
});

describe("pass chrome", () => {
  it("the awning stripe is decorative and renders one pattern", () => {
    const { container } = render(<AwningStripe />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("pattern")).toHaveLength(1);
  });

  it("the tab bar has four tabs, the card tab keeps its name, and the active one is marked", () => {
    render(<PassTabBar active="rewards" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = nav.querySelectorAll("a");
    expect(links).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Show my card" }).getAttribute("href")).toBe("/me#card");
    expect(screen.getByRole("link", { name: "Rewards" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Shops" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Activity" }).getAttribute("href")).toBe("/me#activity");
  });

  it("on the wallet page a tab switches in place instead of navigating", () => {
    const onSelect = vi.fn();
    render(<PassTabBar active="card" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("link", { name: "Activity" }));
    expect(onSelect).toHaveBeenCalledWith("activity");
  });

  it("the language chip lists the four languages in their own script and switches with ?lang=", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <PassTopBar title="Wallet" backHref="/map" />
      </LocaleProvider>,
    );
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/map");
    await user.click(screen.getByRole("button", { name: /^Language/ }));
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["English", "हिन्दी", "اردو", "ਪੰਜਾਬੀ"]);
    expect(items[0]!.getAttribute("aria-checked")).toBe("true");
    await user.click(items[2]!);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(String(replace.mock.calls[0]![0])).toContain("lang=ur");
  });
});

const m = (over: Partial<customerApi.MembershipDto> & { id: string; progressPct?: number; needed?: number }): customerApi.MembershipDto =>
  ({
    id: over.id,
    balance: 10,
    terminology: "points",
    rewardsAvailableCount: over.rewardsAvailableCount ?? 0,
    merchant: { name: `Shop ${over.id}`, vertical: "cafe" },
    nextReward: over.nextReward === undefined ? { name: "Free coffee", pointsCost: 100, pointsNeeded: over.needed ?? 50, progressPct: over.progressPct ?? 50 } : over.nextReward,
  }) as unknown as customerApi.MembershipDto;

describe("the shop the pass features", () => {
  it("a reward ready wins, then the closest to a reward, then the first shop", () => {
    expect(heroMembership([])).toBeNull();
    expect(heroMembership([m({ id: "a", progressPct: 90 }), m({ id: "b", rewardsAvailableCount: 1 })])!.id).toBe("b");
    expect(heroMembership([m({ id: "a", progressPct: 20 }), m({ id: "b", progressPct: 70 })])!.id).toBe("b");
    expect(heroMembership([m({ id: "a", nextReward: null }), m({ id: "b", nextReward: null })])!.id).toBe("a");
  });
});

describe("reward rows (frame 15:184)", () => {
  const reward = { name: "Free chai", pointsCost: 60, rewardType: "free_item" as const, value: 0 };
  it("a reward that can be redeemed shows Ready and a full bar", () => {
    render(<RewardCard layout="row" reward={reward} balance={84} terminology="points" state="available" onRedeem={() => undefined} />);
    expect(screen.getByText(/Ready/)).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("60");
    expect(bar.getAttribute("aria-valuemax")).toBe("60");
    expect(screen.getByRole("button", { name: "Redeem" })).toBeTruthy();
  });
  it("a locked reward shows its progress and no Redeem button", () => {
    render(<RewardCard layout="row" reward={{ ...reward, pointsCost: 120 }} balance={84} terminology="points" state="locked" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("84");
    expect(screen.queryByRole("button", { name: "Redeem" })).toBeNull();
  });
});
