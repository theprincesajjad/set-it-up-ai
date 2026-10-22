"use client";
import { ArrowDown, ArrowUp, Download, Search, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { merchantApi } from "@ll/shared";
import { CustomerView } from "@/components/dashboard/customers/CustomerView";
import { Capsules, Dot, Empty, ErrorLine, PageHeader, SidePanel, SkeletonRows, Table, TableWrap, Td, Th, ToolbarButton, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { BFF_BASE } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDate, formatNumber, formatPoints } from "@/lib/format";
import { CONSENT_LABEL, consentState, filterQuery, maskPhone, type CustomerFilter } from "@/lib/dashboard/customers";
import { useApi } from "@/lib/dashboard/useApi";
import { relativeTime } from "@/lib/dashboard/time";

type SortKey = "name" | "balance" | "visits" | "last" | "joined";

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
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [rows, setRows] = useState<merchantApi.CustomerSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [nonce, setNonce] = useState(0);
  const term = detail.program?.terminology ?? "points";
  const marketing = enabled("marketing.email") || enabled("marketing.sms");
  const vip = enabled("loyalty.vip_levels");

  const filters = useMemo(() => {
    const f: { value: CustomerFilter; label: string }[] = [
      { value: "all", label: "All" },
      { value: "reward", label: "Reward ready" },
      { value: "new", label: "New (30 days)" },
      { value: "at_risk", label: "At risk" },
    ];
    if (vip) f.push({ value: "vip", label: "VIP" });
    if (marketing) f.push({ value: "opted_in", label: "Opted in to messages" }, { value: "muted", label: "Muted" });
    return f;
  }, [vip, marketing]);

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

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const v = (c: merchantApi.CustomerSummary): string | number =>
      sort.key === "name" ? (c.name ?? "").toLowerCase() : sort.key === "balance" ? c.balance : sort.key === "visits" ? c.visitCount : sort.key === "last" ? (c.lastVisitAt ?? "") : c.joinedAt;
    return [...rows].sort((a, b) => (v(a) < v(b) ? -sort.dir : v(a) > v(b) ? sort.dir : 0));
  }, [rows, sort]);

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
  const sortTh = (key: SortKey, label: string, align: "start" | "end" = "start", cls?: string) => {
    const on = sort?.key === key;
    return (
      <Th align={align} className={cls} aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => setSort((s) => (s?.key === key ? (s.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }))} className={`inline-flex items-center gap-1 hover:text-fg ${on ? "text-fg" : ""}`}>
          {label}
          {on ? sort!.dir === 1 ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" /> : null}
        </button>
      </Th>
    );
  };

  const filtered = filter !== "all" || !!debounced;
  return (
    <div>
      <PageHeader
        title="Customers"
        description={total != null ? `${formatNumber(total)} ${filtered ? "matching" : "members"} · Reveals and exports are logged` : "Everyone in your program"}
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

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative block md:w-[320px]">
          <span className="sr-only">Search customers</span>
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" strokeWidth={1.75} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, last 4 of phone, email or code"
            className="h-9 w-full rounded-input border border-line bg-bg ps-8 pe-3 text-meta text-fg outline-none placeholder:text-fg-subtle hover:border-line-strong focus:border-fg"
          />
        </label>
        <Capsules label="Filters" options={filters} value={filter} onChange={setFilter} />
      </div>

      {error ? <ErrorLine message={error} onRetry={() => setNonce((n) => n + 1)} /> : null}

      {loading && !rows.length ? (
        <SkeletonRows rows={8} />
      ) : !rows.length ? (
        filtered ? (
          <Empty className="border-y border-line" action={<button type="button" className="text-meta font-medium text-fg hover:underline" onClick={() => { setQ(""); setFilter("all"); }}>Clear filters</button>}>
            No customers match.
          </Empty>
        ) : (
          <Empty className="border-y border-line" action={<Link href={`${base}/locations`} className="text-meta font-medium text-fg hover:underline">Print your QR stand</Link>}>
            No customers yet. They join when they scan your QR stand or give their number at the counter.
          </Empty>
        )
      ) : (
        <TableWrap className={loading ? "opacity-60 transition-opacity" : undefined}>
          <Table label="Customers">
            <thead>
              <tr>
                {sortTh("name", "Name")}
                <Th className="hidden md:table-cell">Phone</Th>
                {sortTh("balance", "Balance", "end")}
                {sortTh("visits", "Visits", "end", "hidden sm:table-cell")}
                {sortTh("last", "Last visit", "start", "hidden md:table-cell")}
                {sortTh("joined", "Joined", "start", "hidden lg:table-cell")}
                {marketing ? <Th className="hidden lg:table-cell">Messages</Th> : null}
                {vip ? <Th className="hidden lg:table-cell">VIP</Th> : null}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const s = consentState(c);
                return (
                  <Tr key={c.memberId} onOpen={() => setOpen(c.memberId)} selected={open === c.memberId} aria-label={c.name ?? "No name"}>
                    <Td className="max-w-[260px]">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{c.name ?? <span className="text-fg-muted">No name</span>}</span>
                        {c.rewardAvailable ? <Dot tone="accent" className="text-caption font-normal text-fg-muted">Reward ready</Dot> : null}
                      </span>
                      <span className="block truncate text-caption font-normal text-fg-muted md:hidden">{c.lastVisitAt ? `Last visit ${relativeTime(c.lastVisitAt)}` : "No visits yet"}</span>
                    </Td>
                    <Td className="hidden text-fg-muted tabular md:table-cell">{maskPhone(c.phone)}</Td>
                    <Td align="end">{formatPoints(c.balance, term)}</Td>
                    <Td align="end" className="hidden sm:table-cell">{formatNumber(c.visitCount)}</Td>
                    <Td className="hidden text-fg-muted md:table-cell">{c.lastVisitAt ? relativeTime(c.lastVisitAt) : "No visits yet"}</Td>
                    <Td className="hidden text-fg-muted lg:table-cell">{formatDate(c.joinedAt)}</Td>
                    {marketing ? (
                      <Td className="hidden lg:table-cell">
                        <Dot tone={s === "opted_in" ? "positive" : "neutral"}>{CONSENT_LABEL[s]}</Dot>
                      </Td>
                    ) : null}
                    {vip ? <Td className="hidden text-fg-muted lg:table-cell">{c.vipLevel?.name ?? "–"}</Td> : null}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {rows.length ? (
        <div className="mt-3 flex items-center justify-between text-meta text-fg-muted">
          <span className="tabular">
            Showing {formatNumber(rows.length)}
            {total != null ? ` of ${formatNumber(total)}` : ""}
          </span>
          {cursor ? (
            <button
              type="button"
              disabled={loadingMore}
              className="inline-flex h-8 items-center rounded-full border border-line px-3 font-medium text-fg transition-colors hover:bg-bg-subtle disabled:opacity-50 focus-visible:focus-ring"
              onClick={async () => {
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
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
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
