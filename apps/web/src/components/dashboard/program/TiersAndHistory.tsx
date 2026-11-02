"use client";
/**
 * wave-n: rules.
 *  - TiersEditor: smaller rewards on the way to the card's goal ("At 5 stamps: free polish"). Each is a reward costing fewer stamps.
 *  - ChangeHistory: who changed the rules and rewards, when, and what it was before.
 */
import { History, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { Button, IconButton } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { formatMoney } from "@/lib/format";
import type { TierDraft } from "@/lib/dashboard/program";

export function TiersEditor({ tiers, goal, onChange, error, disabled, locked }: { tiers: TierDraft[]; goal: number; onChange: (t: TierDraft[]) => void; error?: string | null; disabled?: boolean; locked?: boolean }) {
  if (locked)
    return <p className="text-sm text-fg-muted">Smaller rewards on the way (for example 5 stamps for a small treat, 10 for the big one) come with Pro.</p>;
  const set = (i: number, patch: Partial<TierDraft>) => onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const nextFree = () => {
    for (let n = Math.max(1, Math.floor(goal / 2)); n >= 1; n--) if (!tiers.some((t) => t.pointsCost === n)) return n;
    return 1;
  };
  return (
    <div className="flex flex-col gap-3">
      {tiers.length ? (
        <ul className="flex flex-col gap-3">
          {tiers.map((t, i) => (
            <li key={t.id ?? `new-${i}`} className="flex flex-wrap items-end gap-3">
              <TextField
                label="At stamps"
                inputMode="numeric"
                value={t.pointsCost ? String(t.pointsCost) : ""}
                onChange={(e) => set(i, { pointsCost: Number.parseInt(e.target.value.replace(/\D/g, ""), 10) || 0 })}
                disabled={disabled}
                className="w-28"
              />
              <TextField label="Reward" value={t.name} maxLength={120} placeholder="Free polish change" onChange={(e) => set(i, { name: e.target.value })} disabled={disabled} className="min-w-48 flex-1" />
              <IconButton icon={Trash2} label={`Remove the ${t.pointsCost}-stamp reward`} size={48} disabled={disabled} onClick={() => onChange(tiers.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">Optional. Give a small reward part way, and customers can take it or keep saving for the big one.</p>
      )}
      {error ? <p className="text-meta font-medium text-negative">{error}</p> : null}
      {tiers.length < 3 && goal > 2 ? (
        <Button variant="secondary" size="md" className="self-start" iconStart={Plus} disabled={disabled} onClick={() => onChange([...tiers, { pointsCost: nextFree(), name: "" }])}>
          Add a reward on the way
        </Button>
      ) : null}
    </div>
  );
}

const MONEY_FIELDS = new Set(["Minimum purchase", "What a reward costs you"]);

function show(field: string, v: unknown): string {
  if (v === null || v === undefined) return field === "Most stamps per day" ? "No limit" : field === "Expiry (months)" ? "Never" : "None";
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (Array.isArray(v)) return v.length ? `${v.length} selected` : "None";
  if (typeof v === "number" && MONEY_FIELDS.has(field)) return formatMoney(v);
  if (field === "What one stamp is worth") return v === "pickup" ? "One pickup" : v === "purchase" ? "One purchase" : "One visit";
  if (field === "What earns") return v === "selected" ? "Only some" : "Everything";
  if (field === "How customers earn") return v === "per_dollar" ? "Points per dollar" : v === "stamps" ? "Stamp card" : "Points per visit";
  return String(v);
}

const ACTION: Record<string, string> = {
  "program.updated": "Changed the rules",
  "reward.created": "Added a reward",
  "reward.updated": "Changed a reward",
  "reward.deleted": "Removed a reward",
  "reward.archived": "Removed a reward",
};

export function ChangeHistory({ items, loading }: { items: merchantApi.ProgramChange[] | null; loading?: boolean }) {
  const [all, setAll] = useState(false);
  if (loading && !items) return <p className="text-sm text-fg-muted">Loading changes…</p>;
  if (!items?.length) return <p className="text-sm text-fg-muted">No changes yet. Every change to your rules and rewards shows here, with who made it.</p>;
  const shown = all ? items : items.slice(0, 5);
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col">
        {shown.map((c) => (
          <li key={c.id} className="flex gap-3 border-t border-line py-3 first:border-t-0">
            <History aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">
                {ACTION[c.action] ?? c.action} <span className="font-normal text-fg-muted">· {c.actor.name ?? "Someone on your team"} · {new Date(c.at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</span>
              </p>
              {c.changes.length ? (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {c.changes.map((x) => (
                    <li key={x.field} className="text-meta text-fg-muted">
                      {x.field}: <s>{show(x.field, x.before)}</s> → <span className="text-fg">{show(x.field, x.after)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {c.note ? <p className="mt-1 text-meta text-fg">{c.note}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      {items.length > 5 ? (
        <Button variant="secondary" size="md" className="self-start" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      ) : null}
    </div>
  );
}
