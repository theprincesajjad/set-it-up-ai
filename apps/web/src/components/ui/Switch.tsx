"use client";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** One track and one thumb for both exports. The track and the thumb move together (150 ms); while pressed the thumb stretches toward the
 * other side, so the finger gets an answer before the value flips. */
function trackClass(checked: boolean) {
  return cn(
    "group relative inline-flex h-6 w-10 shrink-0 select-none items-center rounded-full transition-colors duration-tap ease-out [-webkit-tap-highlight-color:transparent] after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50",
    checked ? "bg-primary" : "bg-bg-muted clear:bg-muted clear:ring-1 clear:ring-inset clear:ring-input",
  );
}
function thumbClass(checked: boolean) {
  return cn(
    "inline-block size-5 rounded-full bg-bg shadow-sm transition-[translate,scale] duration-tap ease-out motion-safe:group-enabled:group-active:scale-x-[1.2]",
    checked ? "translate-x-4.5 ltr:origin-right rtl:-translate-x-4.5 rtl:origin-left" : "translate-x-0.5 ltr:origin-left rtl:-translate-x-0.5 rtl:origin-right",
  );
}

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
      className={trackClass(checked)}
    >
      <span className={thumbClass(checked)} />
    </button>
  );
}

/** For settings that apply immediately. 40 × 24 with a 44 px hit area, black when on. Label on the left describes the on-state. */
export function Switch({ checked, onChange, label, description, disabled, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; label: string; /** Text, or text with a link: a disabled switch says what it needs and links to where that is done. */ description?: ReactNode; disabled?: boolean; /** When the visible label is short ("Mute this shop"), the full spoken name. */ ariaLabel?: string }) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-1">
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id} className="text-body text-fg">
          {label}
        </label>
        {description ? <span id={`${id}-desc`} className="text-meta text-fg-muted">{description}</span> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={trackClass(checked)}
      >
        <span className={thumbClass(checked)} />
      </button>
    </div>
  );
}
