import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { staffApi } from "@ll/shared";
import { CounterApp } from "@/components/dashboard/counter/CounterApp";
import { DigitBoxes, ScanKeypad } from "@/components/dashboard/counter/ScanKeypad";
import { StampRow } from "@/components/dashboard/counter/StampRow";
import { Keypad } from "@/components/ui/Keypad";
import type { MerchantEndpoints } from "@/lib/api/endpoints";

// v3 acceptance (strategy 8.2 E): the counter is chrome-free. If the dashboard's Banner or PageHeader ever renders on it, these throw.
vi.mock("@/components/ui/Banner", () => ({
  Banner: () => {
    throw new Error("Banner rendered on the counter");
  },
}));
vi.mock("@/components/dashboard/kit", () => ({
  PageHeader: () => {
    throw new Error("PageHeader rendered on the counter");
  },
}));

const member = (over: Partial<staffApi.MemberSummaryDto> = {}): staffApi.MemberSummaryDto => ({
  memberId: "11111111-1111-1111-1111-111111111111", name: "Pat Quinn", maskedPhone: "(416) ***-0123", memberCode: "K7QX2M9P", balance: 6, terminology: "stamps", visitCount: 6,
  lastVisitAt: null, joinedAt: "2026-01-01T00:00:00Z", vip: null, rewardsAffordable: [], nextReward: { rewardId: "r1", name: "Free drink", pointsCost: 10, pointsNeeded: 4, progressPct: 60 },
  discountCards: [], openRedemptionCount: 1, marketingConsent: true, expiryDisclosure: "Your stamps never expire.", ...over,
});

function mockApi() {
  const api = {
    lookup: vi.fn(async (): Promise<staffApi.LookupResponse> => ({ matchedBy: "last4", items: [member()], normalizedPhone: null })),
    award: vi.fn(),
    redeem: vi.fn(),
    verify: vi.fn(),
    today: vi.fn(async () => ({ date: "2026-10-23", visitCount: 3, newMembers: 0, pointsIssued: 94, redemptions: 0, items: [] })),
    activity: vi.fn(async () => ({ items: [] })),
    regulars: vi.fn(async (): Promise<staffApi.RegularsResponse> => ({ items: [] })),
    undo: vi.fn(),
  };
  return api as unknown as MerchantEndpoints["counter"] & typeof api;
}
const confirmStamps = { earnType: "stamps" as const, pointsPerDollar: 0, pointsPerVisit: 1, terminology: "stamps", stampGoal: 10, counterAutoStamp: false };

describe("counter chrome (v3, Figma 15:2)", () => {
  it("has no page header and no banner on scan, on a customer with a waiting code, or on an error", async () => {
    const api = mockApi();
    render(<CounterApp api={api} program={confirmStamps} shopName="Pinecone Coffee" locations={[]} />);
    // The page name is one h1 in the top strip, with the shop and whether this device is online.
    expect(screen.getByRole("heading", { level: 1, name: "Counter" })).toBeTruthy();
    expect(screen.getByText(/Online/)).toBeTruthy();
    for (const d of "0123") await userEvent.click(screen.getByRole("button", { name: d }));
    expect(await screen.findByRole("heading", { name: "Pat Quinn" })).toBeTruthy();
    // The reward code waiting in the app is a quiet row, not a Banner.
    expect(screen.getByText(/reward code waiting in the app/)).toBeTruthy();
    api.lookup.mockRejectedValueOnce(new Error("boom"));
    await userEvent.click(screen.getByRole("button", { name: "Clear customer" }));
    for (const d of "9999") await userEvent.click(screen.getByRole("button", { name: d }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });

  it("offers one decision: a 72 px black award button", async () => {
    const api = mockApi();
    render(<CounterApp api={api} program={confirmStamps} shopName="Shop" locations={[]} />);
    for (const d of "0123") await userEvent.click(screen.getByRole("button", { name: d }));
    const award = await screen.findByRole("button", { name: "Add 1 stamp" });
    expect(award.className).toContain("min-h-18");
    expect(award.className).toContain("bg-fg");
  });
});

describe("hit areas (strategy 8.2 E: 72 px counter keys, 88 px kiosk keys, 8 px gaps)", () => {
  it("counter keypad keys are 72 px with an 8 px gap", () => {
    render(<Keypad onKey={() => undefined} />);
    const keys = screen.getAllByRole("button");
    expect(keys).toHaveLength(12);
    for (const k of keys) expect(k.className).toContain("h-18");
    expect(screen.getByRole("group").className).toContain("gap-2");
  });
  it("kiosk keypad keys are 88 px", () => {
    render(<Keypad size="kiosk" onKey={() => undefined} />);
    for (const k of screen.getAllByRole("button")) expect(k.className).toContain("h-22");
  });
  it("the last-4 keypad is 72 px and its scan key is there only when the counter can open a camera", async () => {
    const onScanKey = vi.fn();
    const { unmount } = render(<ScanKeypad onKey={() => undefined} onScanKey={onScanKey} />);
    for (const k of screen.getAllByRole("button")) expect(k.className).toContain("h-18");
    await userEvent.click(screen.getByRole("button", { name: "Scan with the camera" }));
    expect(onScanKey).toHaveBeenCalledTimes(1);
    unmount();
    render(<ScanKeypad onKey={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Scan with the camera" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(11);
  });
  it("shows the digits left to right with the next empty slot marked", () => {
    render(<DigitBoxes value="01" />);
    const group = screen.getByRole("group", { name: "Last 4 digits of their phone" });
    expect(group.getAttribute("dir")).toBe("ltr");
    expect(screen.getByLabelText("Digit 2: 1")).toBeTruthy();
    expect(screen.getByLabelText("Digit 3: empty").className).toContain("border-foreground");
  });
});

describe("stamp pop", () => {
  it("only the stamps that just landed pop, and only when motion is allowed", () => {
    const { container } = render(<StampRow goal={10} filled={7} popFrom={5} />);
    const dots = [...container.querySelectorAll("span")];
    const popping = dots.filter((d) => d.className.includes("animate-stamp-pop"));
    expect(popping).toHaveLength(2);
    // `motion-safe:` means prefers-reduced-motion shows the stamps already in place: no bare animate class anywhere.
    for (const d of popping) expect(d.className).toContain("motion-safe:animate-stamp-pop");
    expect(dots.some((d) => /(^|\s)animate-stamp-pop/.test(d.className))).toBe(false);
  });
  it("does not pop when nothing landed", () => {
    const { container } = render(<StampRow goal={10} filled={7} />);
    expect(container.innerHTML).not.toContain("animate-stamp-pop");
  });
});
