import { describe, expect, it } from "vitest";
import { LOCALE_CODES, t as translate, type Locale } from "@ll/shared";
import { awardLabel, awardSuccess, cameInText, counterErrorMessage, counterTypeLabel, matchesHeading, pointsText, stampsLeft, visitNth, visitThisMonth, type CounterText, type ProgramForCounter } from "../src/lib/dashboard/counter";

const text = (locale: Locale): CounterText => ({ locale, t: (key, vars) => translate(locale, key, vars) });
const program = (over: Partial<ProgramForCounter>): ProgramForCounter => ({ earnType: "stamps", pointsPerVisit: 1, pointsPerDollar: 1, terminology: "stamps", stampGoal: 10, ...over }) as ProgramForCounter;

describe("counter text in four languages", () => {
  it("never leaks a catalog key or an unfilled placeholder", () => {
    for (const l of LOCALE_CODES) {
      const ct = text(l);
      const out = [
        awardLabel(program({}), 0, 1, ct),
        awardLabel(program({}), 0, 3, ct),
        awardLabel(program({ earnType: "per_visit", pointsPerVisit: 5 }), 0, 2, ct),
        awardLabel(program({ earnType: "per_dollar", pointsPerDollar: 2, terminology: "points" }), 1250, 1, ct),
        awardSuccess(program({}), 2, ct),
        awardSuccess(program({ earnType: "per_dollar", terminology: "points" }), 25, ct),
        counterErrorMessage({ code: "cooldown" }, { terminology: "points", firstName: "Emma" }, ct),
        counterErrorMessage({ code: "insufficient_points" }, { terminology: "stamps" }, ct),
        counterErrorMessage({ status: 500 }, {}, ct),
        counterErrorMessage({ isNetwork: true }, {}, ct),
        matchesHeading(1, "1034", ct),
        matchesHeading(3, "1034", ct),
        visitThisMonth(5, ct),
        visitNth(2, ct),
        stampsLeft(2, "Free drink", ct),
        stampsLeft(0, "Free drink", ct),
        cameInText(null, new Date(), ct),
        cameInText("2026-10-09T15:00:00Z", new Date("2026-10-23T15:00:00Z"), ct),
        pointsText(120, "points", ct),
        pointsText(1, "stamps", ct),
        counterTypeLabel("welcome_bonus", ct),
      ];
      for (const s of out) {
        expect(s, `${l}: ${s}`).not.toMatch(/counter\.|\{\w+\}/);
        expect(s.trim(), l).not.toBe("");
      }
    }
  });

  it("keeps the English sentences the tests and the till staff know", () => {
    const en = text("en");
    expect(awardLabel(program({}), 0, 3, en)).toBe("Add 3 stamps");
    expect(matchesHeading(2, "1034", en)).toBe("Two customers end in 1034");
    expect(visitThisMonth(5, en)).toBe("5th visit this month");
    expect(counterErrorMessage({ code: "cooldown" }, { terminology: "points", firstName: "Emma" }, en)).toBe("Emma already got points for this visit. Wait a few minutes, or adjust it from the customer's page.");
  });

  it("writes Urdu, Hindi and Punjabi in their own script", () => {
    expect(awardLabel(program({}), 0, 3, text("ur"))).toMatch(/[؀-ۿ]/);
    expect(awardLabel(program({}), 0, 3, text("hi"))).toMatch(/[ऀ-ॿ]/);
    expect(awardLabel(program({}), 0, 3, text("pa"))).toMatch(/[਀-੿]/);
    expect(counterTypeLabel("not_a_type", text("ur"))).toBe("Not a type");
  });
});
