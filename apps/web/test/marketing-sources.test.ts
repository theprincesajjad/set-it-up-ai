import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPETITORS } from "@/components/marketing/CompetitorTable";
import { DOORDASH_CANADA, MAX_SOURCE_AGE_DAYS, ageInDays, formatAsOf } from "@/lib/marketing/sources";
import { SAVINGS_RANGE, appCommission, dollarRange, dollars, DOORDASH_RATE_LINE } from "@/lib/marketing/savings";

describe("sourced competitor and delivery-app facts", () => {
  it("gives every competitor row an asOf date and a source URL", () => {
    expect(COMPETITORS.length).toBeGreaterThanOrEqual(2);
    for (const c of COMPETITORS) {
      expect(c.asOf, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.sourceUrl, c.id).toMatch(/^https:\/\//);
      expect(c.monthlyFee && c.locations && c.salesFee, c.id).toBeTruthy();
    }
    expect(DOORDASH_CANADA.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(DOORDASH_CANADA.sourceUrl).toBe("https://merchants.doordash.com/en-ca");
  });

  it("fails when a sourced fact is older than 90 days, which forces a re-read", () => {
    for (const s of [...COMPETITORS, DOORDASH_CANADA]) {
      const age = ageInDays(s.asOf);
      expect(age, `${s.sourceUrl} was read on ${s.asOf} (${age} days ago): read it again and update asOf`).toBeLessThanOrEqual(MAX_SOURCE_AGE_DAYS);
      expect(age).toBeGreaterThanOrEqual(0);
    }
  });

  it("detects a stale date", () => {
    expect(ageInDays("2026-01-01", new Date("2026-04-02T00:00:00Z"))).toBe(91);
    expect(formatAsOf("2026-10-23")).toBe("Oct 23, 2026");
  });

  it("quotes only what was read on the vendors' pages", () => {
    expect(COMPETITORS.find((c) => c.id === "sopoints-free")).toMatchObject({ monthlyFee: "US$0", locations: "1", salesFee: "5%" });
    expect(COMPETITORS.find((c) => c.id === "square-loyalty")).toMatchObject({ monthlyFee: "from CA$60 per location", locations: "Per location" });
    expect(DOORDASH_RATE_LINE).toBe("DoorDash Canada: 8% pickup (Plus, Premier), 10% (Basic), up to 29% delivery (Premier).");
  });
});

describe("savings calculator math (DoorDash Canada rates)", () => {
  it("at $5,000 shows $400 to $500 for pickup and up to $1,450 for delivery", () => {
    const c = appCommission(500_000);
    expect(dollarRange(c.pickupLowCents, c.pickupHighCents)).toBe("$400 to $500");
    expect(dollars(c.deliveryMaxCents)).toBe("$1,450");
    expect(SAVINGS_RANGE.defaultCents).toBe(500_000);
  });
  it("scales with the slider and formats thousands", () => {
    expect(dollarRange(...(Object.values(appCommission(3_000_000)).slice(0, 2) as [number, number]))).toBe("$2,400 to $3,000");
    expect(dollars(appCommission(100_000).deliveryMaxCents)).toBe("$290");
  });
});

const SRC = path.resolve(__dirname, "../src");
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [path.join(dir, e.name)] : []));

describe("marketing copy has no invented or overstated numbers", () => {
  const files = walk(SRC).filter((f) => /\/(marketing|site)\//.test(f) || /app\/\(marketing\)/.test(f) || /copy\/en-CA/.test(f));
  const read = (f: string) => fs.readFileSync(f, "utf8");
  it("drops the old 15 to 30% and $750 to $1,500 claims", () => {
    for (const f of files) {
      const s = read(f);
      expect(s, f).not.toMatch(/15 to 30%|\$750 to \$1,500|about 15 to 30/);
    }
  });
  it("has no fake proof: Trusted by, the old mock numbers 310 and 111", () => {
    for (const f of files.filter((x) => !x.endsWith("test.ts"))) {
      const s = read(f);
      expect(s, f).not.toMatch(/Trusted by|trusted by/);
      expect(s, f).not.toMatch(/\b310\b|\b111\b/);
    }
  });
  it("takes plan prices from the shared constants, never typed into the pages", () => {
    for (const f of walk(path.join(SRC, "app/(marketing)")).filter((x) => /pricing|for-restaurants|for-bias|page\.tsx$/.test(x))) {
      const s = read(f);
      expect(s, f).not.toMatch(/\$(39|99|199|349)\b(?!\.\d)/);
    }
    expect(read(path.join(SRC, "components/marketing/RestaurantBand.tsx"))).not.toMatch(/\$99/);
  });
  it("never says we deliver", () => {
    for (const f of files) expect(read(f), f).not.toMatch(/\bwe deliver\b|we will deliver/i);
  });
});
