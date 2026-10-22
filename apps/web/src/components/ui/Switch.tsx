"use client";
import { useId } from "react";
import { cn } from "@/lib/cn";

/** For settings that apply immediately. iOS proportions (51 × 31), black when on. Label on the left describes the on-state. */
export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-1">
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id} className="text-body text-fg">
          {label}
        </label>
        {description ? <span className="text-meta text-fg-muted">{description}</span> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-150 ease-out focus-visible:focus-ring disabled:opacity-50",
          checked ? "bg-fg" : "bg-bg-muted",
        )}
      >
        <span className={cn("inline-block size-[27px] rounded-full bg-[#FFFFFF] shadow-[0_2px_4px_rgba(0,0,0,0.15),0_0_0_0.5px_rgba(0,0,0,0.04)] transition-transform duration-200 ease-out", checked ? "translate-x-[22px]" : "translate-x-[2px]")} />
      </button>
    </div>
  );
}
