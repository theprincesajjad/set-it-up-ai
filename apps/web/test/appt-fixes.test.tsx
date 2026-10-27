import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { appointmentsApi, FeatureKey } from "@ll/shared";
import { NextVisitCard } from "@/components/pass/NextVisitCard";
import { PetLinks } from "@/components/pass/PetLinks";
import { blockLabel } from "@/lib/dashboard/calendar";
import { hoursNote } from "@/lib/dashboard/home";
import { buildMerchantNav } from "@/lib/dashboard/nav";

// next/font only exists inside the Next runtime; the page frame behind useFmt imports it.
vi.mock("next/font/google", () => {
  const font = () => ({ className: "", variable: "", style: {} });
  return { Noto_Naskh_Arabic: font, Noto_Sans_Devanagari: font, Noto_Sans_Gurmukhi: font, Noto_Nastaliq_Urdu: font, Inter: font, Bricolage_Grotesque: font };
});

const nav = (enabled: FeatureKey[], vertical: string) => buildMerchantNav("/m/x", "owner", new Set(enabled), { vertical, plan: "pro" }).map((n) => n.key);

describe("home hours note", () => {
  const hours = { wed: [["09:00", "19:00"]] } as Record<string, [string, string][]>;
  it("says closes while the shop is open and closed once it has shut", () => {
    // 2026-10-28 is a Wednesday. 15:00Z is 11:00 in Toronto; 01:00Z next day is 21:00 the same evening.
    expect(hoursNote(hours, "close", new Date("2026-10-28T19:00:00Z"))).toBe("closes 7:00 pm");
    expect(hoursNote(hours, "close", new Date("2026-10-29T01:00:00Z"))).toBe("closed 7:00 pm");
    expect(hoursNote(hours, "morning", new Date("2026-10-28T11:00:00Z"))).toBe("opens 9:00 am");
  });
});

describe("pet shops' sidebar", () => {
  it("hides the per-service Rebooking page for a pet shop and shows Groom rebooking only with the calendar", () => {
    const on: FeatureKey[] = ["pets.profiles", "service.rebooking", "booking.appointments"];
    expect(nav(on, "pet")).not.toContain("rebooking");
    expect(nav(on, "pet")).toContain("groom-rebooking");
    expect(nav(["pets.profiles", "pets.daycare", "service.rebooking"], "pet")).not.toContain("groom-rebooking");
    // Other trades keep it.
    expect(nav(["service.rebooking", "booking.appointments"], "salon")).toContain("rebooking");
  });
});

const appt = (over: Partial<appointmentsApi.AppointmentDto> = {}) =>
  ({
    id: "a1",
    merchantId: "m",
    locationId: "l",
    customer: { id: "u", name: "Nikos Novak", phone: null, language: "en" },
    staffId: null,
    staffName: "Rae",
    requestedStaff: false,
    source: "online",
    items: [{ serviceId: null, name: "Full groom (medium dog)", durationMin: 90, priceCents: 9000 }],
    startsAt: "2026-11-05T15:00:00Z",
    endsAt: "2026-11-05T16:30:00Z",
    status: "booked",
    ...over,
  }) as appointmentsApi.AppointmentDto;

describe("calendar card for a dog", () => {
  it("names the dog and its owner in the block's spoken label", () => {
    const pet = { id: "p", name: "Biscuit", species: "dog", breed: "Goldendoodle", sizeBand: "medium", coat: "curly", handlingNote: "Clip nails last", vaccines: "current", groomEveryWeeks: 6 } as const;
    expect(blockLabel(appt({ pet }))).toContain("Biscuit, with Nikos Novak");
    expect(blockLabel(appt())).toContain("Nikos Novak");
  });
});

describe("next visit card and add your dog", () => {
  const visit = {
    id: "v1",
    merchant: { id: "m", name: "Pawsh Grooming", slug: "pawsh-grooming", logoUrl: null, brandColor: null, address: "12 Queen St W", phone: null, timezone: "America/Toronto" },
    staffId: null,
    staffName: "Rae",
    items: [{ serviceId: null, name: "Full groom", durationMin: 90, priceCents: 9000 }],
    startsAt: "2026-11-05T15:00:00Z",
    endsAt: "2026-11-05T16:30:00Z",
    status: "booked",
    totalCents: 9000,
    depositCents: 0,
    depositPaidAt: null,
    hasCardOnFile: false,
    pending: false,
    holdExpiresAt: null,
    policy: { cancelWindowHours: 24, noShowFeeCents: 2500 },
    tax: { applies: false, name: "HST" },
    freeChangeUntil: "2026-11-04T15:00:00Z",
    feeChargedAt: null,
    notes: null,
    petName: "Biscuit",
  } as appointmentsApi.MyAppointmentDto;
  it("shows when, where with directions, the dog and the policy in words", () => {
    render(<NextVisitCard appt={visit} />);
    expect(screen.getByText("Your next visit")).toBeTruthy();
    expect(screen.getByText("12 Queen St W")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Directions" }).getAttribute("href")).toContain("google.com/maps");
    expect(screen.getByText(/for Biscuit/)).toBeTruthy();
    expect(screen.getByText(/Change or cancel free until 24 hours before/)).toBeTruthy();
    expect(screen.getByText(/\$25\.00 fee|\$25 fee/)).toBeTruthy();
  });
  it("asks a customer of a pet shop with no dog yet to add one, and stays out of the way otherwise", () => {
    const { container, rerender } = render(<PetLinks pets={0} cards={0} shop="Pawsh Grooming" />);
    expect(screen.getByRole("link", { name: "Add your dog" }).getAttribute("href")).toBe("/me/pets");
    rerender(<PetLinks pets={0} cards={0} />);
    expect(container.textContent).toBe("");
    rerender(<PetLinks pets={2} cards={0} shop="Pawsh Grooming" />);
    expect(screen.queryByRole("link", { name: "Add your dog" })).toBeNull();
    expect(screen.getByRole("link", { name: /My pets/ })).toBeTruthy();
  });
});
