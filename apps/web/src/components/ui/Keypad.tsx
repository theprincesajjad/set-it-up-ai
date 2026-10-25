"use client";
import { Delete, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export type KeypadValue = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back" | "clear";

/** 3 x 4 counter keypad (system.md "Keypad"): 72px keys, clear / 0 / backspace on the last row. */
export function Keypad({ onKey, size = "counter", className, label }: { onKey: (k: KeypadValue) => void; size?: "counter" | "kiosk" | "compact"; className?: string; label?: string }) {
  const { t } = useLocaleOrEnglish();
  const keys: KeypadValue[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
  const h = size === "kiosk" ? "h-[88px]" : size === "compact" ? "h-14" : "h-[72px]";
  return (
    <div role="group" aria-label={label ?? t("ui.keypad")} className={cn("grid grid-cols-3 gap-2", className)}>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          aria-label={k === "back" ? t("ui.delete") : k === "clear" ? t("ui.clear") : k}
          className={cn("flex items-center justify-center rounded-card bg-bg-subtle text-keypad tabular-nums text-fg transition-colors duration-150 ease-out hover:bg-bg-muted active:bg-bg-muted focus-visible:focus-ring", h)}
        >
          {k === "back" ? <Delete aria-hidden className="size-6" strokeWidth={1.75} /> : k === "clear" ? <X aria-hidden className="size-6" strokeWidth={1.75} /> : k}
        </button>
      ))}
    </div>
  );
}
