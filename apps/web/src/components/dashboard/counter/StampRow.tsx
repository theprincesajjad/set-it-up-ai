import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** A row of stamp circles: accent with a check when earned, hairline ring when empty. */
export function StampRow({ goal, filled, size = 28, className }: { goal: number; filled: number; size?: number; className?: string }) {
  return (
    <div role="img" aria-label={`${Math.min(filled, goal)} of ${goal} stamps`} className={cn("flex flex-wrap justify-center gap-2", className)}>
      {Array.from({ length: goal }, (_, i) => {
        const on = i < filled;
        return (
          <span key={i} aria-hidden style={{ width: size, height: size }} className={cn("inline-flex items-center justify-center rounded-full", on ? "bg-accent text-on-accent" : "shadow-[inset_0_0_0_1.5px_var(--ll-color-line)]")}>
            {on ? <Check className="size-[55%]" strokeWidth={3} /> : null}
          </span>
        );
      })}
    </div>
  );
}
