"use client";
/**
 * A number that counts from its previous value (or `from`) to the new one: ≤ 400 ms ease-out, tabular,
 * no animation with prefers-reduced-motion. The final value is what screen readers and SSR see.
 */
import { useEffect, useRef, useState } from "react";

export function CountUp({ value, from, format = (n) => n.toLocaleString("en-CA"), duration = 380, className }: { value: number; from?: number; format?: (n: number) => string; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const last = useRef(from ?? value);
  useEffect(() => {
    const start = last.current;
    last.current = value;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || start === value) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setShown(Math.round(start + (value - start) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}
