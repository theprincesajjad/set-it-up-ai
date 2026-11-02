/** Wave Q kit compositions: the accessible text they expose and the behaviour other teams rely on. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { celebrate } from "@/components/ui/Celebrate";
import { FileDrop } from "@/components/ui/FileDrop";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { StepProgress } from "@/components/ui/StepProgress";

describe("AnimatedNumber", () => {
  it("keeps the real value as plain text (screen readers, getByText) and hides the rolling digits", () => {
    // jsdom gets NumberFlow's server fallback inside the aria-hidden roll too (browsers mount it empty), so read the sr-only copy.
    const { container } = render(<AnimatedNumber value={1290} />);
    expect(container.querySelector(".sr-only")!.textContent).toBe("1,290");
    expect(container.querySelector("[aria-hidden] number-flow-react")).toBeTruthy();
  });
  it("formats with Intl options", () => {
    const { container } = render(<AnimatedNumber value={0.42} format={{ style: "percent" }} countUp={false} />);
    expect(container.querySelector(".sr-only")!.textContent).toBe("42%");
  });
});

describe("StepProgress", () => {
  it("is one progressbar with the step text and a segment per step", () => {
    const { container } = render(<StepProgress step={3} total={6} label="Step 3 of 6" />);
    const bar = screen.getByRole("progressbar", { name: "Step 3 of 6" });
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("aria-valuemax")).toBe("6");
    expect(container.querySelectorAll("[data-slot=stepper-item]")).toHaveLength(6);
    expect(container.querySelectorAll("[data-state=completed]")).toHaveLength(2);
  });
  it("is all filled when finished", () => {
    const { container } = render(<StepProgress step={null} total={4} />);
    expect(container.querySelectorAll("[data-state=completed]")).toHaveLength(4);
  });
});

describe("NumberStepper", () => {
  function Harness() {
    const [n, setN] = useState(60);
    return <NumberStepper label="How many points?" value={n} onChange={setN} min={10} max={70} step={10} hint="10 points each visit." />;
  }
  it("steps by `step`, clamps at max and labels its buttons", () => {
    render(<Harness />);
    const input = screen.getByLabelText("How many points?") as HTMLInputElement;
    expect(input.value).toBe("60");
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(input.value).toBe("70");
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(input.value).toBe("70");
    expect(screen.getByText("10 points each visit.")).toBeTruthy();
  });
});

describe("FileDrop", () => {
  it("refuses a wrong type and a big file in plain words, and hands a good one over", () => {
    const onFile = vi.fn();
    const { container } = render(<FileDrop label="Your logo" accept={["image/png"]} maxMb={1} onFile={onFile} />);
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert").textContent).toContain("PNG");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(2 * 1024 * 1024)], "big.png", { type: "image/png" })] } });
    expect(screen.getByRole("alert").textContent).toContain("1 MB");
    fireEvent.change(input, { target: { files: [new File(["x"], "ok.png", { type: "image/png" })] } });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("celebrate", () => {
  it("does nothing (and loads nothing) under reduced motion", async () => {
    const mm = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", mm);
    await act(async () => {
      await celebrate();
    });
    expect(mm).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(document.querySelector("canvas")).toBeNull();
    vi.unstubAllGlobals();
  });
});
