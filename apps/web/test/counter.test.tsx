import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { staffApi } from "@ll/shared";
import { CounterApp } from "@/components/dashboard/counter/CounterApp";
import type { MerchantEndpoints } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import { applyKey, awardLabel, keypadDisplay, lookupKind } from "@/lib/dashboard/counter";

const member = (over: Partial<staffApi.MemberSummaryDto> = {}): staffApi.MemberSummaryDto => ({
  memberId: "11111111-1111-1111-1111-111111111111", name: "Pat Quinn", maskedPhone: "(416) ***-0123", memberCode: "K7QX2M9P", balance: 6, terminology: "stamps", visitCount: 6,
  lastVisitAt: null, joinedAt: "2026-01-01T00:00:00Z", vip: null, rewardsAffordable: [], nextReward: { rewardId: "r1", name: "Free drink", pointsCost: 10, pointsNeeded: 4, progressPct: 60 },
  discountCards: [], openRedemptionCount: 0, marketingConsent: true, expiryDisclosure: "Your stamps never expire.", ...over,
});

function mockApi() {
  const award = vi.fn(async (body: unknown, key: string): Promise<staffApi.AwardResponse> => {
    void body;
    void key;
    return { member: member({ balance: 7, nextReward: { rewardId: "r1", name: "Free drink", pointsCost: 10, pointsNeeded: 3, progressPct: 70 } }), memberCreated: false, duplicate: false, transactionId: "tx1", pointsEarned: 1, extraPoints: 0, balance: 7, breakdown: [], eligibleCents: 0, excludedCents: 0, rewardsAvailable: [], messages: [], receiptQueued: false };
  });
  const api = {
    lookup: vi.fn(async (): Promise<staffApi.LookupResponse> => ({ matchedBy: "phone", items: [member()], normalizedPhone: null })),
    award,
    redeem: vi.fn(),
    verify: vi.fn(),
    today: vi.fn(),
    activity: vi.fn(async () => ({ items: [] })),
    undo: vi.fn(async () => ({ reversalTransactionId: "rv1", member: member() })),
  };
  return api as unknown as MerchantEndpoints["counter"] & typeof api;
}

const stamps = { earnType: "stamps" as const, pointsPerDollar: 0, pointsPerVisit: 1, terminology: "stamps" };
const perDollar = { earnType: "per_dollar" as const, pointsPerDollar: 1, pointsPerVisit: 0, terminology: "points" };

describe("counter helpers", () => {
  it("keypad fills cents from the right like a till", () => {
    let c = "";
    for (const k of ["1", "2", "5", "0"] as const) c = applyKey(c, k);
    expect(keypadDisplay(c)).toBe("$12.50");
    expect(keypadDisplay(applyKey(c, "back"))).toBe("$1.25");
    expect(applyKey(c, "clear")).toBe("");
  });
  it("detects what was typed", () => {
    expect(lookupKind("0123")).toBe("last4");
    expect(lookupKind("(416) 555-0123")).toBe("phone");
    expect(lookupKind("K7QX2M9P")).toBe("code");
    expect(lookupKind("LL:K7QX2M9P")).toBe("code");
    expect(lookupKind("41")).toBe("incomplete");
  });
  it("labels the award button", () => {
    expect(awardLabel(stamps, 0)).toBe("Add stamp");
    expect(awardLabel(stamps, 0, 3)).toBe("Add 3 stamps");
    expect(awardLabel(perDollar, 1250)).toBe("Award 12 pts");
  });
});

describe("<CounterApp> award flow", () => {
  it("finds a customer, adds a stamp with an idempotency key, shows success, and undoes", async () => {
    const api = mockApi();
    render(<CounterApp api={api} program={stamps} shopName="Pinecone Coffee" locations={[{ id: "loc1", name: "Main" }]} />);
    const search = screen.getByLabelText("Phone, last 4 digits or member code");
    await userEvent.type(search, "4165550123{Enter}");
    expect(await screen.findByRole("heading", { name: "Pat Quinn" })).toBeTruthy();
    expect(api.lookup).toHaveBeenCalledWith("4165550123");
    await userEvent.click(screen.getByRole("button", { name: "Add stamp" }));
    expect(await screen.findByText("Added 1 stamp")).toBeTruthy();
    expect(screen.getByText(/Pat has 7 stamps/)).toBeTruthy();
    const [body, key] = api.award.mock.calls[0]!;
    expect(body).toMatchObject({ memberId: member().memberId, locationId: "loc1" });
    expect((body as { amountCents?: number }).amountCents).toBeUndefined();
    expect(key).toMatch(/^counter-/);
    await userEvent.click(screen.getByRole("button", { name: /Undo \(\d+\)/ }));
    await waitFor(() => expect(api.undo).toHaveBeenCalledWith("tx1"));
  });

  it("awards a typed amount on per-dollar programs and supports keyboard entry", async () => {
    const api = mockApi();
    render(<CounterApp api={api} program={perDollar} shopName="Shop" locations={[]} />);
    await userEvent.type(screen.getByLabelText("Phone, last 4 digits or member code"), "4165550123{Enter}");
    await screen.findByRole("heading", { name: "Pat Quinn" });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("1250");
    expect(screen.getByLabelText("Purchase amount").textContent).toBe("$12.50");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(api.award).toHaveBeenCalled());
    expect(api.award.mock.calls[0]![0]).toMatchObject({ amountCents: 1250 });
  });

  it("reuses the same idempotency key when a network error forces a retry", async () => {
    const api = mockApi();
    api.award.mockRejectedValueOnce(ApiError.network());
    render(<CounterApp api={api} program={stamps} shopName="Shop" locations={[]} />);
    await userEvent.type(screen.getByLabelText("Phone, last 4 digits or member code"), "4165550123{Enter}");
    await screen.findByRole("heading", { name: "Pat Quinn" });
    await userEvent.click(screen.getByRole("button", { name: "Add stamp" }));
    expect(await screen.findByText(/Can't connect right now/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add stamp" }));
    await screen.findByText("Added 1 stamp");
    expect(api.award.mock.calls[0]![1]).toBe(api.award.mock.calls[1]![1]);
  });

  it("offers Add and award for a new phone with an unticked consent box", async () => {
    const api = mockApi();
    api.lookup.mockResolvedValueOnce({ matchedBy: "phone", items: [], normalizedPhone: "+16475550199" });
    render(<CounterApp api={api} program={stamps} shopName="Pinecone Coffee" locations={[]} />);
    await userEvent.type(screen.getByLabelText("Phone, last 4 digits or member code"), "6475550199{Enter}");
    expect(await screen.findByText(/New customer/)).toBeTruthy();
    const consent = screen.getByLabelText(/Send me offers and news from Pinecone Coffee/) as HTMLInputElement;
    expect(consent.checked).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Add and award" }));
    await waitFor(() => expect(api.award).toHaveBeenCalled());
    expect(api.award.mock.calls[0]![0]).toMatchObject({ phone: "+16475550199" });
    expect((api.award.mock.calls[0]![0] as { consent?: unknown }).consent).toBeUndefined();
  });
});
