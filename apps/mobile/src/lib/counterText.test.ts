import { t as translate, type Locale, type MessageKey, type Vars } from "@ll/shared";
import { describe, expect, it } from "vitest";
import { awardButtonLabel, successView, type CounterProgram } from "./award";
import { awardButtonLabelL, cameInTextL, counterErrorL, matchesHeadingL, successViewL, visitThisMonthL } from "./counterText";
import type { L } from "./formatL";

const mk = (locale: Locale): L => ({ locale, t: (key: MessageKey, vars?: Vars) => translate(locale, key, vars) });
const stamps: CounterProgram = { earnType: "stamps", terminology: "stamps", pointsPerDollar: 0, pointsPerVisit: 1, minSpendCents: 0, stampGoal: 10 };
const LATIN = /[A-Za-z]{4,}/;

describe("counter text", () => {
  it("keeps the English sentences exactly", () => {
    const en = mk("en");
    expect(awardButtonLabelL(en, stamps, { points: 3 })).toBe(awardButtonLabel(stamps, { points: 3 }));
    const input = { program: stamps, pointsEarned: 1, balance: 9, nextReward: { name: "Free drink", pointsNeeded: 1 } };
    expect(successViewL(en, input)).toEqual(successView(input));
    expect(visitThisMonthL(en, 5)).toBe("5th visit this month");
    expect(matchesHeadingL(en, 2, "1034")).toBe("Two customers end in 1034");
  });

  for (const loc of ["hi", "ur", "pa"] as const) {
    it(`${loc}: the award screen has no English words`, () => {
      const L = mk(loc);
      const view = successViewL(L, { program: stamps, pointsEarned: 1, balance: 9, nextReward: { name: "ਮੁਫ਼ਤ", pointsNeeded: 1 } });
      for (const text of [awardButtonLabelL(L, stamps, { points: 2 }), view.title, view.next ?? "", view.announcement, matchesHeadingL(L, 3, "1034"), cameInTextL(L, null, new Date()), visitThisMonthL(L, 5)]) {
        expect(text, text).not.toMatch(LATIN);
      }
    });
    it(`${loc}: errors are translated by status and code, never the server text`, () => {
      const L = mk(loc);
      const server = "Some of what you entered isn't right. Check the form and try again.";
      for (const e of [{ status: 400, code: "bad_request", message: server }, { status: 409, code: "conflict", message: server }, { status: 429, message: server }, { status: 500, message: server }, { status: 418, code: "teapot", message: server }, { code: "cooldown", message: server }]) {
        const text = counterErrorL(L, e);
        expect(text, JSON.stringify(e)).not.toContain("entered");
        expect(text).not.toMatch(LATIN);
      }
    });
  }

  it("says offline is offline and unknown codes are generic", () => {
    const en = mk("en");
    expect(counterErrorL(en, { status: 0, code: "network" })).toMatch(/No connection/);
    expect(counterErrorL(en, { status: 400, message: "zod: expected string" })).not.toMatch(/zod/);
    expect(counterErrorL(en, null)).toMatch(/work. Try again/);
  });
});
