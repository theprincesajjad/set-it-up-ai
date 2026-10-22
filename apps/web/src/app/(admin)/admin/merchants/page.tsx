"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { adminApi } from "@ll/shared";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/Layout";
import { TextField } from "@/components/ui/TextField";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatNumber } from "@/lib/format";

type St = "" | adminApi.AdminMerchant["status"];

export default function AdminMerchantsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<St>("");
  const [rows, setRows] = useState<adminApi.AdminMerchant[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      browserApi.admin.merchants({ q: q.trim() || undefined, status: status || undefined, limit: 50 }).then((r) => {
        if (!live) return;
        setRows(r.items);
        setCursor(r.nextCursor);
        setError(null);
      }).catch((e) => live && setError(errorMessage(e))).finally(() => live && setLoading(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, status]);
  const cols: Column<adminApi.AdminMerchant>[] = [
    { key: "name", header: "Merchant", mobile: "title", sortValue: (m) => m.name, cell: (m) => <span className="font-medium">{m.name}</span> },
    { key: "vertical", header: "Type", mobile: "hidden", cell: (m) => verticalLabel(m.vertical) },
    { key: "status", header: "Status", mobile: "trailing", cell: (m) => <StatusBadge domain="merchant" status={m.status} /> },
    { key: "plan", header: "Plan", mobile: "hidden", cell: (m) => <Badge tone={m.plan === "free" ? "neutral" : "brand"}>{m.plan}</Badge> },
    { key: "members", header: "Members", align: "end", mobile: "subtitle", sortValue: (m) => m.members, cell: (m) => `${formatNumber(m.members)} (${formatNumber(m.activeMembers)} active)` },
    { key: "act", header: "Activated", mobile: "hidden", cell: (m) => (m.activatedAt ? formatDate(m.activatedAt) : "–") },
    { key: "created", header: "Joined", mobile: "subtitle", sortValue: (m) => m.createdAt, cell: (m) => formatDate(m.createdAt) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Merchants" />
      <DataTable caption="Merchants" columns={cols} rows={rows} rowKey={(m) => m.id} loading={loading} error={error} onRowClick={(m) => router.push(`/admin/merchants/${m.id}`)} hasMore={!!cursor} onLoadMore={async () => {
        const r = await browserApi.admin.merchants({ q: q.trim() || undefined, status: status || undefined, limit: 50, cursor: cursor! });
        setRows((x) => [...x, ...r.items]);
        setCursor(r.nextCursor);
      }} toolbar={
        <div className="flex flex-col gap-3">
          <TextField type="search" label="Search merchants" hideLabel placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
          <ChipGroup label="Status">{(["", "onboarding", "active", "paused", "closed"] as St[]).map((s) => <Chip key={s || "all"} selected={status === s} onClick={() => setStatus(s)}>{s ? s[0]!.toUpperCase() + s.slice(1) : "All"}</Chip>)}</ChipGroup>
        </div>
      } />
    </div>
  );
}
