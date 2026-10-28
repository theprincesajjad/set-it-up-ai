"use client";
import { Download, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { merchantApi } from "@ll/shared";
import { CustomerView } from "@/components/dashboard/customers/CustomerView";
import { Capsules, EmptyState, PageHeader, SidePanel, SkeletonRows, ToolbarButton } from "@/components/dashboard/kit";
import { CustomersGrid } from "@/components/dashboard/customers/CustomersGrid";
import { ListError, ListLoading } from "@/components/dashboard/ListStates";
import { Button } from "@/components/ui/Button";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { BFF_BASE } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatNumber } from "@/lib/format";
import { filterFromSegment, filterQuery, type CustomerFilter } from "@/lib/dashboard/customers";
import { useApi } from "@/lib/dashboard/useApi";

export default function CustomersPage() {
  return (
    <Suspense>
      <Customers />
    </Suspense>
  );
}

function Customers() {
  const { api, base, detail, role, enabled, viewingAs } = useMerchant();
  // Done-for-you migration: reps and admins (viewing as the shop) can import on any plan.
  const canImport = enabled("customers.csv_import") || !!viewingAs;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = params.get("member");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>(() => filterFromSegment(params.get("segment")));
  const [rows, setRows] = useState<merchantApi.CustomerSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const term = detail.program?.terminology ?? "points";
  const goal = detail.program?.earnType === "stamps" ? detail.program.stampGoal : 0;
  const vip = enabled("loyalty.vip_levels");
  const counts = useApi(() => api.customerSegmentCounts(), [api, nonce]);

  // Regulars and slipping away come from each person's own rhythm; counts are exact and come from the server.
  const filters = useMemo(() => {
    const c = counts.data;
    const f: { value: CustomerFilter; label: string; count?: number | null }[] = [
      { value: "all", label: "All", count: c?.all },
      { value: "regulars", label: "Regulars", count: c?.regulars },
      { value: "slipping", label: "Slipping away", count: c?.slipping },
      { value: "reward", label: "Reward ready", count: c?.rewardReady },
      { value: "new", label: "New this month", count: c?.newThisMonth },
      { value: "birthday", label: "Birthday this month", count: c?.birthdayMonth },
      { value: "can_text", label: "Can text", count: c?.canText },
    ];
    if (vip) f.push({ value: "vip", label: "VIP" });
    return f;
  }, [vip, counts.data]);

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
        setTotal(r.total);
        setError(null);
      })
      .catch((e) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api, query, nonce]);

  const setOpen = useCallback(
    (id: string | null) => {
      const p = new URLSearchParams(params.toString());
      if (id) p.set("member", id);
      else p.delete("member");
      router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const exportHref = `${BFF_BASE}${api.base}/customers/export.csv?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]) as [string, string][]).toString()}`;
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
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
  }, [api, query, cursor, loadingMore]);

  const filtered = filter !== "all" || !!debounced;
  return (
    <div>
      <PageHeader
        title="Customers"
        description={counts.data && !filtered ? `${formatNumber(counts.data.all)} members · ${formatNumber(counts.data.canText)} can be texted · phone numbers are masked and reveals are logged` : total != null ? `${formatNumber(total)} ${filtered ? "matching" : "members"} · phone numbers are masked and reveals are logged` : "Everyone in your program"}
        actions={
          role !== "staff" && (canImport || enabled("customers.csv_export")) ? (
            <>
              {canImport ? (
                <ToolbarButton icon={Upload} href={`${base}/customers/import`}>
                  Import
                </ToolbarButton>
              ) : null}
              {enabled("customers.csv_export") ? (
                <ToolbarButton icon={Download} href={exportHref}>
                  Export
                </ToolbarButton>
              ) : null}
            </>
          ) : undefined
        }
      />

      <div className="mb-5">
        <Capsules label="Filters" options={filters} value={filter} onChange={setFilter} />
      </div>

      {error && !rows.length ? (
        <ListError title="We could not load your customers." onRetry={() => setNonce((n) => n + 1)} detail={error} />
      ) : loading && !rows.length ? (
        <ListLoading label="Loading customers" rows={8} />
      ) : !rows.length ? (
        filtered ? (
          <EmptyState
            title="No customers match."
            description="Try a different filter or search."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQ("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No customers yet."
            description="They join when they scan your QR stand or give their number at the counter."
            action={
              <Button href={`${base}/locations`} size="sm">
                Print your QR stand
              </Button>
            }
          />
        )
      ) : (
        <>
          {error ? <ListError className="mb-3" title="We could not load more customers." onRetry={() => setNonce((n) => n + 1)} detail={error} /> : null}
          <CustomersGrid
            rows={rows}
            term={term}
            goal={goal}
            openId={open}
            onOpen={setOpen}
            total={total}
            hasMore={!!cursor}
            fetchingMore={loadingMore}
            onFetchMore={loadMore}
            busy={loading}
          />
        </>
      )}

      {rows.length ? (
        <div className="mt-3 flex items-center justify-between text-meta text-fg-muted">
          <span className="tabular">
            Showing {formatNumber(rows.length)}
            {total != null ? ` of ${formatNumber(total)}` : ""}
          </span>
          {cursor ? (
            <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMore}>
              Load more
            </Button>
          ) : null}
        </div>
      ) : null}

      <CustomerPanel memberId={open} onClose={() => setOpen(null)} onChanged={() => setNonce((n) => n + 1)} />
    </div>
  );
}

function CustomerPanel({ memberId, onClose, onChanged }: { memberId: string | null; onClose: () => void; onChanged: () => void }) {
  const { api, base } = useMerchant();
  const state = useApi(memberId ? () => api.customer(memberId) : null, [api, memberId]);
  const rewards = useApi(memberId ? () => api.rewards() : null, [api, !!memberId]);
  const d = state.data && state.data.customer.memberId === memberId ? state.data : null;
  return (
    <SidePanel
      open={!!memberId}
      onClose={onClose}
      label="Customer"
      title={d ? (d.customer.name ?? "No name") : "Customer"}
      subtitle={d ? `Member since ${formatDate(d.customer.joinedAt)}` : undefined}
      footer={
        memberId ? (
          <Link href={`${base}/customers/${memberId}`} className="text-meta font-medium text-fg-muted hover:text-fg">
            Open full page
          </Link>
        ) : null
      }
    >
      <Async state={{ ...state, data: d }} skeleton={<SkeletonRows rows={6} />}>
        {(x) => (
          <CustomerView
            key={x.customer.memberId}
            layout="panel"
            d={x}
            rewards={rewards.data?.items ?? []}
            onChange={(n) => state.setData(n)}
            reload={async () => {
              await state.reload();
              onChanged();
            }}
          />
        )}
      </Async>
    </SidePanel>
  );
}
