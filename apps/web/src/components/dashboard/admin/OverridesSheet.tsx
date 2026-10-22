"use client";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { adminApi } from "@ll/shared";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { canForceOff } from "@/lib/dashboard/rollout";

/** Per-merchant grant/deny for one feature (pilot shops). Overrides win over stage and plan. */
export function OverridesSheet({ feature, onClose, onChanged }: { feature: adminApi.AdminFeature | null; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<adminApi.FeatureOverride[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<adminApi.AdminMerchant[]>([]);
  const [pick, setPick] = useState<adminApi.AdminMerchant | null>(null);
  const [enabled, setEnabled] = useState<"on" | "off">("on");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = feature?.key;

  useEffect(() => {
    if (!key) return;
    browserApi.admin.overrides(key).then((r) => setItems(r.items)).catch((e) => setError(errorMessage(e)));
  }, [key]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => browserApi.admin.merchants({ q: q.trim(), limit: 8 }).then((r) => setResults(r.items)).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  if (!feature) return null;
  return (
    <Modal open onClose={onClose} variant="sheet" size="md" title={`Overrides: ${feature.name}`} description="Force this feature on for pilot shops (or off), whatever the stage or plan.">
      <div className="flex flex-col gap-4">
        {items.length ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {items.map((o) => (
              <li key={o.merchantId} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong text-fg">{o.merchantName}</p>
                  <p className="text-caption text-fg-muted">{o.reason ?? "No reason"} · {formatDate(o.createdAt)}</p>
                </div>
                <Badge tone={o.enabled ? "success" : "neutral"}>{o.enabled ? "Forced on" : "Forced off"}</Badge>
                <IconButton icon={Trash2} label={`Remove override for ${o.merchantName}`} size={40} onClick={async () => {
                  await browserApi.admin.removeOverride(feature.key, o.merchantId);
                  setItems(items.filter((x) => x.merchantId !== o.merchantId));
                  onChanged();
                }} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-fg-muted">No overrides yet.</p>
        )}
        <div className="flex flex-col gap-3 rounded-md bg-surface-sunken p-3">
          <TextField type="search" label="Find a merchant" value={q} onChange={(e) => { setQ(e.target.value); setPick(null); }} placeholder="Shop name" />
          {!pick && results.length && q.trim().length >= 2 ? (
            <ul className="flex flex-col gap-1" aria-label="Merchant results">
              {results.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => { setPick(m); setQ(m.name); }} className={cn("flex min-h-11 w-full items-center justify-between rounded-sm px-2 text-start text-body hover:bg-surface")}>
                    {m.name} <span className="text-caption text-fg-muted">{m.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <SegmentedControl label="Override" value={enabled} onChange={setEnabled} options={[{ value: "on", label: "Force on" }, ...(canForceOff(feature) ? [{ value: "off" as const, label: "Force off" }] : [])]} />
          <TextField label="Reason" optionalLabel value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pilot shop, Roncesvalles" />
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <Button disabled={!pick} loading={busy} className="self-start" onClick={async () => {
            if (!pick) return;
            setBusy(true);
            setError(null);
            try {
              const r = await browserApi.admin.setOverride(feature.key, { merchantId: pick.id, enabled: enabled === "on", reason: reason.trim() || undefined });
              setItems(r.items);
              setPick(null);
              setQ("");
              setReason("");
              onChanged();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}>
            Save override
          </Button>
        </div>
      </div>
    </Modal>
  );
}
