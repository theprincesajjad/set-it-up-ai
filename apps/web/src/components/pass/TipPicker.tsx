"use client";
import { useState } from "react";
import { tipChoices } from "@ll/shared";
import { TextField } from "@/components/ui/TextField";
import { useFmt } from "@/components/restaurant/ui";
import { cn } from "@/lib/cn";

export type TipValue = { kind: "preset"; percent: number; cents: number } | { kind: "custom"; cents: number } | { kind: "none"; cents: 0 } | { kind: "cash"; cents: 0 };

/**
 * Tip choices on the pre-tax amount: the shop's presets, custom, no tip, and a cash tip (nothing is added to this payment).
 * A tip is never taxed and never earns points, and it goes to the person named. `onChange` fires with cents to add.
 */
export function TipPicker({ presets, baseCents, staffName, value, onChange }: { presets: number[]; baseCents: number; staffName: string | null; value: TipValue; onChange: (v: TipValue) => void }) {
  const { t, money } = useFmt();
  const [custom, setCustom] = useState("");
  const choices = tipChoices(baseCents, presets);
  const customCents = Math.round((Number.parseFloat(custom) || 0) * 100);
  const over = customCents > baseCents;
  const base = "flex h-14 flex-col items-center justify-center rounded-card border text-center transition-colors focus-visible:focus-ring";
  const on = "border-trade bg-trade text-trade-foreground clear:border-primary clear:bg-primary clear:text-primary-foreground";
  const off = "border-line bg-bg text-fg hover:bg-bg-subtle";
  return (
    <section aria-label={staffName ? t("sv.i.tipTitle", { name: staffName }) : t("sv.i.tipTitleShop")} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-headline text-fg">{staffName ? t("sv.i.tipTitle", { name: staffName }) : t("sv.i.tipTitleShop")}</h2>
        <p className="text-meta text-fg-muted">{t("sv.i.tipBase", { amount: money(baseCents) })}</p>
      </div>
      <div role="radiogroup" aria-label={t("sv.i.tipTitleShop")} className="grid grid-cols-3 gap-2">
        {choices.map((c) => {
          const sel = value.kind === "preset" && value.percent === c.percent;
          return (
            <button key={c.percent} type="button" role="radio" aria-checked={sel} onClick={() => onChange({ kind: "preset", percent: c.percent, cents: c.cents })} className={cn(base, sel ? on : off)}>
              <span className="text-body-strong tabular-nums" dir="ltr">{c.percent}%</span>
              <span className={cn("text-caption tabular-nums", sel ? "text-trade-foreground/90 clear:text-primary-foreground/90" : "text-fg-muted")}>{money(c.cents)}</span>
            </button>
          );
        })}
        {([["custom", t("sv.i.custom")], ["none", t("sv.i.noTip")], ["cash", t("sv.i.cashTip")]] as const).map(([k, label]) => {
          const sel = value.kind === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => onChange(k === "custom" ? { kind: "custom", cents: Math.min(customCents, baseCents) } : k === "none" ? { kind: "none", cents: 0 } : { kind: "cash", cents: 0 })}
              className={cn(base, "h-11 rounded-full text-meta-strong", sel ? on : off)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {value.kind === "custom" ? (
        <TextField
          label={t("sv.i.customLabel")}
          inputMode="decimal"
          prefix="$"
          value={custom}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.]/g, "");
            setCustom(v);
            onChange({ kind: "custom", cents: Math.min(Math.round((Number.parseFloat(v) || 0) * 100), baseCents) });
          }}
          error={over ? t("sv.i.customOver", { amount: money(baseCents) }) : null}
        />
      ) : null}
      {value.kind === "cash" ? <p className="text-meta text-fg-muted">{t("sv.i.cashNote")}</p> : null}
    </section>
  );
}
