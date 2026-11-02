"use client";
/**
 * Kit (wave Q): progress through a short stepped flow (signup, a setup wizard, booking). Built on the ReUI Stepper (components/primitives/
 * stepper): one segment per step, finished steps filled, the current one half filled, with an optional label row from md.
 *
 *   <StepProgress step={2} total={6} label={t("sf.progress", { n: 2, total: 6 })} />
 *   <StepProgress step={3} total={4} labels={["Service", "Time", "Details", "Confirm"]} label="Booking progress" />
 *   <StepProgress step={null} total={6} />            all filled (the celebration screen)
 *
 * Tone: `trade` (default) is the shop's colour (bg-trade, so it follows shopColorProps); `ink` is black (owner and admin chrome).
 * Not interactive (the flow owns Back); exposed as one progressbar with the "Step 2 of 6" text. RTL: fills from the inline start.
 * Reduced motion: the fill jumps instead of sliding.
 */
import { Stepper, StepperItem } from "@/components/primitives/stepper";
import { cn } from "@/lib/utils";

export interface StepProgressProps {
  /** 1-based current step; null means finished (all filled). */
  step: number | null;
  total: number;
  /** The accessible text, usually the same "Step 2 of 6" the screen shows. */
  label?: string;
  /** Short step names, shown under the segments from md (keep them to one or two words). */
  labels?: string[];
  tone?: "trade" | "ink";
  /** "bar" (segments, default) or "line" (one continuous 3px line, the pre-kit look, for tight headers). */
  variant?: "bar" | "line";
  className?: string;
}

export function StepProgress({ step, total, label, labels, tone = "trade", variant = "bar", className }: StepProgressProps) {
  const current = step ?? total + 1;
  const fill = tone === "trade" ? "bg-trade" : "bg-primary";
  const done = Math.min(total, Math.max(0, current - 1));
  if (variant === "line") {
    const pct = step === null ? 100 : Math.round((done / total) * 100);
    return (
      <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={label} aria-label={label} className={cn("h-0.75 w-full bg-lg-seg-track", className)} data-step-progress>
        <div className={cn("h-full transition-[width] duration-500 ease-out motion-reduce:transition-none", fill)} style={{ width: `${pct}%` }} />
      </div>
    );
  }
  return (
    <Stepper
      value={current}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={label}
      aria-label={label}
      aria-orientation={undefined}
      className={className}
      data-step-progress
    >
      {/* Not StepperNav: that is a <nav>, and progress is not navigation (the signup header must have no nav landmark). */}
      <div data-slot="stepper-nav" data-orientation="horizontal" className="group/stepper-nav flex w-full flex-row gap-1">
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const state = n < current ? "completed" : n === current ? "active" : "inactive";
          return (
            <StepperItem key={n} step={n} className="flex min-w-0 flex-1 flex-col items-stretch gap-2 not-last:flex-1 group-data-[orientation=horizontal]/stepper-nav:flex-col" aria-hidden>
              <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-lg-seg-track">
                <span
                  className={cn(
                    "absolute inset-0 rounded-full ltr:origin-left rtl:origin-right transition-transform duration-500 ease-out motion-reduce:transition-none",
                    fill,
                    state === "completed" ? "scale-x-100" : state === "active" ? "scale-x-50" : "scale-x-0",
                  )}
                />
              </span>
              {labels?.[i] ? (
                <span className={cn("truncate text-caption font-[550] max-md:hidden", state === "inactive" ? "text-muted-foreground" : "text-foreground")}>{labels[i]}</span>
              ) : null}
            </StepperItem>
          );
        })}
      </div>
    </Stepper>
  );
}
