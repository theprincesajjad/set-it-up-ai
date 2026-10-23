"use client";
import { cn } from "@/lib/cn";

/** Four boxes for the last 4 digits; the next empty one is outlined black. */
export function DigitBoxes({ value, className }: { value: string; className?: string }) {
  return (
    <div role="group" aria-label="Last 4 digits of their phone" className={cn("flex justify-center gap-2.5", className)}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          aria-label={value[i] ? `Digit ${i + 1}: ${value[i]}` : `Digit ${i + 1}: empty`}
          className={cn("flex h-14 w-[62px] items-center justify-center rounded-[14px] border text-[28px] font-medium tabular-nums text-fg", i === value.length ? "border-fg" : "border-line")}
        >
          {value[i] ?? ""}
        </span>
      ))}
    </div>
  );
}

/** 1 to 9, then a gap, 0 and Del (the layout on the frames). */
export function ScanKeypad({ onKey, disabled }: { onKey: (k: string) => void; disabled?: boolean }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  return (
    <div role="group" aria-label="Keypad" className="grid grid-cols-3 gap-2">
      {keys.map((k, i) =>
        k === "" ? (
          <span key={`gap-${i}`} aria-hidden />
        ) : (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onKey(k)}
            aria-label={k === "back" ? "Delete" : k}
            className={cn("flex h-[60px] items-center justify-center rounded-[14px] bg-bg-subtle tabular-nums text-fg transition-colors hover:bg-bg-muted active:bg-bg-muted focus-visible:focus-ring disabled:opacity-60", k === "back" ? "text-[15px] text-fg-muted" : "text-[26px]")}
          >
            {k === "back" ? "Del" : k}
          </button>
        ),
      )}
    </div>
  );
}
