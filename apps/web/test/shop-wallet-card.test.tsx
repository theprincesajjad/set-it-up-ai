import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { walletApi } from "@ll/shared";
import { isIosSafari, ShopWalletCard, walletOs } from "@/components/pass/ShopWalletCard";
import { googleBadgeSrc } from "@/components/pass/WalletButtons";
import { stripUrl } from "@/components/dashboard/wallet/WalletCardPreviews";

const status = (apple: boolean, google: boolean, added: Partial<Record<"apple" | "google", boolean>> = {}): walletApi.ShopWalletResponse => ({
  merchantId: "m1",
  apple: { available: apple, url: apple ? "https://api.example/v1/wallet/apple/shop-download?token=t" : null, added: !!added.apple },
  google: { available: google, url: google ? "https://pay.google.com/gp/v/save/jwt" : null, added: !!added.google },
});

const card = (os: "ios" | "android" | "other", s: walletApi.ShopWalletResponse | Error) => {
  const load = vi.fn(async () => {
    if (s instanceof Error) throw s;
    return s;
  });
  render(<ShopWalletCard merchantId="m1" shopName="Pinecone Coffee" slug="pinecone" terminology="stamps" load={load} os={os} />);
  return load;
};

describe("<ShopWalletCard> (the add-to-wallet moment)", () => {
  it("iPhone: Apple only", async () => {
    card("ios", status(true, true));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add to Apple Wallet" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Add to Google Wallet" })).toBeNull();
    expect(screen.queryByTestId("wallet-desktop-qr")).toBeNull();
    expect(screen.getByText("Keep Pinecone Coffee in your wallet")).toBeTruthy();
  });

  it("Android: Google only, with Google's official button artwork", async () => {
    card("android", status(true, true));
    const g = await screen.findByRole("button", { name: "Add to Google Wallet" });
    expect(g.querySelector("img")!.getAttribute("src")).toBe("/wallet-badges/add-to-google-wallet-en-CA.svg");
    expect(screen.queryByRole("button", { name: "Add to Apple Wallet" })).toBeNull();
  });

  it("computer: both, and a QR that opens this shop on the phone", async () => {
    card("other", status(true, true));
    await screen.findByRole("button", { name: "Add to Apple Wallet" });
    expect(screen.getByRole("button", { name: "Add to Google Wallet" })).toBeTruthy();
    expect(screen.getByTestId("wallet-desktop-qr")).toBeTruthy();
    expect(screen.getByRole("img", { name: "QR code that opens this page on your phone" })).toBeTruthy();
  });

  it("no credentials: one 'coming soon' line, no buttons; not a member: nothing", async () => {
    card("ios", status(false, false));
    expect(await screen.findByTestId("wallet-coming-soon")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Wallet/ })).toBeNull();
  });

  it("hides a wallet the server can't issue, and says when the card is already in the wallet", async () => {
    card("other", status(false, true, { google: true }));
    await screen.findByRole("button", { name: "Add to Google Wallet" });
    expect(screen.queryByRole("button", { name: "Add to Apple Wallet" })).toBeNull();
    expect(screen.getByTestId("wallet-added").textContent).toContain("In your Google Wallet");
  });

  it("a 404 (not a member) renders nothing", async () => {
    const load = card("ios", new Error("404"));
    await waitFor(() => expect(load).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("shop-wallet")).toBeNull());
    expect(screen.queryByTestId("wallet-coming-soon")).toBeNull();
  });
});

describe("platform detection and badges", () => {
  it("iPhone, iPad (iPadOS says Macintosh), Android, computer", () => {
    expect(walletOs({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Version/18.0 Mobile Safari/604.1", maxTouchPoints: 5 })).toBe("ios");
    expect(walletOs({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit Version/18.0 Safari/605.1.15", maxTouchPoints: 5 })).toBe("ios");
    expect(walletOs({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit Version/18.0 Safari/605.1.15", maxTouchPoints: 0 })).toBe("other");
    expect(walletOs({ userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/130 Mobile Safari/537.36", maxTouchPoints: 5 })).toBe("android");
    expect(isIosSafari("Mozilla/5.0 (iPhone) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(true);
    expect(isIosSafari("Mozilla/5.0 (iPhone) Instagram 300 Mobile/15E148 Safari/604.1")).toBe(false);
  });

  it("Google: Urdu has its own button; Hindi and Punjabi use English (Google ships none)", () => {
    expect(googleBadgeSrc("ur")).toBe("/wallet-badges/add-to-google-wallet-ur.svg");
    expect(googleBadgeSrc("hi")).toBe("/wallet-badges/add-to-google-wallet-en-CA.svg");
    expect(googleBadgeSrc("pa")).toBe("/wallet-badges/add-to-google-wallet-en-CA.svg");
  });

  it("the preview's strip is the API's image for the same counts and colours", () => {
    expect(stripUrl({ kind: "stamps", filled: 4, goal: 6, colors: { background: "#1F6F4A", foreground: "#FFFFFF", label: "#C0D8CC" } }, "https://api.example")).toBe("https://api.example/v1/wallet/strip.png?k=stamps&n=4&g=6&bg=1F6F4A&fg=FFFFFF");
  });
});
