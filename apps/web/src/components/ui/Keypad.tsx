"use client";
import { Delete, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export type KeypadValue = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back" | "clear";

export type KeypadSize = "counter" | "kiosk" | "compact";

/**
 * v3 key (Figma 15:2, 15:130): a white key on the warm pane with a soft shadow, heavy display numerals, 18 radius. Counter keys are 72 px, kiosk keys 88 px,
 * both on an 8 px grid gap. `compact` (the amount pad and Not counted pad, stacked under other content) is 56 px on a phone and 72 px from
 * the tablet breakpoint up.
 */
export function keypadKeyClass(size: KeypadSize = "counter") {
  const h = size === "kiosk" ? "h-22" : size === "compact" ? "h-14 lg:h-18" : "h-18";
  return cn(
    "flex items-center justify-center rounded-2xl bg-card font-sans text-h1 font-semibold tabular-nums text-foreground shadow-card",
    "transition-colors duration-150 ease-out hover:bg-hover active:bg-hover focus-visible:focus-ring disabled:opacity-60",
    h,
  );
}

/** 3 x 4 counter keypad (system.md "Keypad"): 72px keys, clear / 0 / backspace on the last row. */
export function Keypad({ onKey, size = "counter", className, label }: { onKey: (k: KeypadValue) => void; size?: KeypadSize; className?: string; label?: string }) {
  const { t } = useLocaleOrEnglish();
  const keys: KeypadValue[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
  return (
    <div role="group" aria-label={label ?? t("ui.keypad")} dir="ltr" className={cn("grid grid-cols-3 gap-2", className)}>
      {keys.map((k) => (
        <button key={k} type="button" onClick={() => onKey(k)} aria-label={k === "back" ? t("ui.delete") : k === "clear" ? t("ui.clear") : k} className={keypadKeyClass(size)}>
          {k === "back" ? <Delete aria-hidden className="size-6" strokeWidth={1.75} /> : k === "clear" ? <X aria-hidden className="size-6" strokeWidth={1.75} /> : k}
        </button>
      ))}
    </div>
  );
}
