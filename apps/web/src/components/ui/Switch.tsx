"use client";
import { useId } from "react";
import { cn } from "@/lib/cn";

/** Just the toggle, for rows that carry their own title and hint (Rewards "At the counter"). */
export function SwitchControl({ checked, onChange, ariaLabel, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; ariaLabel: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-150 ease-out after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] focus-visible:focus-ring disabled:opacity-50",
        checked ? "bg-fg" : "bg-bg-muted",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-bg shadow-sm transition-transform duration-200 ease-out", checked ? "translate-x-4.5 rtl:-translate-x-4.5" : "translate-x-0.5 rtl:-translate-x-0.5")} />
    </button>
  );
}

/** For settings that apply immediately. 40 × 24 with a 44 px hit area, black when on. Label on the left describes the on-state. */
export function Switch({ checked, onChange, label, description, disabled, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean; /** When the visible label is short ("Mute this shop"), the full spoken name. */ ariaLabel?: string }) {
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
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-150 ease-out after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] focus-visible:focus-ring disabled:opacity-50",
          checked ? "bg-fg" : "bg-bg-muted",
        )}
      >
        <span className={cn("inline-block size-5 rounded-full bg-bg shadow-sm transition-transform duration-200 ease-out", checked ? "translate-x-4.5 rtl:-translate-x-4.5" : "translate-x-0.5 rtl:-translate-x-0.5")} />
      </button>
    </div>
  );
}
