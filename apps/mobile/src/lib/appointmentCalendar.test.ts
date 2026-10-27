import { describe, expect, it } from "vitest";
import { appointmentIcs, icsFileName, manageUrl } from "./appointmentCalendar";

const appt = {
  id: "9f1c2a40-0000-4000-8000-000000000001",
  items: [{ serviceId: null, name: "Cut and blow-dry", durationMin: 75, priceCents: 6500 }, { serviceId: null, name: "Toner", durationMin: 30, priceCents: 3500 }],
  startsAt: "2026-11-04T15:00:00.000Z",
  endsAt: "2026-11-04T16:45:00.000Z",
  merchant: { id: "m", name: "Bloom Studio", slug: "Bloom-Studio", logoUrl: null, brandColor: null, address: "123 Roncesvalles Ave, Toronto", phone: null, timezone: "America/Toronto" },
};

describe("appointment calendar file", () => {
  it("builds an event with the services, the shop address, a link back and a 2 hour reminder", () => {
    // Long lines fold at 75 characters (a CRLF and a space); unfold before reading.
    const ics = appointmentIcs(appt, "https://app.example/", new Date("2026-11-01T12:00:00Z")).replace(/\r\n /g, "");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Cut and blow-dry\\, Toner · Bloom Studio");
    expect(ics).toContain("DTSTART:20261104T150000Z");
    expect(ics).toContain("DTEND:20261104T164500Z");
    expect(ics).toContain("LOCATION:123 Roncesvalles Ave\\, Toronto");
    expect(ics).toContain("URL:https://app.example/shops/Bloom-Studio/book/9f1c2a40-0000-4000-8000-000000000001");
    expect(ics).toContain("TRIGGER:-PT2H");
    expect(ics.endsWith("\r\n")).toBe(true);
  });
  it("names the file after the shop and links to the manage page without a double slash", () => {
    expect(icsFileName(appt)).toBe("bloom-studio-appointment.ics");
    expect(icsFileName({ merchant: { ...appt.merchant, slug: "!!" } })).toBe("shop-appointment.ics");
    expect(manageUrl("https://app.example///", appt)).toBe("https://app.example/shops/Bloom-Studio/book/9f1c2a40-0000-4000-8000-000000000001");
  });
  it("writes a pharmacy visit as a bare Appointment: no service, shop, address or link", () => {
    const rx = { ...appt, items: [{ serviceId: null, name: "Flu shot", durationMin: 15, priceCents: 0 }], merchant: { ...appt.merchant, name: "Village Apothecary", slug: "village-apothecary" }, reminderText: "Reminder: your appointment is Thu 10:00 am." };
    const ics = appointmentIcs(rx, "https://app.example/", new Date("2026-11-01T12:00:00Z"), "Appointment").replace(/\r\n /g, "");
    expect(ics).toContain("SUMMARY:Appointment");
    expect(ics).toContain("DTSTART:20261104T150000Z");
    for (const word of ["Flu", "Village", "Apothecary", "village-apothecary", "Roncesvalles", "LOCATION", "URL:"]) expect(ics, word).not.toContain(word);
    expect(icsFileName(rx)).toBe("appointment.ics");
  });
});
