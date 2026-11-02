"use client";
/**
 * Every business that signed up (wave N): search, filter by trade, plan, city, status (trial, paying, churned, at risk), signup date
 * and last active, sort on the server, and export the filtered list as CSV. A row opens the business's detail page.
 */
import { Download } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { adminCockpitApi } from "@ll/shared";
import { PageHeader, QuietButton } from "@/components/dashboard/kit";
import { BusinessStatus, FlagPills, planLabel } from "@/components/dashboard/admin/cockpit";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { relativeTime } from "@/lib/dashboard/time";

type Row = adminCockpitApi.BusinessRow;
type StatusFilter = "" | adminCockpitApi.BusinessStatus | "at_risk";
const PAGE = 50;
const SORT_LABEL: Record<adminCockpitApi.BusinessSort, string> = {
  signedUpAt: "Signup date",
  lastActiveAt: "Last active",
  name: "Name",
  mrrCents: "MRR",
  gmv30dCents: "Processed, 30 days",
  stamps30d: "Stamps, 30 days",
  bookings30d: "Bookings, 30 days",
  activeCustomers30d: "Active customers, 30 days",
};
const ACTIVE_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "7", label: "Active in the last 7 days" },
  { value: "30", label: "Active in the last 30 days" },
  { value: "-14", label: "Inactive for 14+ days" },
  { value: "-30", label: "Inactive for 30+ days" },
];

export default function AdminBusinessesPage() {
  // useSearchParams needs a Suspense boundary (the overview links here with ?status= and ?sort=).
  return (
    <Suspense>
      <BusinessesList />
    </Suspense>
  );
}

function BusinessesList() {
  const router = useRouter();
  const params = useSearchParams();
  const initialSort = params.get("sort");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>((params.get("status") as StatusFilter) ?? "");
  const [trade, setTrade] = useState("");
  const [plan, setPlan] = useState("");
  const [city, setCity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [active, setActive] = useState("");
  const [sort, setSort] = useState<adminCockpitApi.BusinessSort>((adminCockpitApi.BUSINESS_SORTS as readonly string[]).includes(initialSort ?? "") ? (initialSort as adminCockpitApi.BusinessSort) : "signedUpAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [data, setData] = useState<adminCockpitApi.BusinessList | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [more, setMore] = useState(false);
  const filtered = !!(q || status || trade || plan || city || from || to || active || dir !== "desc");

  const query = useMemo(
    () => ({ q: q.trim() || undefined, status: status || undefined, trade: trade || undefined, plan: plan || undefined, city: city || undefined, signedFrom: from || undefined, signedTo: to || undefined, activeWithin: active || undefined, sort, dir }),
    [q, status, trade, plan, city, from, to, active, sort, dir],
  );
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      browserApi.admin.cockpit
        .businesses({ ...query, limit: PAGE, offset: 0 })
        .then((r) => {
          if (!live) return;
          setData(r);
          setRows(r.items);
          setError(null);
        })
        .catch((e) => live && setError(errorMessage(e)))
        .finally(() => live && setLoading(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await browserApi.admin.cockpit.businessesCsv(query);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `businesses-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const cols: Column<Row>[] = [
    {
      key: "name",
      header: "Business",
      mobile: "title",
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{r.name}</span>
          <span className="truncate text-caption text-fg-muted max-md:hidden">{[verticalLabel(r.trade), r.city].filter(Boolean).join(" · ")}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status and plan",
      mobile: "trailing",
      cell: (r) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <BusinessStatus status={r.status} />
          {r.plan !== "free" ? <span className="text-fg-muted max-md:hidden">{planLabel(r.plan)}</span> : null}
        </span>
      ),
    },
    { key: "mrr", header: "MRR", align: "end", mobile: "hidden", cell: (r) => (r.mrrCents ? formatMoney(r.mrrCents) : "–") },
    { key: "gmv", header: "Processed, 30 d", align: "end", mobile: "hidden", cell: (r) => (r.gmv30dCents ? formatMoney(r.gmv30dCents) : "–") },
    { key: "usage", header: "Stamps · bookings", align: "end", mobile: "subtitle", cell: (r) => `${formatNumber(r.stamps30d)} · ${formatNumber(r.bookings30d)}` },
    { key: "flags", header: "Health", mobile: "hidden", cell: (r) => <FlagPills flags={r.flags} /> },
    { key: "signed", header: "Signed up", mobile: "hidden", cell: (r) => <span className="whitespace-nowrap">{formatDate(r.signedUpAt)}</span> },
    { key: "active", header: "Last active", mobile: "hidden", cell: (r) => <span className="whitespace-nowrap">{r.lastActiveAt ? relativeTime(r.lastActiveAt) : "Never"}</span> },
  ];
  const counts = data?.counts;
  const chips: { value: StatusFilter; label: string; n?: number }[] = [
    { value: "", label: "All" },
    { value: "paying", label: "Paying", n: counts?.paying },
    { value: "trial", label: "Trial", n: counts?.trial },
    { value: "at_risk", label: "At risk", n: counts?.at_risk },
    { value: "free", label: "Free", n: counts?.free },
    { value: "churned", label: "Churned", n: counts?.churned },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Businesses"
        description={data ? `${formatNumber(data.total)} match these filters` : "Every shop that signed up"}
        actions={
          <Button size="sm" variant="secondary" iconStart={Download} onClick={exportCsv} disabled={exporting}>
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />
      <DataTable
        caption="Businesses"
        columns={cols}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRowClick={(r) => router.push(`/admin/businesses/${r.id}`)}
        hasMore={!!data && rows.length < data.total}
        onLoadMore={async () => {
          const r = await browserApi.admin.cockpit.businesses({ ...query, limit: PAGE, offset: rows.length });
          setRows((x) => [...x, ...r.items]);
        }}
        empty="No business matches these filters."
        toolbar={
          <div className="flex flex-col gap-3">
            <TextField type="search" label="Search businesses" hideLabel placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
            <ChipGroup label="Status">
              {chips.map((c) => (
                <Chip key={c.value || "all"} selected={status === c.value} onClick={() => setStatus(c.value)}>
                  {c.label}
                  {c.n !== undefined ? <span className="ms-1 tabular text-fg-muted">{c.n}</span> : null}
                </Chip>
              ))}
            </ChipGroup>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Select label="Trade" value={trade} onChange={(e) => setTrade(e.target.value)} options={[{ value: "", label: "All trades" }, ...(data?.facets.trades ?? []).map((t) => ({ value: t, label: verticalLabel(t) }))]} />
              <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)} options={[{ value: "", label: "All plans" }, ...["free", "plus", "studio", "pro", "restaurant"].map((p) => ({ value: p, label: planLabel(p) }))]} />
              <Select label="City" value={city} onChange={(e) => setCity(e.target.value)} options={[{ value: "", label: "All cities" }, ...(data?.facets.cities ?? []).map((c) => ({ value: c, label: c }))]} />
              <Select label="Last active" value={active} onChange={(e) => setActive(e.target.value)} options={ACTIVE_OPTIONS} />
              <Select label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as adminCockpitApi.BusinessSort)} options={adminCockpitApi.BUSINESS_SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))} />
            </div>
            {more ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <TextField type="date" label="Signed up from" value={from} onChange={(e) => setFrom(e.target.value)} />
                <TextField type="date" label="Signed up to" value={to} onChange={(e) => setTo(e.target.value)} />
                <Select label="Order" value={dir} onChange={(e) => setDir(e.target.value as "asc" | "desc")} options={[{ value: "desc", label: "High to low, newest first" }, { value: "asc", label: "Low to high, oldest first" }]} />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <QuietButton onClick={() => setMore((m) => !m)} aria-expanded={more}>
                {more ? "Fewer filters" : "Signup dates and order"}
              </QuietButton>
              {filtered ? (
                <QuietButton
                  onClick={() => {
                    setQ("");
                    setStatus("");
                    setTrade("");
                    setPlan("");
                    setCity("");
                    setFrom("");
                    setTo("");
                    setActive("");
                    setDir("desc");
                  }}
                >
                  Clear filters
                </QuietButton>
              ) : null}
            </div>
          </div>
        }
      />
    </div>
  );
}
