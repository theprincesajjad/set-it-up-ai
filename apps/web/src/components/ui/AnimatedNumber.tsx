"use client";
/**
 * Kit (wave Q): a number that rolls digit by digit to its new value. @number-flow/react 0.6.2 (MIT), themed by inheritance (it takes the
 * surrounding font, size, weight and colour; tabular figures are on).
 *
 *   <AnimatedNumber value={32} />                                     32, rolls from 0 on first view (countUp), then between values
 *   <AnimatedNumber value={1290} format={{ style: "currency", currency: "CAD" }} />   cents are your job: pass dollars
 *   <AnimatedNumber value={0.42} format={{ style: "percent" }} countUp={false} />
 *
 * Accessibility and tests: the rolling digits are aria-hidden; a visually hidden plain-text copy carries the final value, so screen readers
 * read one number once and `getByText("32")` keeps working in jsdom and Playwright. prefers-reduced-motion: no roll, no count-up (NumberFlow
 * honours it, and `countUp` is skipped). Locale: the active language's BCP 47 tag (Latin digits in all four languages). RTL: numbers stay LTR
 * inside (`dir="ltr"` on the digits) so "+16" never turns into "16+".
 */
import NumberFlow, { type Format } from "@number-flow/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export interface AnimatedNumberProps {
  value: number;
  /** Intl.NumberFormat options (currency, percent, compact, decimals). */
  format?: Format;
  /** Text before / after the number inside the roll ("+", " pts"). */
  prefix?: string;
  suffix?: string;
  /** Count up from 0 the first time it is shown. Default true. */
  countUp?: boolean;
  /** Colour the change: up = success text, down = destructive text, for a short moment. Default off. */
  trendTint?: boolean;
  className?: string;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function AnimatedNumber({ value, format, prefix, suffix, countUp = true, trendTint, className }: AnimatedNumberProps) {
  const { info } = useLocaleOrEnglish();
  // With countUp the digits start at 0 and roll to the value right after mount (the dashboard's tiles mount when their data arrives, so the
  // roll is the "numbers just came in" moment). The sr-only copy always holds the real value, also for SSR and no-JS.
  const [shown, setShown] = useState(countUp ? 0 : value);
  const [tint, setTint] = useState<"up" | "down" | null>(null);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === null) {
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    setShown(value);
    if (!trendTint || before === value || prefersReducedMotion()) return;
    setTint(value > before ? "up" : "down");
    const id = window.setTimeout(() => setTint(null), 900);
    return () => window.clearTimeout(id);
  }, [value, trendTint]);
  const text = new Intl.NumberFormat(info.bcp47, format).format(value);
  return (
    <span className={cn("relative inline-flex tabular-nums", tint === "up" && "text-success-text", tint === "down" && "text-destructive-text", "transition-colors duration-500", className)}>
      <span className="sr-only">{`${prefix ?? ""}${text}${suffix ?? ""}`}</span>
      <span aria-hidden dir="ltr" className="inline-flex">
        <NumberFlow value={shown} locales={info.bcp47} format={format} prefix={prefix} suffix={suffix} willChange={false} />
      </span>
    </span>
  );
}
