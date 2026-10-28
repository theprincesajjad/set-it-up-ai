import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { staffApi } from "@ll/shared";
import { CounterApp } from "@/components/dashboard/counter/CounterApp";
import { notCountedCents } from "@/components/dashboard/counter/GroceryExtras";
import type { MerchantEndpoints } from "@/lib/api/endpoints";

const member = (): staffApi.MemberSummaryDto => ({
  memberId: "11111111-1111-1111-1111-111111111111", name: "Pat Quinn", maskedPhone: "(416) ***-0123", memberCode: "K7QX2M9P", balance: 600, terminology: "points", visitCount: 6,
  lastVisitAt: null, joinedAt: "2026-01-01T00:00:00Z", vip: null, rewardsAffordable: [], nextReward: null, discountCards: [], openRedemptionCount: 0, marketingConsent: true, expiryDisclosure: "", ...({} as object),
});
const awardRes = (): staffApi.AwardResponse => ({
  member: member(), memberCreated: false, duplicate: false, transactionId: "tx1", pointsEarned: 40, extraPoints: 0, balance: 640, breakdown: [], eligibleCents: 4000, excludedCents: 1500, rewardsAvailable: [], messages: [], receiptQueued: false, visitsThisMonth: 2,
});
const api = () =>
  ({
    lookup: vi.fn(async () => ({ matchedBy: "last4", items: [member()], normalizedPhone: null })),
    award: vi.fn(async () => awardRes()),
    redeem: vi.fn(), verify: vi.fn(),
    today: vi.fn(async () => ({ date: "2026-10-23", visitCount: 0, newMembers: 0, pointsIssued: 0, redemptions: 0, items: [] })),
    activity: vi.fn(async () => ({ items: [] })),
    undo: vi.fn(),
    logPantry: vi.fn(async () => ({})),
  }) as unknown as MerchantEndpoints["counter"] & { award: ReturnType<typeof vi.fn>; lookup: ReturnType<typeof vi.fn>; logPantry: ReturnType<typeof vi.fn> };
const program = { earnType: "per_dollar" as const, pointsPerDollar: 1, pointsPerVisit: 0, terminology: "points", counterAutoStamp: true };

describe("notCountedCents", () => {
  it("reads dollars typed at the till", () => {
    expect(notCountedCents("15")).toBe(1500);
    expect(notCountedCents("15.5")).toBe(1550);
    expect(notCountedCents("")).toBe(0);
    expect(notCountedCents("abc")).toBe(0);
  });
});

describe("<CounterApp> for a grocer", () => {
  it("sends the part that does not count with the award, then logs the bulk bag with the customer's yes", async () => {
    const a = api();
    render(
      <CounterApp api={a} program={program} shopName="Annapurna" locations={[]} grocery={{ pantryItems: [{ id: "p1", name: "Atta 20 lb" }], askText: "Want a text before it runs out?" }} />,
    );
    for (const d of "0123") await userEvent.click(screen.getByRole("button", { name: d }));
    await screen.findByRole("heading", { name: "Pat Quinn" });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("5500");
    await userEvent.click(screen.getByRole("button", { name: /Not counted/ }));
    for (const d of "1500") await userEvent.click(within(screen.getByRole("group", { name: "Not counted keypad" })).getByRole("button", { name: d }));
    expect(screen.getByText("$15.00 · $40.00 counts")).toBeTruthy();
    // The big button promises points on what counts ($40), not on the whole $55 till total.
    expect(screen.getByRole("button", { name: "Award 40 pts" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Bought a bulk item/ }));
    await userEvent.click(screen.getByRole("button", { name: "Atta 20 lb" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /said yes to a restock text/ }));
    await userEvent.click(screen.getByRole("button", { name: /Award/ }));
    await waitFor(() => expect(a.award).toHaveBeenCalled());
    expect((a.award.mock.calls[0] as unknown[])[0]).toMatchObject({ amountCents: 5500, notCountedCents: 1500 });
    await waitFor(() => expect(a.logPantry).toHaveBeenCalledWith({ memberId: member().memberId, pantryItemId: "p1", remind: true }));
  }, 30_000);

  it("logs the bulk bag as the PIN-switched staff member, not the signed-in owner", async () => {
    const a = api();
    const asHarjit = api();
    const verify = vi.fn(async () => ({ accessToken: "tok-harjit", accessTokenExpiresAt: "", staff: { userId: "u-h", name: "Harjit Singh", role: "staff" as const } }));
    const apiAs = vi.fn(() => asHarjit);
    render(<CounterApp api={a} program={program} shopName="Annapurna" locations={[]} pin={{ verify, apiAs }} signedInName="Owner" grocery={{ pantryItems: [{ id: "p1", name: "Atta 20 lb" }], askText: "Want a text?" }} />);
    await userEvent.click(screen.getByRole("button", { name: /sign in with a PIN/i }));
    for (const d of "1234") await userEvent.click(screen.getByRole("button", { name: d }));
    await screen.findByRole("button", { name: /Stamping as Harjit Singh/ });
    for (const d of "0123") await userEvent.click(screen.getByRole("button", { name: d }));
    await screen.findByRole("heading", { name: "Pat Quinn" });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("5500");
    await userEvent.click(screen.getByRole("button", { name: /Bought a bulk item/ }));
    await userEvent.click(screen.getByRole("button", { name: "Atta 20 lb" }));
    await userEvent.click(screen.getByRole("button", { name: /Award/ }));
    await waitFor(() => expect(asHarjit.logPantry).toHaveBeenCalledWith({ memberId: member().memberId, pantryItemId: "p1", remind: false }));
    expect(a.logPantry).not.toHaveBeenCalled();
  }, 30_000);

  it("refuses a not-counted amount larger than the total and sends nothing", async () => {
    const a = api();
    render(<CounterApp api={a} program={program} shopName="Annapurna" locations={[]} grocery={{ pantryItems: [], askText: "" }} />);
    for (const d of "0123") await userEvent.click(screen.getByRole("button", { name: d }));
    await screen.findByRole("heading", { name: "Pat Quinn" });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("1000");
    await userEvent.click(screen.getByRole("button", { name: /Not counted/ }));
    for (const d of "2000") await userEvent.click(within(screen.getByRole("group", { name: "Not counted keypad" })).getByRole("button", { name: d }));
    expect(screen.getAllByText("More than the total.").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /Award/ }));
    expect(a.award).not.toHaveBeenCalled();
    expect(screen.getByText(/more than the total/)).toBeTruthy();
  }, 30_000);

  it("shows no grocery fields to other shops", async () => {
    const a = api();
    render(<CounterApp api={a} program={program} shopName="Cafe" locations={[]} />);
    for (const d of "0123") await userEvent.click(screen.getByRole("button", { name: d }));
    await screen.findByRole("heading", { name: "Pat Quinn" });
    expect(screen.queryByRole("button", { name: /Not counted/ })).toBeNull();
  });
});
