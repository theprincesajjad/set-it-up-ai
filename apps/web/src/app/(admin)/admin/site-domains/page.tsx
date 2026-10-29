"use client";
/**
 * Website domains (workstream G): the manual task list. With SITE_DOMAINS_ENABLED off, every .ca request lands here: buy it
 * through our registrar account (or check the owner's DNS for a name they own), point it at the sites target, then mark it live.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { siteApi } from "@ll/shared";
import { PageHeader, Panel } from "@/components/dashboard/kit";
import { ListAsync } from "@/components/dashboard/ListStates";
import { adminSiteEndpoints } from "@/components/site-builder/siteApi";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { browserClient } from "@/lib/api/browser";
import { formatDateYear } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const TONE = { requested: "info", pending: "warning", live: "success", failed: "danger", none: "neutral" } as const;

export default function SiteDomainsPage() {
  const api = useMemo(() => adminSiteEndpoints(browserClient), []);
  const list = useApi(() => api.list(), [api]);
  const act = useAction();
  const [refs, setRefs] = useState<Record<string, string>>({});
  const set = async (r: siteApi.AdminSiteDomainDto, status: "pending" | "live" | "failed") => {
    const done = await act.run(() => api.update(r.id, { status, ...(refs[r.id] ? { registrarRef: refs[r.id] } : {}) }));
    if (done) await list.reload();
  };
  const cols: Column<siteApi.AdminSiteDomainDto>[] = [
    { key: "host", header: "Domain", mobile: "title", cell: (r) => <span className="font-medium">{r.hostname}</span> },
    { key: "shop", header: "Shop", mobile: "subtitle", cell: (r) => <Link href={`/s/${r.merchantSlug}`} className="hover:underline">{r.merchantName}</Link> },
    { key: "mode", header: "Ask", mobile: "hidden", cell: (r) => (r.mode === "register" ? "Register a .ca" : "Connect their own") },
    { key: "status", header: "Status", mobile: "trailing", cell: (r) => <Badge tone={TONE[r.status]}>{r.status}</Badge> },
    { key: "when", header: "Asked", mobile: "hidden", cell: (r) => formatDateYear(r.requestedAt) },
    {
      key: "ref",
      header: "Registrar ref",
      mobile: "hidden",
      cell: (r) => (
        <input
          aria-label={`Registrar reference for ${r.hostname}`}
          className="h-8 w-40 rounded-r2 bg-card px-2 text-body hairline-inset"
          defaultValue={r.registrarRef ?? ""}
          onChange={(e) => setRefs((x) => ({ ...x, [r.id]: e.target.value }))}
        />
      ),
    },
    {
      key: "act",
      header: "Actions",
      mobile: "hidden",
      cell: (r) => (
        <div className="flex gap-2">
          {r.status !== "pending" && r.status !== "live" ? <Button size="sm" variant="secondary" onClick={() => void set(r, "pending")}>Bought</Button> : null}
          {r.status !== "live" ? <Button size="sm" onClick={() => void set(r, "live")}>Mark live</Button> : null}
          {r.status !== "failed" ? <Button size="sm" variant="ghost" onClick={() => void set(r, "failed")}>Failed</Button> : null}
        </div>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Website domains" description="Requests from the website builder. Buy or check the name, point it at the sites target, then mark it live." />
      {act.error ? <p role="alert" className="text-body text-destructive-text">{act.error}</p> : null}
      <ListAsync state={list} errorTitle="We could not load the domains.">
        {(d) => (
          <Panel padded={false} title="Requests" description="Newest requests first; live domains at the end.">
            <DataTable caption="Website domain requests" columns={cols} rows={d.items} rowKey={(r) => r.id} empty="No domain requests." />
          </Panel>
        )}
      </ListAsync>
    </div>
  );
}
