/** wave-n: rules. The program page's stamp rules: earn unit, what earns, the prize and tiers, plain words, goal moves. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { EarnScopePicker, GoalStepper, selectedNames } from "@/components/dashboard/program/EarnRules";
import { ChangeHistory, TiersEditor } from "@/components/dashboard/program/TiersAndHistory";
import { STAMP_GOAL_MAX, STAMP_GOAL_MIN, diffProgram, earnModeOf, goalMoves, plainRules, previewModel, setEarnMode, validateProgram, validateTiers, type ProgramDraft } from "@/lib/dashboard/program";

const card: ProgramDraft = {
  name: "Nails", earnType: "stamps", pointsPerDollar: 0, pointsPerVisit: 1, minSpendCents: 0, stampGoal: 10, terminology: "stamps", welcomeBonus: 0, birthdayBonus: 0, referralBonus: 0,
  expiryMonths: null, visitCooldownMinutes: 30, counterAutoStamp: true, rewardCostCents: null, earnUnit: "visit", earnScope: "all", earnCategoryIds: [], earnItemIds: [], earnServiceIds: [], maxStampsPerDay: null,
};
const opts = { categories: [{ id: "c1", name: "Gel", protected: false }, { id: "c2", name: "Gift cards", protected: true }], items: [], services: [{ id: "s1", name: "Gel manicure", categoryId: null }, { id: "s2", name: "Pedicure", categoryId: null }] };

describe("stamp rules logic", () => {
  it("bounds the goal at 2 to 50", () => {
    expect(STAMP_GOAL_MIN).toBe(2);
    expect(STAMP_GOAL_MAX).toBe(50);
    expect(validateProgram({ ...card, stampGoal: 15 })).toEqual({});
    expect(validateProgram({ ...card, stampGoal: 8 })).toEqual({});
    expect(validateProgram({ ...card, stampGoal: 51 }).stampGoal).toMatch(/2 to 50/);
  });

  it("maps one visit / purchase / pickup / dollar onto the program", () => {
    const pickup = setEarnMode(card, "pickup");
    expect(pickup).toMatchObject({ earnType: "stamps", earnUnit: "pickup", minSpendCents: 0, counterAutoStamp: false });
    expect(earnModeOf(pickup)).toBe("pickup");
    expect(setEarnMode({ ...card, minSpendCents: 800, earnUnit: "purchase" }, "purchase").minSpendCents).toBe(800);
    expect(setEarnMode(card, "dollar").earnType).toBe("per_dollar");
    expect(diffProgram(card, pickup)).toMatchObject({ earnUnit: "pickup", counterAutoStamp: false });
  });

  it("needs at least one thing selected for 'only some', and a sane daily cap", () => {
    expect(validateProgram({ ...card, earnScope: "selected" }).earnScope).toBeTruthy();
    expect(validateProgram({ ...card, earnScope: "selected", earnServiceIds: ["s1"] })).toEqual({});
    expect(validateProgram({ ...card, maxStampsPerDay: 0 }).maxStampsPerDay).toBeTruthy();
    expect(validateProgram({ ...card, maxStampsPerDay: 3 })).toEqual({});
  });

  it("diffs id lists by value, not by reference", () => {
    expect(diffProgram({ ...card, earnServiceIds: ["s1"] }, { ...card, earnServiceIds: ["s1"] })).toEqual({});
    expect(diffProgram(card, { ...card, earnScope: "selected", earnServiceIds: ["s1"] })).toEqual({ earnScope: "selected", earnServiceIds: ["s1"] });
  });

  it("checks tiers: below the goal, named, no duplicates", () => {
    expect(validateTiers([{ pointsCost: 5, name: "Free polish" }], 10)).toBeNull();
    expect(validateTiers([{ pointsCost: 10, name: "Too big" }], 10)).toMatch(/1 to 9/);
    expect(validateTiers([{ pointsCost: 5, name: "" }], 10)).toMatch(/Name/);
    expect(validateTiers([{ pointsCost: 5, name: "A" }, { pointsCost: 5, name: "B" }], 10)).toMatch(/same number/);
  });

  it("says every rule in plain words", () => {
    const d = { ...card, earnScope: "selected" as const, earnServiceIds: ["s1", "s2"], maxStampsPerDay: 2 };
    expect(plainRules(d, { name: "Free gel manicure" }, [{ pointsCost: 5, name: "Free polish change" }], selectedNames(d, opts))).toEqual([
      "Customers get 1 stamp per visit.",
      "Only Gel manicure and Pedicure earn stamps.",
      "At 5 stamps they can take a free polish change, or keep going.",
      "After 10 stamps they get a free gel manicure.",
      "Up to 2 stamps a day, and one every 30 minutes.",
    ]);
    expect(plainRules({ ...setEarnMode(card, "pickup"), visitCooldownMinutes: 0 }, { name: "$5 off" }, [])).toEqual(["Customers get 1 stamp per online order picked up.", "After 10 stamps they get $5 off."]);
    expect(plainRules({ ...setEarnMode(card, "purchase"), minSpendCents: 1500, visitCooldownMinutes: 0, stampGoal: 8 }, { name: "Free coffee" }, [])[0]).toBe("Customers get 1 stamp per purchase over $15.00.");
  });

  it("flags a goal move either way (the confirm sheet), and the preview names the card's own reward, not a tier", () => {
    expect(goalMoves(card, { ...card, stampGoal: 15 })).toBe(true);
    expect(goalMoves(card, { ...card, stampGoal: 8 })).toBe(true);
    expect(goalMoves(card, card)).toBe(false);
    const m = previewModel({ ...card, stampGoal: 15 }, [{ name: "Free polish", pointsCost: 5, rewardType: "free_item", value: 0 }, { name: "Free gel manicure", pointsCost: 15, rewardType: "free_item", value: 0 }]);
    expect(m.kind === "stamps" && m.goal).toBe(15);
    expect(m.rewardName).toBe("Free gel manicure");
  });
});

describe("stamp rules controls", () => {
  function Stepper() {
    const [n, setN] = useState(10);
    return (
      <>
        <GoalStepper value={n} min={2} max={50} onChange={setN} />
        <output data-testid="goal">{n}</output>
      </>
    );
  }

  it("types any goal and nudges with - and +", async () => {
    render(<Stepper />);
    const input = screen.getByRole("textbox", { name: "Stamps for the reward" });
    await userEvent.clear(input);
    await userEvent.type(input, "15");
    expect(screen.getByTestId("goal").textContent).toBe("15");
    await userEvent.click(screen.getByRole("button", { name: "More stamps" }));
    expect(screen.getByTestId("goal").textContent).toBe("16");
    await userEvent.click(screen.getByRole("button", { name: "Fewer stamps" }));
    await userEvent.click(screen.getByRole("button", { name: "Fewer stamps" }));
    expect(screen.getByTestId("goal").textContent).toBe("14");
  });

  it("explains an empty catalogue and disables 'Only some'", () => {
    render(<EarnScopePicker draft={card} onChange={() => undefined} options={{ categories: [{ id: "x", name: "Lottery", protected: true }], items: [], services: [] }} term="stamps" />);
    expect(screen.getByText("Nothing to choose from yet")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Only some/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists services and categories (never a protected one) to pick from", async () => {
    const picked: unknown[] = [];
    render(<EarnScopePicker draft={{ ...card, earnScope: "selected" }} onChange={(p) => picked.push(p)} options={opts} term="stamps" />);
    expect(screen.queryByText("Gift cards")).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Gel manicure" }));
    expect(picked).toContainEqual({ earnServiceIds: ["s1"] });
  });

  it("edits tiers and shows the Pro note when locked", async () => {
    const changes: unknown[] = [];
    const { rerender } = render(<TiersEditor tiers={[]} goal={10} onChange={(t) => changes.push(t)} />);
    await userEvent.click(screen.getByRole("button", { name: /Add a reward on the way/ }));
    expect(changes[0]).toEqual([{ pointsCost: 5, name: "" }]);
    rerender(<TiersEditor tiers={[]} goal={10} onChange={() => undefined} locked />);
    expect(screen.getByText(/come with Pro/)).toBeTruthy();
  });

  it("shows the change history with who, before and after", () => {
    render(
      <ChangeHistory
        items={[{ id: "1", at: "2026-11-01T15:00:00Z", action: "program.updated", actor: { userId: "u", name: "Amara" }, changes: [{ field: "Stamps for the reward", before: 10, after: 15 }], note: "3 customers got 15 carry-over stamps." }]}
      />,
    );
    expect(screen.getByText(/Changed the rules/)).toBeTruthy();
    expect(screen.getByText(/Amara/)).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("3 customers got 15 carry-over stamps.")).toBeTruthy();
  });
});
