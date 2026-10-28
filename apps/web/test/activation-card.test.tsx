import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { merchantApi } from "@ll/shared";

let userLocale = "en";
vi.mock("@/components/dashboard/MerchantContext", () => ({ useMerchant: () => ({ me: { user: { locale: userLocale } } }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { ActivationCard } from "@/components/dashboard/onboarding/ActivationCard";

const checklist = (members = 14): merchantApi.OnboardingChecklist =>
  ({
    steps: [{ key: "qr", label: "Print your QR", done: false, detail: null }],
    later: [{ key: "logo", label: "Add your logo", done: false, detail: null }],
    currentStep: "qr",
    percentComplete: 20,
    activeMembers: members,
    activationTarget: 25,
    activatedAt: null,
    activation: {
      windowDays: 30, day: 6, daysLeft: 24, members, target: 25, leadingMembers: 12, leadingByDay: 7, pace: "on_track", paceLabel: "On pace",
      firstStampMinutes: 12,
      milestones: [
        { key: "signed_up", label: "Signed up", at: "2026-10-01T00:00:00Z", detail: "Day 0" },
        { key: "first_stamp", label: "First stamp", at: null, detail: "Not yet" },
      ],
      sources: [{ source: "qr", label: "QR code", count: 3 }],
      nextMove: { title: "Next", body: "Stamp yourself", cta: "Do it", path: "/setup" },
    },
    playbook: {} as never,
    upsell: {} as never,
    nudgesOn: true,
  }) as unknown as merchantApi.OnboardingChecklist;

describe("ActivationCard", () => {
  it("keeps the English words the e2e specs look for", () => {
    userLocale = "en";
    render(<ActivationCard c={checklist()} base="/m/1" />);
    expect(screen.getByRole("region", { name: "Your first 30 days" })).toBeTruthy();
    expect(screen.getByText("14 of 25 customers have visited")).toBeTruthy();
    expect(screen.getByText("Where customers came from")).toBeTruthy();
    expect(screen.getByText("12 customers by day 7 keeps you on track for 25")).toBeTruthy();
    expect(screen.getByText("Setup left")).toBeTruthy();
  });

  it("writes the static words in the owner's language (users.locale)", () => {
    userLocale = "hi-IN";
    render(<ActivationCard c={checklist()} base="/m/1" />);
    expect(screen.getByRole("region", { name: "आपके पहले 30 दिन" })).toBeTruthy();
    expect(screen.getByText("ग्राहक कहाँ से आए")).toBeTruthy();
    expect(screen.queryByText("Where customers came from")).toBeNull();
  });

  it("is right to left for Urdu", () => {
    userLocale = "ur";
    const { container } = render(<ActivationCard c={checklist(1)} base="/m/1" />);
    expect(container.querySelector("section")?.getAttribute("dir")).toBe("rtl");
  });
});
