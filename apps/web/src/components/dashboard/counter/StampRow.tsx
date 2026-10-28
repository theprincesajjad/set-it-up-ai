import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const SIZE = { sm: "size-8", md: "size-10", lg: "size-12" } as const;
const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6" };

/**
 * Stamp circles in a grid (Figma 15:2): points orange with a check when earned, a hairline ring when empty. `popFrom` is the index of the first
 * stamp that just landed: those pop in (`motion-safe`, so reduced motion shows them already placed). A full card, the reward, ends on a check too.
 */
export function StampRow({ goal, filled, size = "md", popFrom, className }: { goal: number; filled: number; size?: "sm" | "md" | "lg"; popFrom?: number; className?: string }) {
  const cols = COLS[Math.min(6, goal <= 6 ? goal : Math.ceil(goal / 2))] ?? "grid-cols-5";
  return (
    <div
      role="img"
      aria-label={`${Math.min(filled, goal)} of ${goal} stamps`}
      className={cn("grid justify-items-center gap-x-2 gap-y-3", cols, className)}
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
              on ? "bg-points text-points-foreground" : "border-2 border-border",
              on && popFrom != null && i >= popFrom && "motion-safe:animate-stamp-pop",
            )}
          >
            {on ? <Check className="size-1/2" strokeWidth={3} /> : null}
          </span>
        );
      })}
    </div>
  );
}
