import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MERCHANT_EXPORTS, RETENTION } from "@ll/shared";

const state = { paid: true, until: null as string | null };
vi.mock("@/components/dashboard/MerchantContext", () => ({
  useMerchant: () => ({ api: { base: "/v1/merchants/m1", exportWindow: async () => ({ leftAt: null, until: state.until }) }, enabled: (k: string) => k === "customers.csv_export" && state.paid }),
}));

import { YourDataPanel } from "@/components/dashboard/YourDataPanel";

beforeEach(() => {
  state.paid = true;
  state.until = null;
});

describe("Settings > Privacy > Your data", () => {
  it("on a paid plan lists every kind of record with its own CSV link and one ZIP", () => {
    render(<YourDataPanel />);
    const list = screen.getByRole("list", { name: "Data you can download" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(MERCHANT_EXPORTS.length);
    for (const d of MERCHANT_EXPORTS) {
      const link = within(list).getByRole("link", { name: new RegExp(`${d.label}$`) });
      expect(link.getAttribute("href")).toBe(`/api/ll/v1/merchants/m1/exports/${d.key}.csv`);
    }
    expect(screen.getByRole("link", { name: /Download everything \(ZIP\)/ }).getAttribute("href")).toBe("/api/ll/v1/merchants/m1/exports/all.zip");
    // what the agreement lists
    for (const label of ["Members", "Visits", "Orders", "Order items", "Appointments", "Tiffin subscriptions", "Tiffin deliveries", "Catering events", "Hall bookings", "Repair tickets", "Quotes", "Invoices", "Reviews", "Messages sent"]) expect(screen.getByText(label)).toBeTruthy();
  });

  it("says who the files may be used for: consent, STOP and deleted accounts", () => {
    render(<YourDataPanel />);
    expect(screen.getByText(/marketing_consent_at/)).toBeTruthy();
    expect(screen.getByText(/may_follow_up/)).toBeTruthy();
    expect(screen.getByText(/deleted their account/)).toBeTruthy();
  });

  it("a shop that left, on Free, sees the same downloads with the date its free export ends", async () => {
    state.paid = false;
    state.until = "2027-01-31T15:00:00.000Z";
    render(<YourDataPanel />);
    await waitFor(() => expect(screen.getByText(/Your free export is open until/)).toBeTruthy());
    expect(screen.getByText(/January 31, 2027|31 janvier 2027|2027/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Download everything/ })).toBeTruthy();
  });

  it("a Free shop that has not left sees no downloads, only what it gets when it leaves", async () => {
    state.paid = false;
    render(<YourDataPanel />);
    await waitFor(() => expect(screen.getByText(new RegExp(`free export of all of it for ${RETENTION.leaverExportDays} days`))).toBeTruthy());
    expect(screen.queryByRole("link")).toBeNull();
  });
});
