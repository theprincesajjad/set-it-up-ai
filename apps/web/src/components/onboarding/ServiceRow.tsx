"use client";
import { Plus } from "lucide-react";
import { useId, type ReactNode } from "react";
import { SwitchControl } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";

export interface ServiceRowProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  name: string;
  duration: string;
  price: string;
  onDurationChange?: (v: string) => void;
  onPriceChange?: (v: string) => void;
  /** Deposit toggle with its amount. Omit to hide it. */
  deposit?: { on: boolean; onChange: (v: boolean) => void; label: string; amount?: ReactNode };
  labels: { duration: string; price: string };
  /** Visible units beside the fields ("min" after the duration, "$" before the price), so "20" and "25" read as 20 min and $25. */
  units?: { duration?: string; price?: string };
  className?: string;
}

const field = "h-8 rounded-r2 border border-input bg-card px-2 text-body tabular-nums text-foreground focus-visible:focus-ring";

/**
 * A checklist row (docs/design/onboarding-v1.md section 5): 20 px checkbox, name 13/550, duration and price as slim 32 px tabular fields, a deposit
 * toggle with its amount. Hairline between rows (use inside a list), no left border.
 */
export function ServiceRow({ checked, onCheckedChange, name, duration, price, onDurationChange, onPriceChange, deposit, labels, units, className }: ServiceRowProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3 last:border-b-0", className)}>
      <label htmlFor={id} className="relative flex min-w-0 flex-1 basis-40 cursor-pointer items-center gap-3 after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} className="size-5 shrink-0 accent-[var(--primary)]" />
        <span className="truncate text-body font-[550] text-foreground">{name}</span>
      </label>
      <span className="inline-flex items-center gap-1.5">
        <input aria-label={labels.duration} value={duration} onChange={(e) => onDurationChange?.(e.target.value)} readOnly={!onDurationChange} inputMode="numeric" className={cn(field, "w-16 text-end")} />
        {units?.duration ? <span aria-hidden className="text-meta text-muted-foreground">{units.duration}</span> : null}
      </span>
      <span className="inline-flex items-center gap-1.5">
        {units?.price ? <span aria-hidden className="text-meta text-muted-foreground">{units.price}</span> : null}
        <input aria-label={labels.price} value={price} onChange={(e) => onPriceChange?.(e.target.value)} readOnly={!onPriceChange} inputMode="decimal" className={cn(field, "w-20 text-end")} />
      </span>
      {deposit ? (
        <span className="flex items-center gap-2 text-meta text-muted-foreground">
          <SwitchControl checked={deposit.on} onChange={deposit.onChange} ariaLabel={deposit.label} />
          <span aria-hidden>{deposit.label}</span>
          {/* The amount always keeps its slot, so rows with and without a deposit line up and nothing shifts when it is switched. */}
          <span className="inline-block w-14 tabular-nums text-foreground">{deposit.on && deposit.amount ? deposit.amount : null}</span>
        </span>
      ) : null}
    </div>
  );
}

/** "+ Add a service": a dashed hairline row. */
export function AddRow({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-r4 border border-dashed border-border-strong text-body font-[550] text-muted-foreground hover:bg-hover focus-visible:focus-ring", className)}>
      <Plus aria-hidden className="size-4" />
      {/* The icon is the plus: a label that starts with one would read "+ + Add". */}
      {label.replace(/^\+\s*/, "")}
    </button>
  );
}
