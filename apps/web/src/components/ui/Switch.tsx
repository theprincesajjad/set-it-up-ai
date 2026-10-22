"use client";
import { useId } from "react";
import { cn } from "@/lib/cn";

/** For settings that apply immediately. Label on the left describes the on-state. */
export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-body text-fg">
          {label}
        </label>
        {description ? <span className="text-body-sm text-fg-muted">{description}</span> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full transition-colors focus-visible:focus-ring disabled:opacity-60",
          checked ? "bg-brand" : "bg-border-strong",
        )}
      >
        <span className={cn("inline-block size-6 rounded-full bg-surface shadow-sm transition-transform duration-150 ease-standard", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
    </div>
  );
}
