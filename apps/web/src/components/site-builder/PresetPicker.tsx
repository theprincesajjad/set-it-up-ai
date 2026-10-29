"use client";
/**
 * The three presets as a radio group. TODO(C): swap the tile for components/onboarding/PresetCard when it lands.
 */
import { LayoutTemplate, Store, UserRound } from "lucide-react";
import type { KeyboardEvent } from "react";
import { SITE_PRESETS, type SitePreset } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";

const ICON = { studio: LayoutTemplate, portfolio: UserRound, shopfront: Store } as const;

export function PresetPicker({ value, onChange, disabled }: { value: SitePreset; onChange: (p: SitePreset) => void; disabled?: boolean }) {
  const c = copy.siteBuilder;
  const move = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = SITE_PRESETS[(i + d + SITE_PRESETS.length) % SITE_PRESETS.length]!;
    onChange(next);
    (e.currentTarget.parentElement?.querySelector(`[data-preset="${next}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={c.lookTitle} className="flex flex-col gap-2 px-4 pb-4">
      {SITE_PRESETS.map((p, i) => {
        const Icon = ICON[p];
        const on = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-preset={p}
            disabled={disabled}
            onClick={() => onChange(p)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              "flex min-h-16 items-start gap-3 rounded-r4 p-3 text-start transition-colors focus-visible:focus-ring",
              on ? "bg-row-sel ring-2 ring-ring" : "hairline-inset hover:bg-muted",
            )}
          >
            <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-r3", on ? "bg-trade-tint text-trade" : "bg-tile text-foreground")}>
              <Icon aria-hidden className="size-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-body-strong text-foreground">{c.presets[p].name}</span>
              <span className="block text-body text-muted-foreground">{c.presets[p].blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
