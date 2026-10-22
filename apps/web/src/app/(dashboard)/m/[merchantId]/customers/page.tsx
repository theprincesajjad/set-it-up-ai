"use client";
import { Download, Eye, Upload, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { merchantApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/Layout";
import { TextField } from "@/components/ui/TextField";
import { BFF_BASE } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatNumber, formatPoints } from "@/lib/format";
import { formatE164 } from "@/lib/phone";
import { CONSENT_LABEL, consentState, filterQuery, maskPhone, type CustomerFilter } from "@/lib/dashboard/customers";
import { relativeTime } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";

const FILTERS: { id: CustomerFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "reward", label: "Reward ready" },
  { id: "vip", label: "VIP" },
  { id: "new", label: "New (30 days)" },
  { id: "at_risk", label: "At risk" },
  { id: "opted_in", label: "Opted in to messages" },
  { id: "muted", label: "Muted" },
];

export default function CustomersPage() {
  const { api, base, detail, role } = useMerchant();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [rows, setRows] = useState<merchantApi.CustomerSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const total = useApi(role !== "staff" ? () => api.reports.overview() : null, [api]);
  const term = detail.program?.terminology ?? "points";

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const fq = useMemo(() => filterQuery(filter), [filter]);
  const query = useMemo(() => ({ ...fq.query, q: debounced || undefined, limit: 50 }), [fq, debounced]);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    api
      .customers(query)
      .then((r) => {
        if (!live) return;
        setRows(r.items);
        setCursor(r.nextCursor);
        setError(null);
      })
      .catch((e) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api, query]);

  const shown = fq.client ? rows.filter(fq.client) : rows;
  const exportHref = `${BFF_BASE}${api.base}/customers/export.csv?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]) as [string, string][]).toString()}`;

  const columns: Column<merchantApi.CustomerSummary>[] = [
    {
      key: "name",
      header: "Name",
      mobile: "title",
      sortValue: (c) => (c.name ?? "").toLowerCase(),
      cell: (c) => (
        <span className="flex items-center gap-3">
          <Avatar name={c.name} id={c.memberId} size={32} />
          <span className="truncate font-medium">{c.name ?? "No name"}</span>
          {c.rewardAvailable ? <Badge tone="accent">Reward ready</Badge> : null}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      mobile: "hidden",
      cell: (c) =>
        revealed.has(c.memberId) ? (
          <span className="tabular-nums">{formatE164(c.phone)}</span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed((s) => new Set(s).add(c.memberId));
            }}
            className="inline-flex min-h-11 items-center gap-1 tabular-nums text-fg hover:text-fg-link"
            aria-label={`Show phone for ${c.name ?? "member"}`}
          >
            {maskPhone(c.phone)} <Eye aria-hidden className="size-4 text-fg-muted" />
          </button>
        ),
    },
    { key: "balance", header: "Balance", align: "end", mobile: "trailing", sortValue: (c) => c.balance, cell: (c) => formatPoints(c.balance, term) },
    { key: "visits", header: "Visits", align: "end", sortValue: (c) => c.visitCount, cell: (c) => formatNumber(c.visitCount), mobile: "hidden" },
    { key: "last", header: "Last visit", mobile: "subtitle", sortValue: (c) => c.lastVisitAt ?? "", cell: (c) => (c.lastVisitAt ? `Last visit ${relativeTime(c.lastVisitAt)}` : "No visits yet") },
    { key: "joined", header: "Joined", mobile: "hidden", sortValue: (c) => c.joinedAt, cell: (c) => formatDate(c.joinedAt) },
    {
      key: "consent",
      header: "Messages",
      mobile: "subtitle",
      cell: (c) => {
        const s = consentState(c);
        return <Badge tone={s === "opted_in" ? "success" : "neutral"}>{CONSENT_LABEL[s]}</Badge>;
      },
    },
    { key: "vip", header: "VIP", mobile: "hidden", cell: (c) => (c.vipLevel ? <Badge tone="brand">{c.vipLevel.name}</Badge> : <span className="text-fg-muted">–</span>) },
  ];

  const count = total.data?.current.totalMembers;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Customers"
        description={count != null ? `${formatNumber(count)} members` : "Everyone in your program"}
        actions={
          role !== "staff" ? (
            <>
              <Button variant="secondary" iconStart={Upload} href={`${base}/customers/import`}>
                Import
              </Button>
              <Button variant="secondary" iconStart={Download} href={exportHref}>
                Export CSV
              </Button>
            </>
          ) : undefined
        }
      />
      <DataTable
        caption="Customers"
        columns={columns}
        rows={shown}
        rowKey={(c) => c.memberId}
        loading={loading}
        error={error}
        onRowClick={(c) => router.push(`${base}/customers/${c.memberId}`)}
        hasMore={!!cursor}
        loadingMore={loadingMore}
        onLoadMore={async () => {
          if (!cursor) return;
          setLoadingMore(true);
          try {
            const r = await api.customers({ ...query, cursor });
            setRows((x) => [...x, ...r.items]);
            setCursor(r.nextCursor);
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setLoadingMore(false);
          }
        }}
        summary={shown.length ? `Showing ${formatNumber(shown.length)}${count != null && filter === "all" && !debounced ? ` of ${formatNumber(count)}` : ""}` : undefined}
        toolbar={
          <div className="flex flex-col gap-3">
            <TextField type="search" label="Search customers" hideLabel placeholder="Search name, last 4 of phone, email or member code" value={q} onChange={(e) => setQ(e.target.value)} />
            <ChipGroup label="Filters">
              {FILTERS.map((f) => (
                <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </Chip>
              ))}
            </ChipGroup>
            <p className="text-caption text-fg-muted">
              <strong className="font-semibold">Messages:</strong> &quot;Opted in&quot; customers said yes to offers and haven&apos;t muted you. They&apos;re the only ones who get promotional email or texts (CASL). &quot;Muted&quot; customers silenced your shop in the app; their points still work.
            </p>
          </div>
        }
        empty={
          debounced || filter !== "all" ? (
            <EmptyState icon={Users} title="No customers match" description="Try another search or filter." action={<Button variant="tonal" onClick={() => { setQ(""); setFilter("all"); }}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={Users} title="No customers yet" description="Customers join when they scan your QR stand or give their number at the counter." action={<Button href={`${base}/locations`}>Print your QR stand</Button>} secondaryAction={<Button variant="ghost" href={`${base}/customers/import`}>Import from another app</Button>} />
          )
        }
      />
    </div>
  );
}
