"use client";
import { Delete, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type KeypadValue = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back" | "clear";

/** 3 x 4 counter keypad (system.md "Keypad"): 72px keys, clear / 0 / backspace on the last row. */
export function Keypad({ onKey, size = "counter", className, label = "Keypad" }: { onKey: (k: KeypadValue) => void; size?: "counter" | "kiosk" | "compact"; className?: string; label?: string }) {
  const keys: KeypadValue[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
  const h = size === "kiosk" ? "h-[88px]" : size === "compact" ? "h-14" : "h-[72px]";
  return (
    <div role="group" aria-label={label} className={cn("grid grid-cols-3 gap-2", className)}>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          aria-label={k === "back" ? "Delete" : k === "clear" ? "Clear" : k}
          className={cn("flex items-center justify-center rounded-md border border-border bg-surface text-keypad tabular-nums text-fg transition-colors hover:bg-surface-sunken active:bg-surface-sunken focus-visible:focus-ring", h)}
        >
          {k === "back" ? <Delete aria-hidden className="size-7" /> : k === "clear" ? <X aria-hidden className="size-7" /> : k}
        </button>
      ))}
    </div>
  );
}
