import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    wallet: vi.fn(async () => ({ summary: { memberCode: "K7QX2M9P", qrValue: "LL:K7QX2M9P", name: null, shopCount: 1, totalPoints: 1, shops: [] }, apple: { available: true, downloadUrl: "https://example.com/p.pkpass", reason: null }, google: { available: false, saveUrl: null, reason: "not configured" } })),
    googleWallet: vi.fn(async () => ({ saveUrl: "https://pay.google.com/gp/v/save/x" })),
    shopWallet: vi.fn(async (merchantId: string) => ({ merchantId, apple: { available: true, url: "https://example.com/card.pkpass", added: false }, google: { available: false, url: null, added: false } })),
    nearby: vi.fn(async () => ({ items: [], nextCursor: null })),
    ...over,
  };
}

const CONSENT = "Text me offers from Pinecone Coffee Co. (optional). Not ticked for you. Reply STOP any time. Your stamps work either way.";

async function enterPhone(digits = "4165550123") {
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: digits } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Text me a code" }));
  });
}

describe("<JoinFlow> (counter QR join)", () => {
  // The flow keeps the number and step in sessionStorage so a refresh does not lose them; every test starts clean.
  beforeEach(() => window.sessionStorage.clear());

  it("phone → code (dev autofill) → name + unticked consent → join with QR + referral", async () => {
    const deps = makeDeps();
    render(<JoinFlow info={info} deps={deps} referralCode="REF12345" devAutofill />);
    expect(screen.getByRole("heading", { name: "get a stamp for today’s coffee" })).toBeTruthy();
    expect(screen.getByText("No app needed.")).toBeTruthy();
    // CASL: the canvas wording, optional, never pre-ticked, offered before the code is sent.
    const consent = screen.getByLabelText(CONSENT) as HTMLInputElement;
    expect(consent.checked).toBe(false);

    await enterPhone();
    expect(deps.joinStart).toHaveBeenCalledWith("RONCY01", { phone: "+14165550123" });
    const code = screen.getByLabelText("6-digit code") as HTMLInputElement;
    expect(code.value).toBe("123456");
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    expect(deps.verifyOtp).toHaveBeenCalledWith({ phone: "+14165550123", code: "123456" });

    fireEvent.change(screen.getByLabelText("First name (optional)"), { target: { value: "Alex" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join Pinecone Coffee Co." }));
    });
    expect(deps.updateName).toHaveBeenCalledWith("Alex");
    expect(deps.join).toHaveBeenCalledWith({ locationQrCode: "RONCY01", referralCode: "REF12345" });
    await waitFor(() => expect(screen.getByText("You’re in, Alex.")).toBeTruthy());
    // Join success is the pass in the shop's colour: "You're in" on the card, the welcome stamp filled, the reward slot accented.
    const pass = screen.getByTestId("joined-pass");
    expect(pass.className).toContain("bg-trade");
    expect(pass.contains(screen.getByText("You’re in, Alex."))).toBe(true);
    expect(pass.textContent).toContain("1 / 10");
    // The shop's own card: Apple only (Google isn't configured in this mock), plus the open-on-your-phone QR on a computer.
    await waitFor(() => expect(screen.getByRole("button", { name: "Add to Apple Wallet" })).toBeTruthy());
    expect(deps.shopWallet).toHaveBeenCalledWith(merchant.id);
    expect(screen.queryByRole("button", { name: "Add to Google Wallet" })).toBeNull();
    await waitFor(() => expect(deps.card).toHaveBeenCalled());
  });

  it("sends the exact consent text only when ticked", async () => {
    const deps = makeDeps();
    render(<JoinFlow info={info} deps={deps} devAutofill />);
    fireEvent.click(screen.getByLabelText(CONSENT));
    await enterPhone();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    fireEvent.change(screen.getByLabelText("First name (optional)"), { target: { value: "Sam" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join Pinecone Coffee Co." }));
    });
    expect(deps.join).toHaveBeenCalledWith({ locationQrCode: "RONCY01", consent: { text: CONSENT } });
  });

  it("joins with the first name left blank (it is optional) and never saves an empty name", async () => {
    const deps = makeDeps();
    render(<JoinFlow info={info} deps={deps} devAutofill />);
    await enterPhone();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join Pinecone Coffee Co." }));
    });
    expect(deps.updateName).not.toHaveBeenCalled();
    expect(deps.join).toHaveBeenCalledWith({ locationQrCode: "RONCY01" });
    await waitFor(() => expect(deps.card).toHaveBeenCalled());
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
    expect(screen.getByRole("alert").textContent).toBe("That code didn’t match. Try again. 3 tries left.");
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
    // A returning member is welcomed back, not told they just joined.
    await waitFor(() => expect(screen.getByText("Welcome back, Riley.")).toBeTruthy());
    expect(screen.queryByText(/You’re in/)).toBeNull();
    expect(screen.queryByLabelText("First name (optional)")).toBeNull();
  });

  it("an existing member who scans again opens on their card, never on Join", async () => {
    const deps = makeDeps();
    render(<JoinFlow info={info} deps={deps} signedIn signedInName="Ayesha Khan" member={membership(8)} />);
    expect(screen.getByText("Welcome back, Ayesha.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Join / })).toBeNull();
    expect(deps.join).not.toHaveBeenCalled();
  });

  it("keeps the six digits for a server fault and clears them for a wrong code", async () => {
    const verifyOtp = vi.fn().mockRejectedValueOnce(new ApiError(500, "internal", "boom")).mockRejectedValueOnce(new ApiError(400, "invalid_code", "That code is wrong"));
    const deps = makeDeps({ verifyOtp });
    render(<JoinFlow info={info} deps={deps} devAutofill />);
    await enterPhone();
    const code = screen.getByLabelText("6-digit code") as HTMLInputElement;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    expect((screen.getByLabelText("6-digit code") as HTMLInputElement).value).toBe("123456");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    expect((screen.getByLabelText("6-digit code") as HTMLInputElement).value).toBe("");
    expect(code).toBeTruthy();
  });

  it("the same number after Change does not ask for a second text", async () => {
    const deps = makeDeps();
    render(<JoinFlow info={info} deps={deps} devAutofill />);
    await enterPhone();
    expect(deps.joinStart).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Text me a code" })).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Text me a code" }));
    });
    expect(deps.joinStart).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("6-digit code")).toBeTruthy();
  });

  it("a refresh on the code step comes back to the code step with the number kept", async () => {
    const deps = makeDeps();
    const first = render(<JoinFlow info={info} deps={deps} devAutofill />);
    await enterPhone();
    expect(screen.getByLabelText("6-digit code")).toBeTruthy();
    first.unmount();
    render(<JoinFlow info={info} deps={makeDeps()} devAutofill />);
    await waitFor(() => expect(screen.getByLabelText("6-digit code")).toBeTruthy());
    expect(screen.getByText(/\(416\) 555-0123/)).toBeTruthy();
  });

  it("says so and offers Try again when the card cannot load", async () => {
    const card = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue({ memberCode: "K7QX2M9P", qrPayload: "LL:K7QX2M9P", qrSvg: "<svg></svg>", name: "Alex" });
    const deps = makeDeps({ card });
    render(<JoinFlow info={info} deps={deps} signedIn signedInName="Alex Doe" member={membership(2)} />);
    await waitFor(() => expect(screen.getByText(/couldn’t load your code/i)).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(card).toHaveBeenCalledTimes(2);
  });

  it("rate limit shows a warning banner", async () => {
    const deps = makeDeps({ joinStart: vi.fn(async () => Promise.reject(new ApiError(429, "rate_limited", "Too many"))) });
    render(<JoinFlow info={info} deps={deps} />);
    await enterPhone();
    expect(screen.getByText("Too many tries. Wait a few minutes, then try again.")).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("First name (optional)"), { target: { value: "Jo" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join Pinecone Coffee Co." }));
    });
    expect(deps.join).toHaveBeenCalledWith({ merchantId: "m1" });
  });

  it("signed-in visitors start at name + consent", () => {
    render(<JoinFlow info={info} deps={makeDeps()} signedIn signedInName="Alex Chen" />);
    expect(screen.getByRole("heading", { name: "Hi Alex. One tap to join." /* wave-p: a signed-in visitor may never have been here */ })).toBeTruthy();
    expect(screen.queryByLabelText("Mobile number")).toBeNull();
  });
});
