import { describe, expect, it } from "vitest";
import { addressLine, cityFromAddress } from "@/lib/address";
import { clockText } from "@/lib/format";
import { clock12, hoursSummary } from "@/lib/dashboard/hours";
import { isEnglishOnlyScreen } from "@/components/dashboard/EnglishFallback";

describe("dashboard launch fixes", () => {
  it("shows hours in the 9 a.m. style", () => {
    expect(clock12("09:00")).toBe("9 a.m.");
    expect(clock12("17:30")).toBe("5:30 p.m.");
    expect(clock12("12:00")).toBe("12 p.m.");
    expect(clock12("00:15")).toBe("12:15 a.m.");
    const day: [string, string][] = [["09:00", "17:30"]];
    expect(hoursSummary({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day })).toBe("6 days a week · 9 a.m. to 5:30 p.m.");
  });

  it("formats clock times without am/pm variants", () => {
    expect(clockText(new Date("2026-11-11T10:54:00Z"))).toBe("5:54 a.m.");
    expect(clockText(new Date("2026-11-11T14:00:00Z"))).toBe("9 a.m.");
    expect(clockText(new Date("2026-11-11T23:05:00Z"))).toBe("6:05 p.m.");
  });

  it("takes the city from the address the owner typed", () => {
    expect(cityFromAddress("14 Main St N, Brampton")).toBe("Brampton");
    expect(cityFromAddress("14 Main St N, Brampton, ON L6V 1N7")).toBe("Brampton");
    expect(cityFromAddress("14 Main St N")).toBeNull();
    expect(addressLine("14 Main St N, Brampton", "Toronto")).toBe("14 Main St N, Brampton, Toronto");
    expect(addressLine("14 Main St N, Brampton", "Brampton")).toBe("14 Main St N, Brampton");
    expect(addressLine("412 Roncesvalles Ave", "Toronto")).toBe("412 Roncesvalles Ave, Toronto");
  });

  it("keeps translated trade screens out of the English fallback", () => {
    const base = "/m/abc";
    expect(isEnglishOnlyScreen(`${base}/restaurant/catering`, base)).toBe(true);
    expect(isEnglishOnlyScreen(`${base}/grocery/butcher`, base)).toBe(true);
    expect(isEnglishOnlyScreen(`${base}/restaurant/kitchen`, base)).toBe(false);
    expect(isEnglishOnlyScreen(`${base}/classes/door`, base)).toBe(false);
    expect(isEnglishOnlyScreen(`${base}/reports/week`, base)).toBe(false);
    expect(isEnglishOnlyScreen(`${base}/messages/promos`, base)).toBe(false);
    // Half-translated screens (a translated search box over English sentences) read as broken in a right-to-left page: whole screen in English until finished.
    expect(isEnglishOnlyScreen(`${base}/customers`, base)).toBe(true);
    expect(isEnglishOnlyScreen(`${base}/messages/new`, base)).toBe(true);
    expect(isEnglishOnlyScreen(`${base}/reports`, base)).toBe(true);
    // The website builder's words are English (copy.siteBuilder).
    expect(isEnglishOnlyScreen(`${base}/site`, base)).toBe(true);
  });
});
