"use client";
import { Segmented } from "@/components/dashboard/kit";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { adminApi } from "@ll/shared";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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
    <Modal open onClose={onClose} variant="sheet" size="md" title={`Shop exceptions: ${feature.name}`} description="Turn this feature on (or off) for specific shops, whatever the feature's stage or their plan.">
      <div className="flex flex-col gap-4">
        {items.length ? (
          <ul className="divide-y divide-line rounded-input border border-line">
            {items.map((o) => (
              <li key={o.merchantId} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong text-fg">{o.merchantName}</p>
                  <p className="text-caption text-fg-muted">{o.reason ?? "No reason given"} · {formatDate(o.createdAt)}</p>
                </div>
                <Badge tone={o.enabled ? "success" : "neutral"}>{o.enabled ? "On for this shop" : "Off for this shop"}</Badge>
                <IconButton icon={Trash2} label={`Remove exception for ${o.merchantName}`} size={40} onClick={async () => {
                  await browserApi.admin.removeOverride(feature.key, o.merchantId);
                  setItems(items.filter((x) => x.merchantId !== o.merchantId));
                  onChanged();
                }} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-meta text-fg-muted">No shops added yet.</p>
        )}
        <div className="flex flex-col gap-3 rounded-input bg-bg-subtle p-3">
          <TextField type="search" label="Find a shop" value={q} onChange={(e) => { setQ(e.target.value); setPick(null); }} placeholder="Shop name" />
          {!pick && results.length && q.trim().length >= 2 ? (
            <ul className="flex flex-col gap-1" aria-label="Shop results">
              {results.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => { setPick(m); setQ(m.name); }} className={cn("flex min-h-11 w-full items-center justify-between rounded-sm px-2 text-start text-body hover:bg-bg")}>
                    {m.name} <span className="text-caption text-fg-muted">{m.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Segmented label="Access" value={enabled} onChange={setEnabled} options={[{ value: "on", label: "Turn on" }, ...(canForceOff(feature) ? [{ value: "off" as const, label: "Turn off" }] : [])]} />
          <TextField label="Reason" optionalLabel value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Early access for the Roncesvalles shops" />
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
            Save exception
          </Button>
        </div>
      </div>
    </Modal>
  );
}
