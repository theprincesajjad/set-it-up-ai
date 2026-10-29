/**
 * phase-pro P3: the results strip, the reminder mode switch and the channel labels. The numbers come from the server; these check the words.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RebookMode } from "@/components/dashboard/service/RebookMode";
import { RebookResults } from "@/components/dashboard/service/RebookResults";
import { channelLabel, resultsMoney } from "@/lib/dashboard/rebooking";

describe("rebooking results", () => {
  it("writes whole dollars without cents and keeps cents when there are some", () => {
    expect(resultsMoney(49500)).toBe("$495");
    expect(resultsMoney(4950)).toBe("$49.50");
    expect(resultsMoney(0)).toBe("$0");
  });

  it("shows the month line, and a plain line when nothing has gone out", () => {
    const { rerender } = render(<RebookResults results={{ week: { sent: 4, booked: 1, amountCents: 5500 }, month: { sent: 31, booked: 9, amountCents: 49500 } }} />);
    expect(screen.getByTestId("rebook-results-month").textContent).toBe("This month: 31 reminded · 9 rebooked · $495");
    expect(screen.getByTestId("rebook-results-week").textContent).toBe("Last 7 days: 4 reminded · 1 rebooked · $55");
    rerender(<RebookResults results={{ week: { sent: 0, booked: 0, amountCents: 0 }, month: { sent: 0, booked: 0, amountCents: 0 } }} />);
    expect(screen.getByTestId("rebook-results-month").textContent).toBe("No reminders have gone out this month yet.");
  });
});

describe("the reminder mode switch", () => {
  it("is a radio group of three; on Free the first is locked and the plan line names the price", () => {
    const onChange = vi.fn();
    render(<RebookMode settings={{ auto: false, mode: "review", canAuto: false }} canEdit onChange={onChange} billingHref="/m/x/billing" />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    const auto = screen.getByRole("radio", { name: "Remind them for me" });
    expect(auto.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(auto);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Remind them for me · On Pro, \$29 a month/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/m/x/billing");
    fireEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(onChange).toHaveBeenCalledWith("off");
  });

  it("on Pro the first option works, says when reminders go, and there is no plan line", () => {
    const onChange = vi.fn();
    render(<RebookMode settings={{ auto: false, mode: "review", canAuto: true }} canEdit onChange={onChange} billingHref="/m/x/billing" />);
    fireEvent.click(screen.getByRole("radio", { name: "Remind them for me" }));
    expect(onChange).toHaveBeenCalledWith("auto");
    expect(screen.queryByRole("link", { name: /See Pro/ })).toBeNull();
  });
});

describe("channel labels", () => {
  it("names each rung", () => {
    const row = { language: "en", canSend: true } as const;
    expect(channelLabel({ ...row, channel: "email" })).toBe("Email · English");
    expect(channelLabel({ ...row, channel: "web_push" })).toBe("Web push · English");
    expect(channelLabel({ ...row, channel: "sms" })).toBe("SMS · English");
    expect(channelLabel({ ...row, channel: "push", canSend: false })).toBe("No consent");
  });
});
