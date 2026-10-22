import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProgramPreview } from "@/components/dashboard/ProgramPreview";
import { changeEarnType, diffProgram, expiryDisclosure, previewModel, programSentence, raisesTheBar, validateProgram, type ProgramDraft } from "@/lib/dashboard/program";

const stamps: ProgramDraft = { name: "Café rewards", earnType: "stamps", pointsPerDollar: 0, pointsPerVisit: 1, minSpendCents: 0, stampGoal: 10, terminology: "stamps", welcomeBonus: 1, birthdayBonus: 0, referralBonus: 0, expiryMonths: null, visitCooldownMinutes: 30 };
const points: ProgramDraft = { ...stamps, earnType: "per_dollar", pointsPerDollar: 1, terminology: "points", welcomeBonus: 0 };
const drink = { name: "Free drink", pointsCost: 10, rewardType: "free_item" as const, value: 0 };

describe("program editor logic", () => {
  it("writes the plain-language sentence", () => {
    expect(programSentence(stamps, drink)).toBe("Customers get 1 stamp per visit. 10 stamps = Free drink.");
    expect(programSentence(points)).toBe("Customers earn 1 point for every $1.");
    expect(programSentence({ ...points, earnType: "per_visit", pointsPerVisit: 10, minSpendCents: 500 })).toBe("Customers earn 10 points every visit over $5.00.");
  });

  it("validates like the API: expiry >= 12 months, earn rate > 0, stamp goal 6-12", () => {
    expect(validateProgram(stamps)).toEqual({});
    expect(validateProgram({ ...stamps, expiryMonths: 6 }).expiryMonths).toMatch(/at least 12 months/);
    expect(validateProgram({ ...stamps, expiryMonths: 12 })).toEqual({});
    expect(validateProgram({ ...points, pointsPerDollar: 0 }).pointsPerDollar).toBeTruthy();
    expect(validateProgram({ ...stamps, stampGoal: 20 }).stampGoal).toBeTruthy();
  });

  it("discloses expiry with the API's wording", () => {
    expect(expiryDisclosure(stamps)).toBe("Your stamps never expire.");
    expect(expiryDisclosure({ ...points, expiryMonths: 18 })).toBe("Your points expire after 18 months with no activity.");
  });

  it("switching to stamps picks stamp wording and a 6-12 goal (10 by default)", () => {
    const d = changeEarnType({ ...points, stampGoal: 0 }, "stamps");
    expect(d.terminology).toBe("stamps");
    expect(d.stampGoal).toBe(10);
    expect(changeEarnType({ ...points, stampGoal: 20 }, "stamps").stampGoal).toBe(12);
    expect(changeEarnType(d, "per_dollar").terminology).toBe("points");
  });

  it("builds a lived-in preview: stamps never complete the card, points target the next reward", () => {
    const s = previewModel(stamps, [drink]);
    expect(s.kind).toBe("stamps");
    if (s.kind === "stamps") {
      expect(s.goal).toBe(10);
      expect(s.stamps).toBe(7); // 1 welcome + 6 visits
      expect(s.rewardName).toBe("Free drink");
    }
    const p = previewModel(points, [{ ...drink, name: "$5 off", pointsCost: 100 }, { ...drink, name: "$1 off", pointsCost: 50, active: false }]);
    expect(p.kind).toBe("points");
    if (p.kind === "points") {
      expect(p.balance).toBe(72); // 6 visits × $12.50 × 1 pt/$
      expect(p.goal).toBe(100);
      expect(p.rewards).toHaveLength(1); // inactive rewards hidden
    }
  });

  it("diffs only changed fields and flags changes that raise the bar", () => {
    expect(diffProgram(stamps, { ...stamps, stampGoal: 12, name: "X" })).toEqual({ stampGoal: 12, name: "X" });
    expect(diffProgram(stamps, stamps)).toEqual({});
    expect(raisesTheBar(stamps, { ...stamps, stampGoal: 12 })).toBe(true);
    expect(raisesTheBar(stamps, { ...stamps, stampGoal: 8 })).toBe(false);
    expect(raisesTheBar(points, { ...points, pointsPerDollar: 0 })).toBe(true);
  });
});

describe("<ProgramPreview>", () => {
  const shop = { name: "Pinecone Coffee", vertical: "cafe", logoUrl: null };

  it("renders the real stamp card with the draft values and the expiry line", () => {
    render(<ProgramPreview model={previewModel(stamps, [drink])} shop={shop} />);
    expect(screen.getByRole("img", { name: /7 of 10 stamps\. 3 more for a Free drink/ })).toBeTruthy();
    expect(screen.getByText("Your stamps never expire.")).toBeTruthy();
    expect(screen.getAllByText("Pinecone Coffee").length).toBeGreaterThan(0);
  });

  it("updates when the draft changes and switches views", async () => {
    const { rerender } = render(<ProgramPreview model={previewModel(stamps, [drink])} shop={shop} />);
    rerender(<ProgramPreview model={previewModel({ ...stamps, stampGoal: 8, expiryMonths: 12 }, [drink])} shop={shop} />);
    expect(screen.getByRole("img", { name: /7 of 8 stamps/ })).toBeTruthy();
    expect(screen.getByText("Your stamps expire after 12 months with no activity.")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Shop page" }));
    expect(screen.getByText("How you earn here")).toBeTruthy();
    expect(screen.getByText("Join and get 1 free stamp")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Counter success" }));
    expect(screen.getByText("Added 1 stamp")).toBeTruthy();
  });

  it("shows a points ring for per-dollar programs", () => {
    render(<ProgramPreview model={previewModel(points, [{ ...drink, name: "$5 off", pointsCost: 100 }])} shop={shop} />);
    expect(screen.getByRole("img", { name: /72 of 100 points/ })).toBeTruthy();
  });
});
