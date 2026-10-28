"use client";
/**
 * Two things a grocer's cashier needs on the amount screen (docs/research/grocers.md, frame D2):
 *  - "Not counted": tobacco, vapes, lottery, alcohol, gift cards and bill payments are in the till total but never earn points.
 *  - "Bought a bulk item?": one tap logs a 20 lb bag of atta so the shop can text before the customer runs out. The cashier asks once.
 * Pure display: CounterApp owns the state and sends it with the award.
 */
import { useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Keypad } from "@/components/ui/Keypad";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { applyKey, centsFromKeypad, keypadDisplay, type KeypadKey } from "@/lib/dashboard/counter";

export interface GroceryCounter {
  /** What can be logged: active pantry items. Empty when the shop has not turned pantry reminders on. */
  pantryItems: { id: string; name: string }[];
  /** The line the cashier reads before ticking "asked". */
  askText: string;
}

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Dollars typed in the "not counted" field to cents (0 when empty or not a number). */
export function notCountedCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** The "not counted" dollars as the till keypad's digits ("12.50" is "1250"): the keypad fills from the right like the purchase amount. */
const digitsOf = (v: string): string => {
  const c = notCountedCents(v);
  return c > 0 ? String(c) : "";
};

export function GroceryExtras({ grocery, cents, notCounted, setNotCounted, bulk, setBulk, remind, setRemind }: { grocery: GroceryCounter; cents: string; notCounted: string; setNotCounted: (v: string) => void; bulk: string[]; setBulk: (v: string[]) => void; remind: boolean; setRemind: (v: boolean) => void }) {
  const { t } = useLocaleOrEnglish();
  const total = centsFromKeypad(cents);
  const excluded = notCountedCents(notCounted);
  const over = excluded > total;
  // Both start folded: most sales have neither, and the Award button should not be pushed off the screen by them.
  const [ncOpen, setNcOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const ncShown = ncOpen || excluded > 0;
  const bulkShown = bulkOpen || bulk.length > 0;
  const press = (k: KeypadKey) => {
    const next = applyKey(digitsOf(notCounted), k);
    setNotCounted(next ? (centsFromKeypad(next) / 100).toFixed(2) : "");
  };
  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={ncShown}
          aria-controls="not-counted-pad"
          onClick={() => setNcOpen(!ncShown)}
          className="flex min-h-11 items-center justify-between gap-3 rounded-input text-start focus-visible:focus-ring"
        >
          <span className="text-meta-strong text-fg">{t("counter.g.notCounted")}</span>
          <span className={cn("text-meta tabular-nums", over ? "font-medium text-negative" : "text-fg-muted")}>
            {over ? t("counter.g.over") : excluded > 0 ? (total > 0 ? t("counter.g.counts", { excluded: dollars(excluded), counts: dollars(total - excluded) }) : dollars(excluded)) : t("counter.g.hint")}
          </span>
        </button>
        {ncShown ? (
          <div id="not-counted-pad" className="flex flex-col gap-2">
            <output aria-live="polite" aria-label={t("counter.g.notCounted")} className={cn("block border-b px-1 py-2 text-end font-display text-display-number tabular-nums", over ? "border-negative text-negative" : "border-line text-fg")}>
              {keypadDisplay(digitsOf(notCounted))}
            </output>
            <Keypad size="compact" onKey={press} label={t("counter.g.keypad")} />
          </div>
        ) : null}
      </div>
      {grocery.pantryItems.length ? (
        <div className="flex flex-col gap-2">
          <button type="button" aria-expanded={bulkShown} aria-controls="bulk-chips" onClick={() => setBulkOpen(!bulkShown)} className="flex min-h-11 items-center justify-between gap-3 text-start focus-visible:focus-ring" id="bulk-label">
            <span className="text-meta-strong text-fg">{t("counter.g.bulk")}</span>
            <span className="text-meta text-fg-muted">{bulk.length ? t("counter.g.picked", { n: bulk.length }) : t("counter.g.tapLog")}</span>
          </button>
          {bulkShown ? (
            <div id="bulk-chips" role="group" aria-labelledby="bulk-label" className="flex flex-wrap gap-2">
              {grocery.pantryItems.map((i) => {
                const on = bulk.includes(i.id);
                return (
                  <button
                    key={i.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setBulk(on ? bulk.filter((x) => x !== i.id) : [...bulk, i.id])}
                    className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-meta transition-colors focus-visible:focus-ring", on ? "border-fg bg-fg font-medium text-bg" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
                  >
                    {i.name}
                  </button>
                );
              })}
            </div>
          ) : null}
          {bulk.length ? <Checkbox checked={remind} onChange={setRemind} label={t("counter.g.remind")} caption={t("counter.g.ask", { ask: grocery.askText })} /> : null}
        </div>
      ) : null}
    </div>
  );
}
