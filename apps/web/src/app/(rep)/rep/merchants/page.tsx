"use client";
import { EmptyState, PageHeader, StatusDot } from "@/components/dashboard/kit";
import { Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { repApi } from "@ll/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

function bonus(m: repApi.RepMerchant): { label: string; tone: "success" | "info" | "neutral" } {
  if (m.activatedAt) return new Date(m.activatedAt).getTime() - new Date(m.createdAt).getTime() <= 30 * 86_400_000 ? { label: "Earned", tone: "success" } : { label: "Missed", tone: "neutral" };
  return m.daysSinceSignup <= 30 ? { label: "Pending", tone: "info" } : { label: "Missed", tone: "neutral" };
}

export default function RepMerchantsPage() {
  const router = useRouter();
  const list = useApi(() => browserApi.rep.merchants(), []);
  const [filter, setFilter] = useState<"all" | "activating" | "activated" | "due">("all");
  const rows = (list.data?.items ?? []).filter((m) => filter === "all" || (filter === "activated" ? !!m.activatedAt : filter === "activating" ? !m.activatedAt : m.checkIns.some((c) => c.due)));
  const cols: Column<repApi.RepMerchant>[] = [
    { key: "name", header: "Shop", mobile: "title", sortValue: (m) => m.name, cell: (m) => <span className="font-medium">{m.name}</span> },
    { key: "vertical", header: "Type", mobile: "hidden", cell: (m) => verticalLabel(m.vertical) },
    { key: "status", header: "Status", mobile: "trailing", cell: (m) => <StatusDot domain="merchant" status={m.status} /> },
    { key: "signed", header: "Signed", mobile: "hidden", sortValue: (m) => m.createdAt, cell: (m) => formatDate(m.createdAt) },
    { key: "active", header: "Active members", mobile: "subtitle", sortValue: (m) => m.activeMembers, cell: (m) => <ProgressBar className="min-w-32" value={m.activeMembers} max={m.target} valueText={`${m.activeMembers} / ${m.target}`} /> },
    { key: "days", header: "Days", align: "end", mobile: "hidden", sortValue: (m) => m.daysSinceSignup, cell: (m) => m.daysSinceSignup },
    { key: "next", header: "Next check-in", mobile: "subtitle", cell: (m) => { const c = m.checkIns.find((x) => !x.doneAt); return c ? `${c.due ? "Due: " : ""}day ${c.day} · ${formatDate(c.dueAt)}` : "Done"; } },
    { key: "bonus", header: "Activation bonus", mobile: "hidden", cell: (m) => { const b = bonus(m); return <Badge tone={b.tone}>{b.label}</Badge>; } },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="My merchants" description="Goal: 25 active members within 30 days of signing." actions={<Button size="sm" href="/rep/new">Set up a merchant</Button>} />
      <DataTable caption="My merchants" columns={cols} rows={rows} rowKey={(m) => m.merchantId} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(m) => router.push(`/rep/merchants/${m.merchantId}`)}
        toolbar={<ChipGroup label="Filter">{([["all", "All"], ["activating", "Activating"], ["activated", "Activated"], ["due", "Check-in due"]] as const).map(([k, l]) => <Chip key={k} selected={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}</ChipGroup>}
        empty={<EmptyState icon={Store} title="No merchants yet" description="Your first setup takes about 20 minutes." action={<Button variant="secondary" size="sm" href="/rep/new">Set up a merchant</Button>} />} />
    </div>
  );
}
