"use client";
/**
 * Two things a grocer's cashier needs on the amount screen (docs/research/grocers.md, frame D2):
 *  - "Not counted": tobacco, vapes, lottery, alcohol, gift cards and bill payments are in the till total but never earn points.
 *  - "Bought a bulk item?": one tap logs a 20 lb bag of atta so the shop can text before the customer runs out. The cashier asks once.
 * Pure display: CounterApp owns the state and sends it with the award.
 */
import { Checkbox } from "@/components/ui/Checkbox";
import { cn } from "@/lib/cn";
import { centsFromKeypad } from "@/lib/dashboard/counter";

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

export function GroceryExtras({ grocery, cents, notCounted, setNotCounted, bulk, setBulk, remind, setRemind }: { grocery: GroceryCounter; cents: string; notCounted: string; setNotCounted: (v: string) => void; bulk: string[]; setBulk: (v: string[]) => void; remind: boolean; setRemind: (v: boolean) => void }) {
  const total = centsFromKeypad(cents);
  const excluded = notCountedCents(notCounted);
  const over = excluded > total;
  return (
    <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="not-counted" className="text-meta-strong text-fg">Not counted</label>
        <div className="flex items-center gap-3">
          <div className="relative w-40">
            <span aria-hidden className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-body text-fg-muted">$</span>
            <input
              id="not-counted"
              inputMode="decimal"
              autoComplete="off"
              value={notCounted}
              onChange={(e) => setNotCounted(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              aria-invalid={over || undefined}
              className="h-11 w-full rounded-input border border-line bg-bg ps-7 pe-3 text-body tabular-nums text-fg outline-none focus:border-fg focus:ring-1 focus:ring-fg aria-[invalid=true]:border-negative"
            />
          </div>
          <p className={cn("text-meta", over ? "font-medium text-negative" : "text-fg-muted")}>
            {over ? "More than the total." : excluded > 0 && total > 0 ? `${dollars(total - excluded)} counts` : "Tobacco, lottery, alcohol, gift cards, bills"}
          </p>
        </div>
      </div>
      {grocery.pantryItems.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-meta-strong text-fg" id="bulk-label">Bought a bulk item?</p>
          <div role="group" aria-labelledby="bulk-label" className="flex flex-wrap gap-2">
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
          {bulk.length ? <Checkbox checked={remind} onChange={setRemind} label="Customer said yes to a restock text" caption={`Ask: "${grocery.askText}" Only tick it if they say yes.`} /> : null}
        </div>
      ) : null}
    </div>
  );
}
