import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { customerApi, networkApi } from "@ll/shared";
import { JoinFlow, type JoinDeps } from "@/components/pass/JoinFlow";
import { ApiError } from "@/lib/api/errors";

const program: customerApi.ProgramSummaryDto = {
  name: "Coffee card", earnType: "stamps", terminology: "stamps", pointsPerDollar: 0, pointsPerVisit: 1, minSpendCents: 0, stampGoal: 10,
  welcomeBonus: 1, birthdayBonus: 0, referralBonus: 2, expiryMonths: null, expiryDisclosure: "Stamps never expire.", termsText: null,
};
const merchant = { id: "m1", slug: "pinecone-coffee", name: "Pinecone Coffee Co.", vertical: "cafe", logoUrl: null, brandColor: null, neighbourhoodId: "n1" };
const info: networkApi.JoinInfoResponse = {
  qrCode: "RONCY01",
  merchant,
  location: { id: "l1", name: "Pinecone Coffee Co.", address: "123 Roncesvalles Ave", city: "Toronto", postalCode: "M6R 2K9", lat: 43.64, lng: -79.45, phone: "+14165553000", hours: null, openNow: null },
  program,
  rewards: [],
  consentText: "server suggested text",
};
const membership = (balance: number): customerApi.MembershipDto => ({
  id: "mm1", merchant, balance, lifetimePoints: balance, visitCount: 0, lastVisitAt: null, joinedAt: "", terminology: "stamps", program,
  expiryDisclosure: "Stamps never expire.", nextReward: { rewardId: "r1", name: "Free drink", pointsCost: 10, pointsNeeded: 10 - balance, progressPct: balance * 10 },
  rewardsAvailableCount: 0, vip: null, muted: false, marketingConsent: { granted: false, grantedAt: null, text: null, source: null },
});
const user = (name: string | null) => ({ id: "u1", name, email: null, phone: "+14165550123", platformRole: "none" as const, memberCode: "K7QX2M9P", phoneVerified: true, emailVerified: false, birthday: null, postalCode: null, homeNeighbourhoodId: null, locale: "en-CA", createdAt: "" });

function makeDeps(over: Partial<JoinDeps> = {}): JoinDeps {
  return {
    otpStart: vi.fn(async () => ({ sent: true as const, expiresInSeconds: 600, devCode: "654321" })),
    joinStart: vi.fn(async () => ({ sent: true as const, expiresInSeconds: 600, devCode: "123456", next: { verify: "POST /v1/auth/otp/verify" as const, join: "POST /v1/me/memberships" as const, locationQrCode: "RONCY01" } })),
    verifyOtp: vi.fn(async () => ({ user: user(null), created: true })),
    updateName: vi.fn(async () => ({})),
    join: vi.fn(async () => ({ membership: membership(1), created: true, bonusPoints: 1, referral: null })),
    card: vi.fn(async () => ({ memberCode: "K7QX2M9P", qrPayload: "LL:K7QX2M9P", qrSvg: "<svg></svg>", name: "Alex" })),
    wallet: vi.fn(async () => ({ summary: { memberCode: "K7QX2M9P", qrValue: "LL:K7QX2M9P", name: null, shopCount: 1, totalPoints: 1, shops: [] }, apple: { available: false, downloadUrl: null, reason: "not configured" }, google: { available: false, saveUrl: null, reason: "not configured" } })),
    googleWallet: vi.fn(async () => ({ saveUrl: "https://pay.google.com/gp/v/save/x" })),
    nearby: vi.fn(async () => ({ items: [], nextCursor: null })),
    ...over,
  };
}

const CONSENT = "Send me offers and news from Pinecone Coffee Co. by text and email. I can unsubscribe anytime.";

async function enterPhone(digits = "4165550123") {
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: digits } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Text me a code" }));
  });
}

describe("<JoinFlow> (counter QR join)", () => {
  it("phone → code (dev autofill) → name + unticked consent → join with QR + referral", async () => {
    const deps = makeDeps();
    render(<JoinFlow info={info} deps={deps} referralCode="REF12345" devAutofill />);
    expect(screen.getByRole("heading", { name: "Join in 30 seconds" })).toBeTruthy();
    expect(screen.getByText("Join and get 1 free stamp")).toBeTruthy();

    await enterPhone();
    expect(deps.joinStart).toHaveBeenCalledWith("RONCY01", { phone: "+14165550123" });
    const code = screen.getByLabelText("6-digit code") as HTMLInputElement;
    expect(code.value).toBe("123456");
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    expect(deps.verifyOtp).toHaveBeenCalledWith({ phone: "+14165550123", code: "123456" });

    // CASL: exact ux-copy wording, never pre-ticked.
    const consent = screen.getByLabelText(CONSENT) as HTMLInputElement;
    expect(consent.checked).toBe(false);
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Alex" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join Pinecone Coffee Co." }));
    });
    expect(deps.updateName).toHaveBeenCalledWith("Alex");
    expect(deps.join).toHaveBeenCalledWith({ locationQrCode: "RONCY01", referralCode: "REF12345" });
    await waitFor(() => expect(screen.getByText("You're in, Alex.")).toBeTruthy());
    expect(screen.getByText("Add to Apple Wallet")).toBeTruthy();
    await waitFor(() => expect(deps.card).toHaveBeenCalled());
  });

  it("sends the exact consent text only when ticked", async () => {
    const deps = makeDeps();
    render(<JoinFlow info={info} deps={deps} devAutofill />);
    await enterPhone();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByLabelText(CONSENT));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join Pinecone Coffee Co." }));
    });
    expect(deps.join).toHaveBeenCalledWith({ locationQrCode: "RONCY01", consent: { text: CONSENT } });
  });

  it("validates the phone before calling the API", async () => {
    const deps = makeDeps();
    render(<JoinFlow info={info} deps={deps} />);
    await enterPhone("416555");
    expect(deps.joinStart).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a 10-digit mobile number.")).toBeTruthy();
  });

  it("shows the wrong-code error with attempts left and clears the boxes", async () => {
    const deps = makeDeps({ verifyOtp: vi.fn(async () => Promise.reject(new ApiError(400, "invalid_code", "Wrong code", { attemptsLeft: 3 }))) });
    render(<JoinFlow info={info} deps={deps} devAutofill />);
    await enterPhone();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("That code didn't match. Try again. 3 tries left.");
    expect((screen.getByLabelText("6-digit code") as HTMLInputElement).value).toBe("");
  });

  it("returning members skip straight to joined", async () => {
    const deps = makeDeps({ verifyOtp: vi.fn(async () => ({ user: user("Riley Chen"), created: false })), join: vi.fn(async () => ({ membership: membership(4), created: false, bonusPoints: 0, referral: null })) });
    render(<JoinFlow info={info} deps={deps} devAutofill />);
    await enterPhone();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    expect(deps.join).toHaveBeenCalledWith({ locationQrCode: "RONCY01" });
    await waitFor(() => expect(screen.getByText("You're in, Riley.")).toBeTruthy());
    expect(screen.queryByLabelText("First name")).toBeNull();
  });

  it("rate limit shows a warning banner", async () => {
    const deps = makeDeps({ joinStart: vi.fn(async () => Promise.reject(new ApiError(429, "rate_limited", "Too many"))) });
    render(<JoinFlow info={info} deps={deps} />);
    await enterPhone();
    expect(screen.getByText("Too many tries. Try again in 10 minutes.")).toBeTruthy();
  });

  it("shop page joins use phone OTP + merchantId", async () => {
    const deps = makeDeps();
    render(<JoinFlow info={{ ...info, qrCode: "" }} merchantId="m1" deps={deps} devAutofill showHeader={false} />);
    await enterPhone();
    expect(deps.otpStart).toHaveBeenCalledWith("+14165550123");
    expect(deps.joinStart).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Jo" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join Pinecone Coffee Co." }));
    });
    expect(deps.join).toHaveBeenCalledWith({ merchantId: "m1" });
  });

  it("signed-in visitors start at name + consent", () => {
    render(<JoinFlow info={info} deps={makeDeps()} signedIn signedInName="Alex Chen" />);
    expect(screen.getByRole("heading", { name: "Welcome back, Alex." })).toBeTruthy();
    expect(screen.queryByLabelText("Mobile number")).toBeNull();
  });
});
