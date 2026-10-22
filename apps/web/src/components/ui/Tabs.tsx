"use client";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Optional count / badge after the label. */
  meta?: ReactNode;
}

/** Underline page tabs with roving focus + arrow keys (system.md §3 Tabs). */
export function Tabs({ items, value, onChange, label, className }: { items: TabItem[]; value: string; onChange: (id: string) => void; label: string; className?: string }) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next]!.id);
  };
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]", className)}>
      {items.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${base}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "-mb-px inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-label transition-colors focus-visible:focus-ring",
              active ? "border-brand text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.meta}
          </button>
        );
      })}
    </div>
  );
}

/** Panel paired with Tabs: give it the same `label` base by rendering inside the same component tree. */
export function TabPanel({ active, children, className }: { active: boolean; children: ReactNode; className?: string }) {
  if (!active) return null;
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
}
