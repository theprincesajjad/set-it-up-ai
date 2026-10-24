import { describe, expect, it } from "vitest";
import { festivalDefOf, festivalMessage } from "@/lib/restaurant/festivals";

describe("festivals: the owner's own date", () => {
  const custom = { id: "abc", name: "Grand opening", date: "2026-11-14", subject: "We open!", body: "Join us, {{first_name}}.", sms: "Open on {{festival_date}}", whatsapp: "Join us" };
  it("builds a festival definition from the occasion", () => {
    const def = festivalDefOf({ festivalId: "custom-abc", custom })!;
    expect(def.id).toBe("custom-abc");
    expect(def.templates[0]!.subject).toBe("We open!");
    expect(def.tradition).toBe("custom");
  });
  it("fills the message for the preview", () => {
    const def = festivalDefOf({ festivalId: "custom-abc", custom })!;
    expect(festivalMessage(def, def.templates[0]!, "en", "Nawab", "2026-11-14", "sms")).toContain("Saturday, November 14");
  });
  it("falls back to the calendar for a known festival", () => {
    expect(festivalDefOf({ festivalId: "diwali" })?.id).toBe("diwali");
  });
});
