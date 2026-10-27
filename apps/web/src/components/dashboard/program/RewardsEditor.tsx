"use client";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Panel } from "@/components/dashboard/kit";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatMoney, formatPoints } from "@/lib/format";
import { useAction } from "@/lib/dashboard/useApi";

const TYPE_LABEL: Record<merchantApi.Reward["rewardType"], string> = { free_item: "Free item", amount_off: "$ off", percent_off: "% off", custom: "Custom" };

const HINTS: Record<string, string> = {
  cafe: "Most cafés set a free drink at 8-10 stamps.",
  bakery: "Most bakeries set a free treat at 8-10 stamps.",
  pharmacy: "Front-store rewards only. $5 off at 500 points is common.",
};

type Draft = { id?: string; name: string; rewardType: merchantApi.Reward["rewardType"]; value: string; pointsCost: string; description: string };

export function RewardsEditor({ rewards, onChange }: { rewards: merchantApi.Reward[]; onChange: (r: merchantApi.Reward[]) => void }) {
  const { api, detail } = useMerchant();
  const toast = useToast();
  const term = detail.program?.terminology ?? "points";
  const [edit, setEdit] = useState<Draft | null>(null);
  const [del, setDel] = useState<merchantApi.Reward | null>(null);
  const act = useAction();
  const sorted = [...rewards].sort((a, b) => a.sortOrder - b.sortOrder || a.pointsCost - b.pointsCost);

  const replace = (r: merchantApi.Reward) => onChange(rewards.some((x) => x.id === r.id) ? rewards.map((x) => (x.id === r.id ? r : x)) : [...rewards, r]);

  async function move(i: number, dir: -1 | 1) {
    const a = sorted[i]!;
    const b = sorted[i + dir]!;
    const [ra, rb] = await Promise.all([api.updateReward(a.id, { sortOrder: i + dir }), api.updateReward(b.id, { sortOrder: i })]);
    onChange(rewards.map((x) => (x.id === ra.id ? ra : x.id === rb.id ? rb : x)));
  }

  return (
    <Panel
      title="Rewards"
      description={HINTS[detail.merchant.vertical] ?? "Start with one easy reward customers can reach in a month."}
      action={
        <Button variant="secondary" size="sm" iconStart={Plus} onClick={() => setEdit({ name: "", rewardType: "free_item", value: "", pointsCost: "", description: "" })}>
          Add reward
        </Button>
      }
    >
      {sorted.length ? (
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {sorted.map((r, i) => (
            <li key={r.id} className="flex min-h-14 flex-wrap items-center gap-1 py-1.5">
              <div className="flex flex-col">
                <button type="button" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="inline-flex h-5 w-7 items-center justify-center rounded-sm text-fg-muted hover:bg-bg-subtle hover:text-fg disabled:opacity-30">
                  <ArrowUp aria-hidden className="size-3.5" />
                </button>
                <button type="button" aria-label={`Move ${r.name} down`} disabled={i === sorted.length - 1} onClick={() => move(i, 1)} className="inline-flex h-5 w-7 items-center justify-center rounded-sm text-fg-muted hover:bg-bg-subtle hover:text-fg disabled:opacity-30">
                  <ArrowDown aria-hidden className="size-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-meta-strong text-fg">{r.name}</p>
                <p className="text-meta text-fg-muted">
                  {formatPoints(r.pointsCost, term)} · {r.rewardType === "amount_off" ? `${formatMoney(r.value)} off` : r.rewardType === "percent_off" ? `${r.value}% off` : TYPE_LABEL[r.rewardType]}
                </p>
              </div>
              <div className="w-28">
                <Switch label="Active" checked={r.active} onChange={async (v) => replace(await api.updateReward(r.id, { active: v }))} />
              </div>
              <IconButton icon={Pencil} size={40} label={`Edit ${r.name}`} onClick={() => setEdit({ id: r.id, name: r.name, rewardType: r.rewardType, value: r.rewardType === "amount_off" ? String(r.value / 100) : String(r.value || ""), pointsCost: String(r.pointsCost), description: r.description ?? "" })} />
              <IconButton icon={Trash2} size={40} label={`Delete ${r.name}`} onClick={() => setDel(r)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-meta text-fg-muted">No rewards yet. Customers need something to earn toward.</p>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Edit reward" : "Add reward"}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              loading={act.busy}
              onClick={async () => {
                if (!edit) return;
                const cost = Number.parseInt(edit.pointsCost, 10);
                if (!edit.name.trim() || !(cost > 0)) return act.setError("Give it a name and a cost of at least 1.");
                const value = edit.rewardType === "amount_off" ? Math.round(Number.parseFloat(edit.value || "0") * 100) : edit.rewardType === "percent_off" ? Number.parseInt(edit.value || "0", 10) : 0;
                if (edit.rewardType === "percent_off" && !(value >= 1 && value <= 100)) return act.setError("Percent off must be 1 to 100.");
                const body = { name: edit.name.trim(), rewardType: edit.rewardType, value, pointsCost: cost, description: edit.description.trim() || null };
                const prev = edit.id ? rewards.find((x) => x.id === edit.id) : null;
                const r = await act.run(() => (edit.id ? api.updateReward(edit.id, body) : api.createReward({ ...body, sortOrder: rewards.length })));
                if (r) {
                  replace(r);
                  setEdit(null);
                  toast({ message: prev && prev.pointsCost < r.pointsCost ? "Saved. Customers close to this reward will need more." : "Saved", tone: "success" });
                }
              }}
            >
              Save reward
            </Button>
          </>
        }
      >
        {edit ? (
          <div className="flex flex-col gap-4">
            <TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Free drink" maxLength={120} />
            <Select label="Type" value={edit.rewardType} onChange={(e) => setEdit({ ...edit, rewardType: e.target.value as Draft["rewardType"] })} options={(Object.keys(TYPE_LABEL) as Draft["rewardType"][]).map((k) => ({ value: k, label: TYPE_LABEL[k] }))} />
            {edit.rewardType === "amount_off" || edit.rewardType === "percent_off" ? (
              <TextField label={edit.rewardType === "amount_off" ? "Amount off" : "Percent off"} inputMode="decimal" prefix={edit.rewardType === "amount_off" ? "$" : undefined} suffix={edit.rewardType === "percent_off" ? "%" : undefined} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
            ) : null}
            <TextField label="Cost" inputMode="numeric" suffix={term === "points" ? "pts" : term} value={edit.pointsCost} onChange={(e) => setEdit({ ...edit, pointsCost: e.target.value.replace(/\D/g, "") })} />
            <TextField type="textarea" label="Terms" optionalLabel value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Any size. Not valid with other offers." />
            {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title={`Delete ${del?.name ?? "reward"}?`}
        body="If customers already redeemed it, it's turned off instead so their history stays."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          const r = await api.deleteReward(del!.id);
          onChange(r.archived ? rewards.map((x) => (x.id === del!.id ? { ...x, active: false } : x)) : rewards.filter((x) => x.id !== del!.id));
          toast(r.archived ? "Turned off (it has redemptions)" : "Deleted");
        }}
      />
    </Panel>
  );
}
