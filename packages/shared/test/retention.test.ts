import { describe, expect, it } from "vitest";
import { RETENTION, daysAgo, legalTokens, monthsAgo, retentionLabel, fillLegalTokens, isStartKeyword, isStopKeyword, normalizeReplyWord } from "../src/index.js";

describe("retention config", () => {
  it("labels periods the way the policy prints them", () => {
    expect(retentionLabel("phoneTranscriptDays")).toBe("90 days");
    expect(retentionLabel("repairPhotoMonths")).toBe("24 months");
    expect(retentionLabel("abandonedHoldDays")).toBe("7 days");
  });
  it("every period is a positive whole number and has a policy token", () => {
    const t = legalTokens();
    for (const [k, v] of Object.entries(RETENTION)) {
      expect(Number.isInteger(v) && v > 0, k).toBe(true);
      expect(t[`retention.${k}`], k).toBe(retentionLabel(k as keyof typeof RETENTION));
    }
    expect(fillLegalTokens("kept {{retention.tiffinAddressMonths}}")).toBe("kept 12 months");
  });
  it("counts calendar months and days back from a date", () => {
    expect(monthsAgo(new Date("2026-11-03T15:00:00Z"), 24).toISOString()).toBe("2024-11-03T15:00:00.000Z");
    expect(daysAgo(new Date("2026-11-03T15:00:00Z"), 90).toISOString()).toBe("2026-08-05T15:00:00.000Z");
  });
});

describe("reply keywords", () => {
  it("normalises accents, case and punctuation", () => {
    expect(normalizeReplyWord("  Arrêt! ")).toBe("ARRET");
    expect(normalizeReplyWord("opt-out")).toBe("OPTOUT");
  });
  it("recognises STOP and START words only when they are the whole message", () => {
    for (const w of ["STOP", "arret", "UNSUBSCRIBE", "END", "CANCEL", "QUIT"]) expect(isStopKeyword(w)).toBe(true);
    expect(isStartKeyword("start")).toBe(true);
    expect(isStopKeyword("stop sending me this")).toBe(false);
  });
});
