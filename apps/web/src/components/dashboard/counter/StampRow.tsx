"use client";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

const SIZE = { sm: "size-8", md: "size-11", lg: "size-14" } as const;
const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6" };

/**
 * Stamp circles in a grid (Figma 30, Main Street Warm): the shop's trade colour with the trade's own stamp icon (a cup for a café, scissors for a
 * salon) when earned, a dashed hairline ring when empty. Without an `icon` the earned stamp carries a check. `popFrom` is the index of the first
 * stamp that just landed: those pop in (`motion-safe`, so reduced motion shows them already placed). A full card, the reward, ends on a check too.
 */
export function StampRow({ goal, filled, size = "md", popFrom, icon: Icon = Check, className }: { goal: number; filled: number; size?: "sm" | "md" | "lg"; popFrom?: number; /** The trade's stamp glyph (`verticalIcon(vertical)`). Default: a check. */ icon?: LucideIcon; className?: string }) {
  const { t } = useLocaleOrEnglish();
  const cols = COLS[Math.min(6, goal <= 6 ? goal : Math.ceil(goal / 2))] ?? "grid-cols-5";
  return (
    <div
      role="img"
      aria-label={t("ui.stampsOf", { n: Math.min(filled, goal), goal })}
      className={cn("grid justify-items-center gap-x-2 gap-y-3.5", cols, className)}
    >
      {Array.from({ length: goal }, (_, i) => {
        const on = i < filled;
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              SIZE[size],
              "inline-flex items-center justify-center rounded-full",
              on ? "bg-trade text-trade-foreground" : "border-2 border-dashed border-border",
              on && popFrom != null && i >= popFrom && "motion-safe:animate-stamp-pop",
            )}
          >
            {on ? <Icon className="size-1/2" strokeWidth={Icon === Check ? 3 : 2} /> : null}
          </span>
        );
      })}
    </div>
  );
}
