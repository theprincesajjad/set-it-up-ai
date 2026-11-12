import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SAMPLE_BOARD_REPORT, type campaignsApi } from "@ll/shared";
import { openCorridors, spotsLeft, foundingHeadline } from "@/components/marketing/FoundingStrip";
import { MAJOR_FESTIVALS, upcomingFestivals, festivalLine } from "@/components/marketing/FestivalList";
import { restaurantCopy } from "@/copy/restaurants-locales";
import { LIVE_PROOF_MIN_SHOPS, liveProofStats } from "@/components/marketing/LiveProof";
import { ReportSummary, ReportTiles } from "@/components/marketing/ReportMock";
import { SampleReportCard } from "@/components/marketing/SampleReportCard";
import { whatsappNumber, whatsappUrl } from "@/lib/marketing/whatsapp";
import { campaignReportRows } from "@/lib/reportCsv";
import { boardMeetingInDays, boardMeetingSoon } from "@/lib/leads";

describe("live proof", () => {
  const n = { activeMerchants: 12, liveStreets: 2, multiShopMemberPct: 27 };
  it("renders nothing under 10 shops and real numbers above", () => {
    expect(LIVE_PROOF_MIN_SHOPS).toBe(10);
    expect(liveProofStats({ ...n, activeMerchants: 9 })).toBeNull();
    expect(liveProofStats(null)).toBeNull();
    expect(liveProofStats(n)?.map((s) => s.value)).toEqual(["12", "2", "27%"]);
    expect(liveProofStats({ ...n, multiShopMemberPct: 27.5 })?.[2]?.value).toBe("27.5%");
  });
});

describe("founding spots", () => {
  const c = (slug: string, taken: number) => ({ slug, name: slug, taken, total: 20 });
  it("shows the most open corridor first and hides full ones", () => {
    const open = openCorridors([c("b", 20), c("c", 6), c("a", 6), c("d", 1)]);
    expect(open.map((x) => x.slug)).toEqual(["d", "a", "c"]);
    expect(spotsLeft(c("x", 25))).toBe(0);
    expect(foundingHeadline(open[0]!)).toBe("19 of 20 first-year offer spots left on d");
  });
});

describe("festival list", () => {
  it("lists the next festivals from the calendar with moon-based dates marked as estimates", () => {
    const rows = upcomingFestivals("2026-10-23");
    expect(rows.map((o) => festivalLine(o))).toEqual(["Diwali · Sun, Nov 8, 2026", "Guru Nanak Gurpurab · Tue, Nov 24, 2026", "Ramadan begins · about Feb 8, 2027"]);
    expect(rows.every((r) => r.daysUntil >= 0)).toBe(true);
    expect(upcomingFestivals("2026-10-23", 30).map((o) => festivalLine(o))).toEqual(["Diwali · Sun, Nov 8, 2026"]);
  });
  it("names the festival and writes the date in the page's language", () => {
    const rows = upcomingFestivals("2026-10-23");
    for (const locale of ["hi", "ur", "pa"] as const) {
      const c = restaurantCopy(locale);
      const lines = rows.map((o) => festivalLine(o, c, locale));
      expect(lines[0]).toContain(c.festivalNames.diwali);
      expect(lines[2]).toContain(c.festivalNames.ramadan);
      // No English month, weekday or connecting word is left in the line.
      for (const line of lines) expect(line, line).not.toMatch(/[A-Za-z]{3,}/);
      expect(lines.join(" ")).toContain("2026");
    }
    expect(foundingHeadline({ slug: "d", name: "Gerrard", taken: 1, total: 20 }, restaurantCopy("ur").founding.headline)).toBe("Gerrard پر پہلے سال کی پیشکش کی 20 میں سے 19 جگہیں باقی");
  });
});

describe("the restaurant page in Hindi, Urdu and Punjabi", () => {
  /** Every string in the sections, by path. */
  const flat = (v: unknown, path = "", out: Record<string, string> = {}): Record<string, string> => {
    if (typeof v === "string") out[path] = v;
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) flat(x, `${path}.${k}`, out);
    return out;
  };
  const en = flat({ ...restaurantCopy("en"), festivalNames: undefined, festivalGreetings: undefined });
  const SCRIPT = { hi: /[\u0900-\u097F]/, ur: /[\u0600-\u06FF]/, pa: /[\u0A00-\u0A7F]/ } as const;
  /** Names that are written the same in every language. */
  const SAME = new Set(["WhatsApp"]);
  for (const locale of ["hi", "ur", "pa"] as const) {
    it(`${locale}: every line is translated, in its own script, with the same placeholders`, () => {
      const tr = flat({ ...restaurantCopy(locale), festivalNames: undefined, festivalGreetings: undefined });
      expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
      for (const [path, english] of Object.entries(en)) {
        const text = tr[path]!;
        if (path.endsWith(".key")) continue;
        if (SAME.has(english)) continue;
        expect(text, path).not.toBe(english);
        expect(text, path).toMatch(SCRIPT[locale]);
        expect((text.match(/\{\w+\}/g) ?? []).sort(), path).toEqual((english.match(/\{\w+\}/g) ?? []).sort());
        // Only product, plan and currency words may stay in Latin letters.
        const latin = text.replace(/\{\w+\}/g, "").match(/[A-Za-z]{2,}/g) ?? [];
        for (const w of latin) expect(["WhatsApp", "DoorDash", "Canada", "Stripe", "Restaurant", "Pro"], `${path}: ${w}`).toContain(w);
        expect(text, path).not.toMatch(/!/);
      }
      for (const id of ["ramadan", "eid_al_fitr", "eid_al_adha", "diwali", "vaisakhi", "gurpurab", "navratri", "holi"]) expect(restaurantCopy(locale).festivalNames[id], id).toMatch(SCRIPT[locale]);
    });
  }
  it("covers every festival the page can list, with a greeting in the page's language", () => {
    expect(Object.keys(restaurantCopy("ur").festivalNames).sort()).toEqual([...MAJOR_FESTIVALS].sort());
    const year = upcomingFestivals("2026-01-01", 365, 50);
    expect(new Set(year.map((o) => o.festivalId)).size).toBeGreaterThanOrEqual(6);
    for (const locale of ["hi", "ur", "pa"] as const) {
      for (const o of year) expect(o.greeting[locale] ?? restaurantCopy(locale).festivalGreetings[o.festivalId], `${locale} ${o.festivalId}`).toMatch(SCRIPT[locale]);
    }
  });
});

describe("sample board report", () => {
  const r = SAMPLE_BOARD_REPORT;
  it("is labelled sample data and adds up", () => {
    expect(r.sample).toBe(true);
    expect(r.perMerchant).toHaveLength(9);
    expect(r.perMerchant.reduce((n, m) => n + m.visits, 0)).toBe(r.visits);
    expect(r.perMerchant.reduce((n, m) => n + m.baselineVisits, 0)).toBe(r.baselineVisits);
    expect(r.perMerchant.reduce((n, m) => n + m.newMembers, 0)).toBe(r.newMembers);
    expect(Math.round(((r.visits - r.baselineVisits) / r.baselineVisits) * 1000) / 10).toBe(r.visitLiftPct);
  });
  it("always renders the Sample data tag, in every variant", () => {
    for (const variant of ["hero", "band", "page"] as const) expect(renderToStaticMarkup(<SampleReportCard variant={variant} />), variant).toContain("Sample data");
  });
  it("shares one component with the real report: same tiles, bars and table", () => {
    const html = renderToStaticMarkup(<ReportSummary report={r} goal={5} maxShops={4} />);
    expect(html).toContain("+38%");
    expect(html).toContain("1,420 vs 1,029");
    expect(html).toContain("96 completed all 5");
    expect(html).toContain("38%");
    expect(html).not.toContain("38.1%");
    expect(html).toContain("Top 4 of 9 shops");
  });
  it("shows 'Available {date}' while the 30-day window is open", () => {
    const pending: campaignsApi.CampaignReport = { ...r, returnedWithin30d: null, returnedWithin30dPct: null, baselineReturnedWithin30d: null, baselineReturnedWithin30dPct: null, returnWindowEndsAt: "2026-12-03T05:00:00.000Z" };
    const html = renderToStaticMarkup(<ReportTiles report={pending} />);
    expect(html).toContain("Available Dec 3");
    expect(html).not.toContain("157 of 412");
    expect(campaignReportRows(pending).at(-1)).toEqual(["came_back_within_30_days", "", "", "available_from_2026-12-03"]);
  });
});

describe("lead helpers and links", () => {
  it("flags a board meeting inside 30 days, not past or far ones", () => {
    const now = new Date("2026-11-03T12:00:00");
    expect(boardMeetingSoon({ boardMeetingAt: "2026-11-20" }, now)).toBe(true);
    expect(boardMeetingSoon({ boardMeetingAt: "2026-12-10" }, now)).toBe(false);
    expect(boardMeetingSoon({ boardMeetingAt: "2026-10-30" }, now)).toBe(false);
    expect(boardMeetingSoon({ boardMeetingAt: null }, now)).toBe(false);
    expect(boardMeetingInDays({ boardMeetingAt: "2026-11-04" }, now)).toBe(1);
  });
  it("opens WhatsApp through wa.me with the text encoded, and has no link at all without a configured number", () => {
    expect(whatsappUrl("Hi, I run a restaurant", "+1 (416) 555-0142")).toBe("https://wa.me/14165550142?text=Hi%2C%20I%20run%20a%20restaurant");
    expect(whatsappUrl(undefined, "14165550142")).toBe("https://wa.me/14165550142");
    for (const unset of [undefined, "", "   ", "abc", "12345"]) expect(whatsappUrl("Hi", unset), String(unset)).toBeNull();
    expect(whatsappNumber("")).toBeNull();
  });
});
