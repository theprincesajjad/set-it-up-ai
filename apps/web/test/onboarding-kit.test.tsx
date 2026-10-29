import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Icon3d } from "@/components/ui/Icon3d";
import { ChoiceGroup, ChoiceTile, LivePreview, PlanLine, PresetCard, ServiceRow, SetupProgress, ShareRow, StepCard, WeekStrip, STEP_BODY_MAX_WORDS, wordCount, type SetupStep } from "@/components/onboarding";

describe("Icon3d", () => {
  it("is decorative and points at the sprite", () => {
    const { container } = render(<Icon3d name="nails" size={64} trade="rose" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("64");
    expect(svg.getAttribute("data-fam")).toBe("rose");
    expect(svg.querySelector("use")!.getAttribute("href")).toBe("/icons3d/sprite.svg#nails");
  });
  it("maps a vertical to its family and lets an explicit accent win", () => {
    const a = render(<Icon3d name="cafe" trade="barber" />).container.querySelector("svg")!;
    expect(a.getAttribute("data-fam")).toBe("barber");
    const b = render(<Icon3d name="cafe" accent="#123456" trade="rose" />).container.querySelector("svg")!;
    expect(b.getAttribute("data-fam")).toBeNull();
    expect(b.getAttribute("style")).toContain("--i3d-accent-l: #123456");
  });
  it("keeps the 4:3 ratio for a spot scene and reads --trade when asked", () => {
    const svg = render(<Icon3d name="live" size={160} trade="inherit" />).container.querySelector("svg")!;
    expect(svg.getAttribute("height")).toBe("120");
    expect(svg.getAttribute("viewBox")).toBe("0 0 160 120");
    expect(svg.getAttribute("style")).toContain("var(--trade)");
  });
});

describe("StepCard", () => {
  it("renders the header, the form and both actions", async () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <StepCard icon="price_tag" title="Your services" body="Pick what you offer." headingId="h" primary={{ label: "Continue", onClick: onPrimary }} secondary={{ label: "Skip", onClick: onSecondary }}>
        <input aria-label="Name" />
      </StepCard>,
    );
    expect(screen.getByRole("region", { name: "Your services" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Your services" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onPrimary).toHaveBeenCalledOnce();
    expect(onSecondary).toHaveBeenCalledOnce();
  });
  it("is a form with a submit button when onSubmit is given", () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const { container } = render(<StepCard icon="link" title="Link" onSubmit={onSubmit} primary={{ label: "Save" }} />);
    expect(container.querySelector("form")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
  it("warns when the body is over 60 words", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<StepCard icon="link" title="t" body={Array(STEP_BODY_MAX_WORDS + 1).fill("word").join(" ")} />);
    expect(warn).toHaveBeenCalled();
    expect(wordCount("a b  c")).toBe(3);
  });
});

function Group({ dir }: { dir?: "rtl" }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <div dir={dir}>
      <ChoiceGroup value={v} onValueChange={setV} aria-label="Trade">
        <ChoiceTile value="a" label="Nails" hint="Polish" icon="nails" />
        <ChoiceTile value="b" label="Barber" hint="Cuts" icon="barber" />
        <ChoiceTile value="c" label="Salon" hint="Hair" icon="salon" />
      </ChoiceGroup>
    </div>
  );
}

describe("ChoiceTile", () => {
  it("is a radiogroup of radios with one tab stop", () => {
    render(<Group />);
    const group = screen.getByRole("radiogroup", { name: "Trade" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
  });
  it("selects on click and moves with the arrow keys", async () => {
    render(<Group />);
    const [a, b, c] = screen.getAllByRole("radio");
    await userEvent.click(a!);
    expect(a!.getAttribute("aria-checked")).toBe("true");
    expect(a!.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(a!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(b);
    expect(b!.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(b!, { key: "ArrowUp" });
    expect(a!.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(a!, { key: "End" });
    expect(c!.getAttribute("aria-checked")).toBe("true");
  });
  it("is a radio an object-left tile: the object is 40 px", () => {
    const { container } = render(<Group />);
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("40");
  });
  it("throws outside a group", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ChoiceTile value="x" label="x" icon="nails" />)).toThrow();
  });
});

const steps: SetupStep[] = [
  { id: "a", title: "Your link", time: "20 s", state: "done" },
  { id: "b", title: "Services", time: "40 s", state: "current" },
  { id: "c", title: "Hours", time: "20 s", state: "todo" },
  { id: "d", title: "Share", state: "skipped", href: "#d" },
];

describe("SetupProgress", () => {
  it("lists the steps with the current one marked", () => {
    render(<SetupProgress title="Set up your shop" steps={steps} />);
    const rail = document.querySelector("[data-setup-rail]")!;
    const items = within(rail as HTMLElement).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[1]!.getAttribute("aria-current")).toBe("step");
    expect(items[0]!.querySelector("svg")).toBeTruthy(); // the white check
    expect(within(rail as HTMLElement).getAllByText("20 s")).toHaveLength(2);
    expect(within(rail as HTMLElement).getByRole("link", { name: /Share/ }).getAttribute("href")).toBe("#d");
  });
  it("says where you are on a phone and opens the rows on tap", async () => {
    render(<SetupProgress title="Set up your shop" steps={steps} />);
    const strip = document.querySelector("[data-setup-strip]") as HTMLElement;
    const toggle = within(strip).getByRole("button");
    expect(strip.textContent).toContain("2 of 4");
    expect(strip.textContent).toContain("Services");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(strip).getAllByRole("listitem")).toHaveLength(4);
  });
  it("names the track for screen readers", () => {
    render(<SetupProgress title="t" steps={steps} />);
    expect(screen.getAllByText("1 of 4 steps done").length).toBeGreaterThan(0);
  });
});

describe("ServiceRow", () => {
  it("edits duration and price and toggles the deposit", async () => {
    const onDeposit = vi.fn();
    const onPrice = vi.fn();
    render(<ServiceRow checked onCheckedChange={() => {}} name="Gel manicure" duration="60" price="55" onPriceChange={onPrice} deposit={{ on: false, onChange: onDeposit, label: "Deposit" }} labels={{ duration: "Minutes", price: "Price" }} />);
    await userEvent.type(screen.getByLabelText("Price"), "0");
    expect(onPrice).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("switch", { name: "Deposit" }));
    expect(onDeposit).toHaveBeenCalledWith(true);
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });
});

describe("WeekStrip", () => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((l, i) => ({ id: i, label: l, name: l + "day" }));
  it("moves between days with the arrow keys and edits the hours", async () => {
    const onSelect = vi.fn();
    const onHours = vi.fn();
    render(<WeekStrip days={days} selected={0} onSelect={onSelect} hours={{ start: "09:00", end: "17:00" }} onHoursChange={onHours} labels={{ start: "Opens", end: "Closes", sameEveryDay: "Same every day", days: "Days" }} onSameEveryDay={() => {}} />);
    fireEvent.keyDown(screen.getAllByRole("radio")[0]!, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.change(screen.getByLabelText("Opens"), { target: { value: "10:00" } });
    expect(onHours).toHaveBeenCalledWith({ start: "10:00", end: "17:00" });
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Same every day" })).toBeTruthy();
  });
});

describe("LivePreview", () => {
  it("renders a 300 x 620 inert frame and a phone pill that opens a sheet", async () => {
    render(<LivePreview pillLabel="Preview" frameLabel="Booking page preview" closeLabel="Close" version={1}><p>Book now</p></LivePreview>);
    const frame = document.querySelector("[data-preview-frame]") as HTMLElement;
    expect(frame.className).toContain("h-[620px]");
    expect(frame.className).toContain("w-[300px]");
    expect(frame.querySelector("[inert]")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("dialog", { name: "Booking page preview" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ShareRow, PresetCard, PlanLine", () => {
  it("ShareRow shows a 40 px object and one action", async () => {
    const onAction = vi.fn();
    const { container } = render(<ShareRow icon="link" title="Instagram bio" hint="Copy your link" actionLabel="Copy link" onAction={onAction} />);
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("40");
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onAction).toHaveBeenCalledOnce();
  });
  it("PresetCard picks", async () => {
    const onPick = vi.fn();
    render(<PresetCard name="Studio" hint="One page" pickLabel="Pick" onPick={onPick}><div>render</div></PresetCard>);
    await userEvent.click(screen.getByRole("button", { name: "Pick" }));
    expect(onPick).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Studio" })).toBeTruthy();
  });
  it("PlanLine is a quiet line with a text link, not a button", () => {
    render(<PlanLine linkLabel="See the plan" href="/pricing">Included with the annual plan, $390 a year.</PlanLine>);
    expect(screen.getByRole("link", { name: "See the plan" }).getAttribute("href")).toBe("/pricing");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
