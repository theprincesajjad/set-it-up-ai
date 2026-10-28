import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { staffApi } from "@ll/shared";
import { CounterApp } from "@/components/dashboard/counter/CounterApp";
import type { MerchantEndpoints } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import {
  applyKey,
  awardLabel,
  cameInText,
  EMPTY_SCANNER,
  feedScanner,
  isRewardReady,
  keypadDisplay,
  lookupKind,
  lookupOutcome,
  matchesHeading,
  pushDigit,
  scanPayload,
  stampsLeft,
  visitThisMonth,
} from "@/lib/dashboard/counter";

const member = (over: Partial<staffApi.MemberSummaryDto> = {}): staffApi.MemberSummaryDto => ({
  memberId: "11111111-1111-1111-1111-111111111111", name: "Pat Quinn", maskedPhone: "(416) ***-0123", memberCode: "K7QX2M9P", balance: 6, terminology: "stamps", visitCount: 6,
  lastVisitAt: null, joinedAt: "2026-01-01T00:00:00Z", vip: null, rewardsAffordable: [], nextReward: { rewardId: "r1", name: "Free drink", pointsCost: 10, pointsNeeded: 4, progressPct: 60 },
  discountCards: [], openRedemptionCount: 0, marketingConsent: true, expiryDisclosure: "Your stamps never expire.", ...over,
});

const awardRes = (over: Partial<staffApi.AwardResponse> = {}): staffApi.AwardResponse => ({
  member: member({ balance: 7, nextReward: { rewardId: "r1", name: "Free drink", pointsCost: 10, pointsNeeded: 3, progressPct: 70 } }),
  memberCreated: false, duplicate: false, transactionId: "tx1", pointsEarned: 1, extraPoints: 0, balance: 7, breakdown: [], eligibleCents: 0, excludedCents: 0, rewardsAvailable: [], messages: [], receiptQueued: false, visitsThisMonth: 5, ...over,
});

function mockApi() {
  const api = {
    lookup: vi.fn(async (): Promise<staffApi.LookupResponse> => ({ matchedBy: "last4", items: [member()], normalizedPhone: null })),
    award: vi.fn(async (body: unknown, key: string): Promise<staffApi.AwardResponse> => {
      void body;
      void key;
      return awardRes();
    }),
    redeem: vi.fn(),
    verify: vi.fn(),
    today: vi.fn(async () => ({ date: "2026-10-23", visitCount: 3, newMembers: 0, pointsIssued: 94, redemptions: 0, items: [] })),
    activity: vi.fn(async () => ({ items: [] })),
    regulars: vi.fn(async (): Promise<staffApi.RegularsResponse> => ({ items: [] })),
    undo: vi.fn(async () => ({ reversalTransactionId: "rv1", member: member() })),
  };
  return api as unknown as MerchantEndpoints["counter"] & typeof api;
}

const stamps = { earnType: "stamps" as const, pointsPerDollar: 0, pointsPerVisit: 1, terminology: "stamps", stampGoal: 10, counterAutoStamp: true };
const confirmStamps = { ...stamps, counterAutoStamp: false };
const perDollar = { earnType: "per_dollar" as const, pointsPerDollar: 1, pointsPerVisit: 0, terminology: "points" };

const type4 = async (digits = "0123") => {
  for (const d of digits) await userEvent.click(screen.getByRole("button", { name: d }));
};

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
    expect(awardLabel(stamps, 0)).toBe("Add 1 stamp");
    expect(awardLabel(stamps, 0, 3)).toBe("Add 3 stamps");
    expect(awardLabel(perDollar, 1250)).toBe("Award 12 pts");
  });
  it("takes at most four digits and supports delete and clear", () => {
    expect(pushDigit("", "1")).toBe("1");
    expect(pushDigit("1234", "5")).toBe("1234");
    expect(pushDigit("12", "back")).toBe("1");
    expect(pushDigit("12", "clear")).toBe("");
    expect(pushDigit("12", "x")).toBe("12");
  });
  it("accepts LL: payloads and bare member codes, nothing else", () => {
    expect(scanPayload("LL:K7QX2M9P")).toBe("LL:K7QX2M9P");
    expect(scanPayload(" ll:k7qx2m9p ")).toBe("LL:K7QX2M9P");
    expect(scanPayload("K7QX2M9P")).toBe("K7QX2M9P");
    expect(scanPayload("0123")).toBeNull();
    expect(scanPayload("LL:")).toBeNull();
    expect(scanPayload("hello world")).toBeNull();
  });
  it("reads a USB scanner: fast keys then Enter, but not a person typing slowly", () => {
    let st = EMPTY_SCANNER;
    let t = 1000;
    for (const ch of "LL:K7QX2M9P") {
      st = feedScanner(st, ch, (t += 5)).state;
    }
    expect(feedScanner(st, "Enter", t + 5).scanned).toBe("LL:K7QX2M9P");
    // Slow typing (300 ms apart) restarts the buffer on every key, so Enter finds nothing.
    st = EMPTY_SCANNER;
    for (const ch of "LL:K7QX2M9P") st = feedScanner(st, ch, (t += 300)).state;
    expect(feedScanner(st, "Enter", t + 300).scanned).toBeNull();
    // Enter alone, or a short buffer, never submits.
    expect(feedScanner(EMPTY_SCANNER, "Enter", 1).scanned).toBeNull();
  });
  it("decides what a lookup does: stamp, pick, reward, confirm or new", () => {
    const one = { items: [member()], normalizedPhone: null };
    expect(lookupOutcome(one, stamps)).toBe("stamp");
    expect(lookupOutcome(one, confirmStamps)).toBe("confirm");
    expect(lookupOutcome(one, { ...perDollar, counterAutoStamp: true })).toBe("confirm");
    expect(lookupOutcome({ items: [member(), member({ memberId: "2" })], normalizedPhone: null }, stamps)).toBe("pick");
    // A ready reward is never stamped blindly, whatever the setting.
    expect(lookupOutcome({ items: [member({ balance: 11 })], normalizedPhone: null }, stamps)).toBe("reward");
    expect(lookupOutcome({ items: [member({ rewardsAffordable: [{ id: "r", name: "Free drink", pointsCost: 10 }] })], normalizedPhone: null }, stamps)).toBe("reward");
    expect(lookupOutcome({ items: [], normalizedPhone: "+16475550199" }, stamps)).toBe("new");
    expect(lookupOutcome({ items: [], normalizedPhone: null }, stamps)).toBe("none");
    expect(isRewardReady(member({ balance: 10 }), stamps)).toBe(true);
    expect(isRewardReady(member({ balance: 9 }), stamps)).toBe(false);
  });
  it("words the frames' text", () => {
    expect(matchesHeading(2, "1034")).toBe("Two members end in 1034");
    expect(visitThisMonth(5)).toBe("5th visit this month");
    expect(visitThisMonth(1)).toBe("1st visit this month");
    expect(stampsLeft(2, "Free drink")).toBe("2 more for a free drink");
    expect(stampsLeft(0, "Free drink")).toBe("Free drink ready");
    const now = new Date("2026-10-23T15:00:00Z");
    expect(cameInText("2026-10-22T15:00:00Z", now)).toBe("in yesterday");
    expect(cameInText("2026-10-09T15:00:00Z", now)).toBe("in 2 weeks ago");
    expect(cameInText(null, now)).toBe("new member");
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("<CounterApp> stamp on tap", () => {
  it("shows regulars not yet in today and stamps one with a single tap", async () => {
    const api = mockApi();
    const priya = member({ memberId: "22222222-2222-2222-2222-222222222222", name: "Priya Shah" });
    api.regulars.mockResolvedValue({ items: [priya, member({ memberId: "33333333-3333-3333-3333-333333333333", name: "Omar Ali" })] });
    render(<CounterApp api={api} program={stamps} shopName="Pinecone Coffee" locations={[{ id: "loc1", name: "Main" }]} />);
    const tap = await screen.findByRole("button", { name: "Stamp Priya Shah" });
    expect(screen.getByRole("button", { name: "Stamp Omar Ali" })).toBeTruthy();
    await userEvent.click(tap);
    await waitFor(() => expect(api.award).toHaveBeenCalledTimes(1));
    expect(api.award.mock.calls[0]![0]).toMatchObject({ memberId: priya.memberId });
    expect(api.lookup).not.toHaveBeenCalled();
  });

  it("opens the card instead when Stamp on scan is off, and shows no row for per-dollar shops", async () => {
    const api = mockApi();
    api.regulars.mockResolvedValue({ items: [member({ name: "Priya Shah" })] });
    const { unmount } = render(<CounterApp api={api} program={confirmStamps} shopName="Shop" locations={[]} />);
    expect(await screen.findByRole("button", { name: "Open Priya Shah" })).toBeTruthy();
    unmount();
    render(<CounterApp api={api} program={perDollar} shopName="Shop" locations={[]} />);
    await waitFor(() => expect(api.regulars).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Priya Shah/ })).toBeNull();
  });
});

describe("<CounterApp> scan first", () => {
  it("stamps with no further tap when the 4th digit matches one member, and shows Undo for 10 s", async () => {
    const api = mockApi();
    render(<CounterApp api={api} program={stamps} shopName="Pinecone Coffee" locations={[{ id: "loc1", name: "Main" }]} />);
    expect(screen.getByText("Hold the card up")).toBeTruthy();
    await type4();
    expect(await screen.findByRole("heading", { name: "Pat Quinn" })).toBeTruthy();
    expect(api.lookup).toHaveBeenCalledTimes(1);
    expect(api.lookup).toHaveBeenCalledWith("0123");
    // Exactly one award, with an idempotency key, and no Find press anywhere.
    expect(api.award).toHaveBeenCalledTimes(1);
    const [body, key] = api.award.mock.calls[0]!;
    expect(body).toMatchObject({ memberId: member().memberId, locationId: "loc1" });
    expect((body as { amountCents?: number }).amountCents).toBeUndefined();
    expect(key).toMatch(/^counter-/);
    expect(screen.getByText("5th visit this month")).toBeTruthy();
    expect(screen.getByText(/Undo \d+s/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Undo \d+s/ }));
    await waitFor(() => expect(api.undo).toHaveBeenCalledWith("tx1"));
    expect(api.award).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Hold the card up")).toBeTruthy();
  });

  it("returns to scan after 3 seconds and keeps the Undo toast", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = mockApi();
    render(<CounterApp api={api} program={stamps} shopName="Shop" locations={[]} />);
    await type4();
    await screen.findByText("Returns to scan in 3 seconds");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(screen.getByText("Hold the card up")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Undo \d+s/ })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7500);
    });
    expect(screen.queryByRole("button", { name: /Undo \d+s/ })).toBeNull();
  });

  it("with Stamp on scan off, one match asks for one confirm tap", async () => {
    const api = mockApi();
    render(<CounterApp api={api} program={confirmStamps} shopName="Shop" locations={[]} />);
    await type4();
    expect(await screen.findByRole("heading", { name: "Pat Quinn" })).toBeTruthy();
    expect(api.award).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Add 1 stamp" }));
    await waitFor(() => expect(api.award).toHaveBeenCalledTimes(1));
  });

  it("shows two matches and awards exactly one stamp on the tapped row", async () => {
    const api = mockApi();
    const emma = member({ memberId: "22222222-2222-2222-2222-222222222222", name: "Emma Wong", maskedPhone: "(647) ***-1034", balance: 7, lastVisitAt: new Date(Date.now() - 86_400_000).toISOString() });
    const daniel = member({ memberId: "33333333-3333-3333-3333-333333333333", name: "Daniel Singh", maskedPhone: "(416) ***-1034", balance: 3, lastVisitAt: new Date(Date.now() - 14 * 86_400_000).toISOString() });
    api.lookup.mockResolvedValueOnce({ matchedBy: "last4", items: [emma, daniel], normalizedPhone: null });
    render(<CounterApp api={api} program={stamps} shopName="Shop" locations={[]} />);
    await type4("1034");
    expect(await screen.findByRole("heading", { name: "Two members end in 1034" })).toBeTruthy();
    expect(screen.getByText("(647) ···-1034")).toBeTruthy();
    expect(screen.getByText(/7 of 10 · in yesterday/)).toBeTruthy();
    expect(api.award).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Stamp Daniel Singh" }));
    await waitFor(() => expect(api.award).toHaveBeenCalledTimes(1));
    expect(api.award.mock.calls[0]![0]).toMatchObject({ memberId: daniel.memberId });
  });

  it("offers Redeem or Stamp instead when the reward is ready, and never stamps on lookup", async () => {
    const api = mockApi();
    const ready = member({ name: "Fatima Tremblay", balance: 11, rewardsAffordable: [{ id: "r1", name: "Free drink", pointsCost: 10 }] });
    api.lookup.mockResolvedValue({ matchedBy: "last4", items: [ready], normalizedPhone: null });
    api.redeem.mockResolvedValueOnce({
      redemption: { id: "d1", code: "K74Q", status: "used", discountCents: null, reward: { id: "r1", name: "Free drink", pointsCost: 10, rewardType: "free_item", value: 0 }, transactionId: "tx9", createdAt: "", usedAt: "" },
      member: member({ balance: 1 }),
      duplicate: false,
    });
    render(<CounterApp api={api} program={stamps} shopName="Shop" locations={[]} />);
    await type4();
    expect(await screen.findByText("Reward ready")).toBeTruthy();
    expect(screen.getByText(/1 carries over after redeeming/)).toBeTruthy();
    expect(api.award).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Redeem free drink" }));
    await waitFor(() => expect(api.redeem).toHaveBeenCalledTimes(1));
    expect(api.redeem.mock.calls[0]![0]).toMatchObject({ memberId: ready.memberId, rewardId: "r1" });
    expect(api.award).not.toHaveBeenCalled();
  });

  it("stamps instead on purpose and keeps the reward", async () => {
    const api = mockApi();
    api.lookup.mockResolvedValue({ matchedBy: "last4", items: [member({ balance: 10, rewardsAffordable: [{ id: "r1", name: "Free drink", pointsCost: 10 }] })], normalizedPhone: null });
    render(<CounterApp api={api} program={stamps} shopName="Shop" locations={[]} />);
    await type4();
    await userEvent.click(await screen.findByRole("button", { name: "Stamp instead, keep the reward" }));
    await waitFor(() => expect(api.award).toHaveBeenCalledTimes(1));
    expect(api.redeem).not.toHaveBeenCalled();
  });

  it("reads a USB scanner payload and stamps once", async () => {
    const api = mockApi();
    render(<CounterApp api={api} program={stamps} shopName="Shop" locations={[]} />);
    await userEvent.keyboard("LL:K7QX2M9P{Enter}");
    await waitFor(() => expect(api.award).toHaveBeenCalledTimes(1));
    expect(api.lookup).toHaveBeenCalledWith("LL:K7QX2M9P");
    expect(api.lookup).toHaveBeenCalledTimes(1);
  });

  it("awards a typed amount on per-dollar programs after one confirm", async () => {
    const api = mockApi();
    render(<CounterApp api={api} program={{ ...perDollar, counterAutoStamp: true }} shopName="Shop" locations={[]} />);
    await type4();
    await screen.findByRole("heading", { name: "Pat Quinn" });
    expect(api.award).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("1250");
    expect(screen.getByLabelText("Purchase amount").textContent).toBe("$12.50");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(api.award).toHaveBeenCalled());
    expect(api.award.mock.calls[0]![0]).toMatchObject({ amountCents: 1250 });
  });

  it("never loses an award: a network error saves it on the device and Retry now resends the same key", async () => {
    localStorage.clear();
    const api = mockApi();
    api.award.mockRejectedValueOnce(ApiError.network());
    render(<CounterApp api={api} program={stamps} shopName="Shop" locations={[]} queueKey="test.queue" />);
    await type4();
    expect((await screen.findAllByText(/Saved on this device/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 waiting to send/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("test.queue")!)).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Retry now" }));
    await waitFor(() => expect(api.award).toHaveBeenCalledTimes(2));
    expect(api.award.mock.calls[0]![1]).toBe(api.award.mock.calls[1]![1]);
    await waitFor(() => expect(JSON.parse(localStorage.getItem("test.queue")!)).toHaveLength(0));
  });

  it("a second scan inside the cooldown says so and does not stamp again", async () => {
    const api = mockApi();
    api.award.mockRejectedValueOnce(new ApiError(409, "cooldown", "Too soon", undefined));
    render(<CounterApp api={api} program={stamps} shopName="Shop" locations={[]} />);
    await type4();
    expect(await screen.findByText(/Pat already got stamps for this visit/)).toBeTruthy();
    expect(api.award).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Hold the card up")).toBeTruthy();
  });

  it("with no member for the digits, offers Add as a new member with an unticked consent box", async () => {
    const api = mockApi();
    api.lookup.mockResolvedValueOnce({ matchedBy: "last4", items: [], normalizedPhone: null });
    render(<CounterApp api={api} program={stamps} shopName="Pinecone Coffee" locations={[]} />);
    await type4("9999");
    expect(await screen.findByText("No one ends in 9999")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add as a new member" }));
    await userEvent.type(screen.getByLabelText("Mobile number"), "6475550199");
    const consent = screen.getByLabelText(/Send me offers from Pinecone Coffee/) as HTMLInputElement;
    expect(consent.checked).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Add and award" }));
    await waitFor(() => expect(api.award).toHaveBeenCalled());
    expect(api.award.mock.calls[0]![0]).toMatchObject({ phone: "+16475550199" });
    expect((api.award.mock.calls[0]![0] as { consent?: unknown }).consent).toBeUndefined();
  });

  it("moves the code entry to a footer link", async () => {
    const api = mockApi();
    render(<CounterApp api={api} program={stamps} shopName="Shop" locations={[]} />);
    expect(screen.queryByText("Verify code")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Redeem a code" }));
    expect(screen.getByLabelText("Reward code")).toBeTruthy();
  });

  it("signs in a staff member with a 4-digit PIN and makes the next calls as them", async () => {
    const api = mockApi();
    const asSam = mockApi();
    const verify = vi.fn(async () => ({ accessToken: "tok-sam", accessTokenExpiresAt: "", staff: { userId: "u-sam", name: "Sam Barista", role: "staff" as const } }));
    const apiAs = vi.fn(() => asSam);
    render(<CounterApp api={api} program={stamps} shopName="Shop" locations={[]} pin={{ verify, apiAs }} signedInName="Sofia Patel" />);
    await userEvent.click(screen.getByRole("button", { name: /sign in with a PIN/i }));
    await type4("2468");
    await waitFor(() => expect(verify).toHaveBeenCalledWith({ pin: "2468" }));
    await waitFor(() => expect(apiAs).toHaveBeenCalledWith("tok-sam"));
    await screen.findByRole("button", { name: /Stamping as Sam Barista/ });
    await type4();
    await waitFor(() => expect(asSam.award).toHaveBeenCalledTimes(1));
    expect(api.award).not.toHaveBeenCalled();
  });
});
