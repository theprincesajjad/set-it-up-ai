"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export interface PresetCardProps {
  name: ReactNode;
  hint?: ReactNode;
  /** A static render of the preset at phone width with the pro's data. */
  children: ReactNode;
  pickLabel: string;
  onPick: () => void;
  selected?: boolean;
  className?: string;
}

/** A 3:4 card with a static render of the preset, a 14/550 name, a 12 hint, and a black "Pick" over the render on hover or focus (always visible on touch). */
export function PresetCard({ name, hint, children, pickLabel, onPick, selected, className }: PresetCardProps) {
  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-r4 border bg-card shadow-card", selected ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-border", className)}>
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        <div className="pointer-events-none size-full" inert>{children}</div>
        <Button size="quick" onClick={onPick} aria-pressed={selected} className="absolute inset-x-4 bottom-4 pointer-fine:opacity-0 pointer-fine:transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100">
          {pickLabel}
        </Button>
      </div>
      <div className="p-4">
        <h3 className="text-[14px] font-[550] leading-5 text-foreground">{name}</h3>
        {hint ? <p className="text-meta text-muted-foreground">{hint}</p> : null}
      </div>
    </article>
  );
}
