"use client";
/**
 * Every business that signed up (wave N): search, filter by trade, plan, city, status (trial, paying, churned, at risk), signup date
 * and last active, sort on the server, and export the filtered list as CSV. A row opens the business's detail page.
 * Wave Q (kit): the table is the ReUI Data Grid (TanStack) with server sorting from the column headers and page numbers; signup dates are
 * the kit DatePicker (loaded when the date filters open); the status capsules carry their counts; skeleton rows and a real empty state.
 */
import { Download, SearchX } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { adminCockpitApi } from "@ll/shared";
import { PageHeader, QuietButton } from "@/components/dashboard/kit";
import { BusinessStatus, FlagPills, planLabel } from "@/components/dashboard/admin/cockpit";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { AdminGrid, type AdminColumn } from "@/components/dashboard/admin/AdminGrid";
import { Banner } from "@/components/ui/Banner";
import { ErrorPanel } from "@/components/errors";
import { PanelEmpty } from "@/components/dashboard/admin/AdminKit";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { relativeTime } from "@/lib/dashboard/time";

const DatePicker = dynamic(() => import("@/components/ui/DatePicker").then((m) => m.DatePicker), { ssr: false });
/** yyyy-mm-dd in local time (what the API filter takes) and back. */
const ymd = (d: Date | undefined) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
const fromYmd = (s: string) => (s ? new Date(`${s}T12:00:00`) : undefined);

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
  /** The list failed to load: the grid shows the failure (with Try again), never "No business matches". */
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState({ pageIndex: 0, pageSize: PAGE });
  const filtered = !!(q || status || trade || plan || city || from || to || active || dir !== "desc");

  const query = useMemo(
    () => ({ q: q.trim() || undefined, status: status || undefined, trade: trade || undefined, plan: plan || undefined, city: city || undefined, signedFrom: from || undefined, signedTo: to || undefined, activeWithin: active || undefined, sort, dir }),
    [q, status, trade, plan, city, from, to, active, sort, dir],
  );
  // A new filter or sort starts again on page 1.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setPage((p) => (p.pageIndex ? { ...p, pageIndex: 0 } : p)), [query]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      browserApi.admin.cockpit
        .businesses({ ...query, limit: page.pageSize, offset: page.pageIndex * page.pageSize })
        .then((r) => {
          if (!live) return;
          setData(r);
          setRows(r.items);
          setError(null);
          setLoadErr(null);
        })
        .catch((e) => {
          if (!live) return;
          // Rows from another filter or page would read as this one's result.
          setRows([]);
          setData(null);
          setLoadErr(e);
        })
        .finally(() => live && setLoading(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, page, tick]);
  const onSort = useCallback((x: { key: string; dir: "asc" | "desc" }) => {
    setSort(x.key as adminCockpitApi.BusinessSort);
    setDir(x.dir);
  }, []);

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

  const cols: AdminColumn<Row>[] = [
    {
      id: "name",
      header: "Business",
      sortKey: "name",
      size: 240,
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{r.name}</span>
          <span className="truncate text-caption text-fg-muted">{[verticalLabel(r.trade), r.city].filter(Boolean).join(" · ")}</span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status and plan",
      size: 160,
      cell: (r) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <BusinessStatus status={r.status} />
          {r.plan !== "free" ? <span className="text-fg-muted">{planLabel(r.plan)}</span> : null}
        </span>
      ),
    },
    { id: "mrr", header: "MRR", sortKey: "mrrCents", align: "end", size: 90, cell: (r) => <span className="tabular">{r.mrrCents ? formatMoney(r.mrrCents) : "–"}</span> },
    { id: "gmv", header: "Processed, 30 d", sortKey: "gmv30dCents", align: "end", size: 130, cell: (r) => <span className="tabular">{r.gmv30dCents ? formatMoney(r.gmv30dCents) : "–"}</span> },
    { id: "usage", header: "Stamps · bookings", sortKey: "stamps30d", align: "end", size: 130, cell: (r) => <span className="tabular">{`${formatNumber(r.stamps30d)} · ${formatNumber(r.bookings30d)}`}</span> },
    { id: "flags", header: "Health", size: 150, cell: (r) => <FlagPills flags={r.flags} /> },
    { id: "signed", header: "Signed up", sortKey: "signedUpAt", size: 100, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.signedUpAt)}</span> },
    { id: "active", header: "Last active", sortKey: "lastActiveAt", size: 110, cell: (r) => <span className="whitespace-nowrap">{r.lastActiveAt ? relativeTime(r.lastActiveAt) : "Never"}</span> },
  ];
  const clearAll = () => {
    setQ("");
    setStatus("");
    setTrade("");
    setPlan("");
    setCity("");
    setFrom("");
    setTo("");
    setActive("");
    setDir("desc");
  };
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
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <AdminGrid
        label="Businesses"
        columns={cols}
        rows={rows}
        total={data?.total ?? 0}
        rowKey={(r) => r.id}
        loading={loading}
        sort={{ key: sort, dir }}
        onSortChange={onSort}
        page={page}
        onPageChange={setPage}
        onRowClick={(r) => router.push(`/admin/businesses/${r.id}`)}
        mobile={(r) => ({ title: r.name, meta: [verticalLabel(r.trade), r.mrrCents ? `${formatMoney(r.mrrCents)}/mo` : null, r.lastActiveAt ? `active ${relativeTime(r.lastActiveAt)}` : "never active"].filter(Boolean).join(" · "), trailing: <BusinessStatus status={r.status} /> })}
        empty={
          loadErr ? (
            <ErrorPanel error={loadErr} what="the businesses" onRetry={() => setTick((n) => n + 1)} />
          ) : (
            <PanelEmpty icon={SearchX} title="No business matches these filters" description="Try another status or clear the filters." action={filtered ? <QuietButton onClick={clearAll}>Clear filters</QuietButton> : undefined} />
          )
        }
        toolbar={
          <div className="flex flex-col gap-3">
            <TextField type="search" label="Search businesses" hideLabel placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
            <ChipGroup label="Status">
              {chips.map((c) => (
                <Chip key={c.value || "all"} selected={status === c.value} onClick={() => setStatus(c.value)}>
                  {c.label}
                  {c.n !== undefined ? <span className={`ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption tabular ${status === c.value ? "bg-primary-foreground/20" : "bg-muted text-fg-muted"}`}>{c.n}</span> : null}
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
                <DatePicker label="Signed up from" value={fromYmd(from)} onChange={(d) => setFrom(ymd(d))} />
                <DatePicker label="Signed up to" value={fromYmd(to)} onChange={(d) => setTo(ymd(d))} />
                <Select label="Order" value={dir} onChange={(e) => setDir(e.target.value as "asc" | "desc")} options={[{ value: "desc", label: "High to low, newest first" }, { value: "asc", label: "Low to high, oldest first" }]} />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <QuietButton onClick={() => setMore((m) => !m)} aria-expanded={more}>
                {more ? "Fewer filters" : "Signup dates and order"}
              </QuietButton>
              {filtered ? (
                <QuietButton onClick={clearAll}>
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
