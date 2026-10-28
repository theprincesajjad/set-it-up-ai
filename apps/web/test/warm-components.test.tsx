import { render, screen } from "@testing-library/react";
import { Dumbbell } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { translator } from "@ll/shared";
import { ActionPill } from "@/components/ui/ActionPill";
import { Awning } from "@/components/ui/Awning";
import { IconTile } from "@/components/ui/IconTile";
import { QuickActionTile } from "@/components/ui/QuickActionTile";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatTile } from "@/components/ui/StatTile";
import { TrendBars } from "@/components/ui/TrendBars";
import { compareSentence, greetingKey } from "@/lib/dashboard/today";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

describe("Main Street Warm building blocks", () => {
  it("StatTile: a toned tile has the tone colours, a big number, a delta with an arrow and a sparkline", () => {
    const { container } = render(<StatTile tone="mint" label="Stamps given" value={52} delta={{ pct: 12, good: true, text: "12% vs usual" }} spark={[1, 3, 2, 5, 4]} />);
    const tile = container.firstElementChild!;
    expect(tile.className).toContain("bg-tile-mint");
    expect(tile.className).toContain("text-tile-mint-foreground");
    expect(screen.getByText("52").className).toContain("font-display");
    expect(screen.getByText("12% vs usual")).toBeTruthy();
    expect(container.querySelectorAll("svg[aria-hidden]").length).toBeGreaterThanOrEqual(2); // arrow + sparkline
  });

  it("StatTile: without a tone it is the plain hairline card it always was", () => {
    const { container } = render(<StatTile label="Visits" value={7} />);
    expect(container.firstElementChild!.className).toContain("border-line");
    expect(container.firstElementChild!.className).not.toContain("bg-tile");
  });

  it("StatTile: the trade tone uses the trade family", () => {
    const { container } = render(<StatTile tone="trade" label="Visits today" value={38} />);
    expect(container.firstElementChild!.className).toContain("bg-trade-soft");
    expect(container.firstElementChild!.className).toContain("text-trade-deep");
  });

  it("Sparkline draws a polyline from the values and nothing for a flat or short series", () => {
    const { container, rerender } = render(<Sparkline values={[2, 4, 3]} />);
    expect(container.querySelector("polyline")!.getAttribute("points")!.split(" ")).toHaveLength(3);
    rerender(<Sparkline values={[0, 0, 0]} />);
    expect(container.querySelector("svg")).toBeNull();
    rerender(<Sparkline values={[3]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("TrendBars highlights the busiest bar (or the one asked for) and describes the chart", () => {
    const { container, rerender } = render(<TrendBars values={[1, 5, 2]} label="Visits by hour" labels={["7 am", "Peak 8 am", "6 pm"]} />);
    expect(screen.getByRole("img", { name: "Visits by hour" })).toBeTruthy();
    const bars = () => [...container.querySelectorAll("span.flex-1")];
    expect(bars().map((b) => b.className.includes("bg-trade"))).toEqual([false, true, false]);
    rerender(<TrendBars values={[1, 5, 2]} label="Visits by hour" highlight={0} tone="primary" />);
    expect(bars().map((b) => b.className.includes("bg-primary"))).toEqual([true, false, false]);
  });

  it("ActionPill is a link, a button or (inside a row that is already a link) a plain span", () => {
    const { container, rerender } = render(<ActionPill href="/x">Remind</ActionPill>);
    expect(screen.getByRole("link", { name: "Remind" }).getAttribute("href")).toBe("/x");
    rerender(<ActionPill onClick={() => undefined}>Print</ActionPill>);
    expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
    rerender(<ActionPill decorative>View</ActionPill>);
    expect(container.querySelector("a, button")).toBeNull();
    expect(screen.getByText("View").tagName).toBe("SPAN");
  });

  it("IconTile, QuickActionTile and Awning are decorative or whole-tile links", () => {
    const { container } = render(
      <>
        <IconTile icon={Dumbbell} tone="rose" />
        <QuickActionTile href="/m/1/promos" icon={Dumbbell} label="New promo" tone="peach" />
        <Awning tone="trade" />
      </>,
    );
    expect(container.querySelector("span[aria-hidden]")!.className).toContain("bg-tile-rose");
    expect(screen.getByRole("link", { name: "New promo" }).className).toContain("bg-tile-peach");
    expect(container.querySelector("[data-awning]")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Today's greeting and comparison sentence", () => {
  const t = translator("en");
  const f = { t };
  const d = (visits: number, typical: number) => ({ visits, typicalVisitsFullDay: 0, typicalVisitsSoFar: typical, newMembers: 0, newViaQr: 0, stampsGiven: 0, redemptions: 0, regularsSeen: 0, regularsTotal: 0 });
  it("greets by the shop's hour", () => {
    expect(greetingKey(8, true)).toBe("shell.today.goodMorning");
    expect(greetingKey(13, true)).toBe("shell.today.goodAfternoon");
    expect(greetingKey(19, false)).toBe("shell.today.goodEveningPlain");
    expect(t("shell.today.goodMorning", { name: "Sana" })).toBe("Good morning, Sana");
  });
  it("compares today so far with a usual day", () => {
    expect(compareSentence(d(38, 30), "Wednesday", f)).toBe("38 visits so far, busier than a usual Wednesday");
    expect(compareSentence(d(20, 30), "Wednesday", f)).toBe("20 visits so far, quieter than a usual Wednesday");
    expect(compareSentence(d(30, 31), "Wednesday", f)).toBe("30 visits so far, about the same as a usual Wednesday");
    expect(compareSentence(d(0, 30), "Wednesday", f)).toBe("No visits yet today");
    expect(compareSentence(d(5, 0), "Wednesday", f)).toBe("5 visits so far today");
    expect(compareSentence(undefined, "Wednesday", f)).toBeNull();
  });
  it("is written in every language", () => {
    for (const l of ["hi", "ur", "pa"] as const) {
      const tl = translator(l);
      expect(tl("shell.today.goodMorning", { name: "Sana" })).toContain("Sana");
      expect(compareSentence(d(38, 30), "X", { t: tl })).toContain("38");
      expect(compareSentence(d(38, 30), "X", { t: tl })).not.toBe(compareSentence(d(38, 30), "X", f));
    }
  });
});
