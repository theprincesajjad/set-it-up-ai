"use client";
import { PageHeader, Panel } from "@/components/dashboard/kit";
import { Download } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import type { adminApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { downloadCsv } from "@/lib/dashboard/download";

const PREFIXES = ["", "feature.", "merchant.", "billing.", "support.", "user.", "lead.", "rep.", "neighbourhood.", "perk.", "campaign.", "ad.", "member.", "consent."];

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [custom, setCustom] = useState("");
  const [rows, setRows] = useState<adminApi.AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const a = custom.trim() || action;
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      browserApi.admin.audit({ action: a || undefined, limit: 50 }).then((r) => { if (live) { setRows(r.items); setCursor(r.nextCursor); setError(null); } }).catch((e) => live && setError(errorMessage(e))).finally(() => live && setLoading(false));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [a]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Audit log" description="Every admin, rep, rollout, consent and money action." actions={<Button size="sm" variant="secondary" iconStart={Download} onClick={() => downloadCsv("audit.csv", [["time", "actor", "action", "entity", "entity_id", "merchant_id", "ip", "data"], ...rows.map((r) => [r.createdAt, r.actorName ?? "", r.action, r.entity ?? "", r.entityId ?? "", r.merchantId ?? "", r.ip ?? "", JSON.stringify(r.data)])])}>Export CSV</Button>} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Area" value={action} onChange={(e) => setAction(e.target.value)} options={PREFIXES.map((p) => ({ value: p, label: p ? p.slice(0, -1) : "Everything" }))} />
        <TextField label="Exact action" optionalLabel placeholder="feature.stage_changed" value={custom} onChange={(e) => setCustom(e.target.value)} />
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Panel padded={false}>
        <div className="relative overflow-x-auto">
        {loading && !rows.length ? <Skeleton className="m-4 h-40" /> : (
          <table className="w-full min-w-[720px] text-meta">
            <caption className="sr-only">Audit entries</caption>
            <thead className="bg-bg-subtle text-label text-fg-muted">
              <tr><th scope="col" className="px-4 py-3 text-start">When</th><th scope="col" className="px-4 py-3 text-start">Who</th><th scope="col" className="px-4 py-3 text-start">Action</th><th scope="col" className="px-4 py-3 text-start">Target</th><th scope="col" className="px-4 py-3"><span className="sr-only">Details</span></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-t border-line">
                    <td className="whitespace-nowrap px-4 py-2">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-2">{r.actorName ?? "System"}</td>
                    <td className="px-4 py-2 font-mono">{r.action}</td>
                    <td className="px-4 py-2 text-fg-muted">{[r.entity, r.entityId?.slice(0, 8)].filter(Boolean).join(" ")}</td>
                    <td className="px-4 py-2 text-end"><button type="button" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)} className="min-h-11 text-label text-fg">{open === r.id ? "Hide" : "Details"}</button></td>
                  </tr>
                  {open === r.id ? (
                    <tr className="bg-bg-subtle"><td colSpan={5} className="px-4 py-3"><pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-caption text-fg">{JSON.stringify(r.data, null, 2)}</pre>{r.ip ? <p className="mt-1 text-caption text-fg-muted">IP {r.ip}</p> : null}</td></tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </Panel>
      {cursor ? <Button variant="secondary" className="self-start" onClick={async () => { const r = await browserApi.admin.audit({ action: a || undefined, limit: 50, cursor }); setRows((x) => [...x, ...r.items]); setCursor(r.nextCursor); }}>Load more</Button> : null}
    </div>
  );
}
