"use client";
import { Delete, ScanLine } from "lucide-react";
import { cn } from "@/lib/cn";
import { keypadKeyClass } from "@/components/ui/Keypad";

/**
 * The last 4 digits of their phone as one display field (Figma 15:2): the dimmed mask stands for the digits the counter never asks for,
 * the typed digits are heavy, and the next empty slot is underlined. Always left to right, also on an Urdu page.
 */
export function DigitBoxes({ value, className }: { value: string; className?: string }) {
  return (
    <div role="group" aria-label="Last 4 digits of their phone" dir="ltr" className={cn("flex h-16 items-center justify-center gap-1 rounded-xl border border-border bg-background px-5 font-display text-display tabular-nums text-foreground", className)}>
      <span aria-hidden className="text-subtle-foreground">(•••) •••-</span>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          aria-label={value[i] ? `Digit ${i + 1}: ${value[i]}` : `Digit ${i + 1}: empty`}
          className={cn("inline-flex w-[0.7em] justify-center border-b-[3px]", i === value.length ? "border-foreground" : "border-transparent")}
        >
          {value[i] ?? " "}
        </span>
      ))}
    </div>
  );
}

/**
 * 1 to 9, then scan, 0 and a delete key: 72 px keys on an 8 px gap (Figma 15:2). The scan key opens the camera (CounterApp passes `onScanKey`;
 * the PIN pad passes none and the cell stays empty). Digits always run left to right.
 */
export function ScanKeypad({ onKey, disabled, onScanKey }: { onKey: (k: string) => void; disabled?: boolean; onScanKey?: () => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "scan", "0", "back"];
  return (
    <div role="group" aria-label="Keypad" dir="ltr" className="grid grid-cols-3 gap-2">
      {keys.map((k) =>
        k === "scan" && !onScanKey ? (
          <span key={k} aria-hidden />
        ) : (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => (k === "scan" ? onScanKey?.() : onKey(k))}
            aria-label={k === "back" ? "Delete" : k === "scan" ? "Scan with the camera" : k}
            className={keypadKeyClass("counter")}
          >
            {k === "back" ? <Delete aria-hidden className="size-6" strokeWidth={1.75} /> : k === "scan" ? <ScanLine aria-hidden className="size-6" strokeWidth={1.75} /> : k}
          </button>
        ),
      )}
    </div>
  );
}
