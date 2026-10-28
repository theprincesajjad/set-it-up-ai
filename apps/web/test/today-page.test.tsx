import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { FeatureKey } from "@ll/shared";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const today = {
  today: { visits: 86, typicalVisitsFullDay: 120, typicalVisitsSoFar: 77, newMembers: 3, newViaQr: 2, stampsGiven: 142, redemptions: 9, regularsSeen: 5, regularsTotal: 20 },
  yesterday: { visits: 0, typicalVisits: 0, newMembers: 0, newViaQr: 0 },
  rewardsWaiting: { count: 2, goal: 10, members: [] },
  slipping: { count: 4, canText: 3, members: [] },
  promoWindow: null,
  hourly: { hours: [], typical: [], today: [] },
  staff: [],
};
const api = {
  reports: { today: vi.fn(async () => today) },
  onboarding: vi.fn(async () => ({ steps: [{ key: "profile", label: "Logo, about text and GST/HST", done: false }, { key: "program", label: "Program", done: true }], activatedAt: "2026-10-01", activation: { day: 40, windowDays: 30 }, upsell: { moment: "none" }, activeMembers: 40 })),
  orders: vi.fn(async () => ({ items: [], nextCursor: null })),
  street: vi.fn(async () => ({ onMap: true, open: true })),
  counter: { today: vi.fn(async () => ({ visitCount: 3, newMembers: 1 })) },
};
let role = "owner";
const enabledKeys = new Set<FeatureKey>(["marketing.sms"]);
vi.mock("@/components/dashboard/MerchantContext", () => ({
  useMerchant: () => ({
    api,
    base: "/m/1",
    role,
    me: { user: { name: "Sam Lee", locale: "en" } },
    detail: { merchant: { vertical: "cafe", name: "Corner Bean" }, locations: [{ address: "412 Dufferin St", name: "Main" }], program: { terminology: "stamps" } },
    features: { plan: "free", features: [] },
    enabled: (k: FeatureKey) => enabledKeys.has(k),
  }),
}));

import { TodayPage } from "@/components/dashboard/home/TodayPage";

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  // 11:00 in Toronto on Wednesday 28 October; only the clock is faked, so waitFor and fetches keep running.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-28T15:00:00Z") });
});

describe("Today", () => {
  it("renders the four cards in the phone order and has exactly one primary in the header", async () => {
    role = "owner";
    render(<TodayPage />);
    await waitFor(() => expect(screen.getByText("2 customers have a reward waiting")).toBeTruthy());
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 4)).toEqual(["Needs you", "Visits by hour", "Up next", "Quick actions"]);
    // DOM order: Needs you, numbers, Up next, Quick actions
    const all = [...document.querySelectorAll("#needs-you, [aria-label=\"Today's numbers\"], #up-next, #quick-actions")].map((n) => n.id || n.getAttribute("aria-label"));
    expect(all).toEqual(["needs-you", "Today's numbers", "up-next", "quick-actions"]);
    const header = document.querySelector("header")!;
    expect(header.querySelectorAll("[data-primary-action]").length).toBe(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Good morning, Sam");
  });

  it("shows real numbers and rows that open what they name", async () => {
    role = "owner";
    render(<TodayPage />);
    await waitFor(() => expect(screen.getByText("86")).toBeTruthy());
    expect(screen.getByText("+12% vs last Wednesday")).toBeTruthy();
    const slip = screen.getByRole("link", { name: /4 regulars are slipping away/ });
    expect(slip.getAttribute("href")).toBe("/m/1/messages/new?segment=slipping");
  });

  it("gives staff the counter numbers and the one primary", async () => {
    role = "staff";
    render(<TodayPage />);
    await waitFor(() => expect(screen.getByText("Visits so far today")).toBeTruthy());
    expect(screen.queryByText("Needs you")).toBeNull();
    expect(document.querySelectorAll("header [data-primary-action]").length).toBe(1);
  });
});
