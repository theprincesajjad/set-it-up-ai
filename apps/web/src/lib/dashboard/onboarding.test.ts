import { describe, expect, it } from "vitest";
import { leadingMarkPct, membersLine, paceTone, stepsLeft } from "./onboarding";

describe("onboarding helpers", () => {
  it("places the day-14 marker at 12 of 25", () => {
    expect(leadingMarkPct({ leadingMembers: 12, target: 25 })).toBe(48);
    expect(leadingMarkPct({ leadingMembers: 12, target: 0 })).toBe(0);
  });
  it("words the member count", () => {
    expect(membersLine(14, 25)).toBe("14 of 25 customers have visited");
    expect(membersLine(1, 25)).toBe("1 of 25 customers has visited");
  });
  it("colours pace: behind is the only accent", () => {
    expect(paceTone("ahead")).toBe("positive");
    expect(paceTone("behind")).toBe("accent");
    expect(paceTone("late")).toBe("neutral");
  });
  it("lists open setup steps except the member goal", () => {
    const steps = [
      { key: "program", label: "", done: true, detail: null },
      { key: "first_stamp", label: "", done: false, detail: null },
      { key: "first_members", label: "", done: false, detail: null },
    ] as never;
    expect(stepsLeft({ steps }).map((s) => s.key)).toEqual(["first_stamp"]);
  });
});
