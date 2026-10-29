"use client";
import { createContext, useContext, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon3d, type Icon3dProps } from "@/components/ui/Icon3d";
import { cn } from "@/lib/cn";

interface GroupCtx {
  value: string | null;
  onValueChange: (v: string) => void;
}
const Ctx = createContext<GroupCtx | null>(null);

export interface ChoiceGroupProps {
  value: string | null;
  onValueChange: (value: string) => void;
  /** Accessible name of the group (or `aria-labelledby`). */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  children: ReactNode;
}

/**
 * `role="radiogroup"` for ChoiceTiles: 3 across from sm, 1 across on phones (object on the start side). Arrow keys move and select (they follow
 * the reading direction: in Urdu the left arrow goes forward), Space selects, one tab stop.
 */
export function ChoiceGroup({ value, onValueChange, className, children, ...aria }: ChoiceGroupProps) {
  const ref = useRef<HTMLDivElement>(null);
  // One tab stop: the checked tile, or the first enabled one when nothing is checked.
  useEffect(() => {
    const radios = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="radio"]:not([aria-disabled="true"])') ?? []);
    if (!radios.length) return;
    const checked = radios.find((r) => r.getAttribute("aria-checked") === "true");
    radios.forEach((r) => r.setAttribute("tabindex", r === (checked ?? radios[0]) ? "0" : "-1"));
  });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const radios = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="radio"]:not([aria-disabled="true"])') ?? []);
    if (!radios.length) return;
    const rtl = getComputedStyle(ref.current!).direction === "rtl";
    const i = Math.max(0, radios.indexOf(document.activeElement as HTMLElement));
    let n = i;
    if (e.key === "Home") n = 0;
    else if (e.key === "End") n = radios.length - 1;
    else {
      const fwd = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
      n = (i + (fwd ? 1 : -1) + radios.length) % radios.length;
    }
    e.preventDefault();
    const next = radios[n]!;
    next.focus();
    const v = next.getAttribute("data-value");
    if (v !== null) onValueChange(v);
  };
  return (
    <Ctx.Provider value={{ value, onValueChange }}>
      <div ref={ref} role="radiogroup" onKeyDown={onKeyDown} className={cn("grid grid-cols-1 gap-3 sm:grid-cols-3", className)} {...aria}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

export interface ChoiceTileProps {
  value: string;
  label: ReactNode;
  /** One muted line, 12 px. */
  hint?: ReactNode;
  icon: Icon3dProps["name"];
  trade?: Icon3dProps["trade"];
  disabled?: boolean;
  className?: string;
}

/**
 * A radio presented as a tile (docs/design/onboarding-v1.md section 5): 1 px hairline, radius 12, 16 padding, a 40 px 3D object, a 14/550 label
 * and a 12 muted hint. Selected: a 2 px black ring, no fill change. Use inside `ChoiceGroup`.
 */
export function ChoiceTile({ value, label, hint, icon, trade, disabled, className }: ChoiceTileProps) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ChoiceTile must be inside ChoiceGroup");
  const checked = ctx.value === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      data-value={value}
      tabIndex={checked ? 0 : -1}
      onClick={() => !disabled && ctx.onValueChange(value)}
      className={cn(
        "flex min-h-14 w-full flex-row items-center gap-4 rounded-r4 border bg-card p-4 text-start text-card-foreground transition-shadow duration-150 focus-visible:focus-ring sm:flex-col sm:items-start sm:gap-3",
        checked ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-border hover:bg-hover",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <Icon3d name={icon} size={40} trade={trade} />
      <span className="min-w-0">
        <span className="block text-[14px] font-[550] leading-5 text-foreground">{label}</span>
        {hint ? <span className="mt-0.5 block text-meta text-muted-foreground">{hint}</span> : null}
      </span>
    </button>
  );
}
