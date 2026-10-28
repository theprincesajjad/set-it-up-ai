"use client";
/**
 * Customers list on the ReUI Data Grid (TanStack Table v9 + virtual rows). Budget from docs/design/v3-spikes.md section 3:
 * at most 60 rows mounted, sort of 10,000 rows within 250 ms, 55 fps average while scrolling at 6,000 px/s.
 *
 * The data stays on the server's cursor pagination: `onFetchMore` asks the page for the next 50 as the last rows scroll into view.
 * Sorting is over the rows already loaded, as before. Row click, Enter and Space open the detail sheet; the arrow keys move
 * between rows (local patch in reui/data-grid/data-grid-table.tsx).
 */
import { useTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { merchantApi } from "@ll/shared";
import { Avatar } from "@/components/ui/Avatar";
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridTableVirtual } from "@/components/reui/data-grid/data-grid-table-virtual";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { maskPhone, stampProgress } from "@/lib/dashboard/customers";
import { relativeTime } from "@/lib/dashboard/time";
import { useMinWidth } from "./useMinWidth";

type Row = merchantApi.CustomerSummary;
/** Row height of a 40 px avatar with two lines (Figma 12:2 uses 56). */
const ROW = 56;

/** "today", "yesterday", "22 days ago": the Last visit column. */
function lastVisitText(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function SortHeader({ column, title, align = "start" }: { column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc?: boolean) => void; clearSorting: () => void }; title: string; align?: "start" | "end" }) {
  const dir = column.getIsSorted();
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => (dir === "asc" ? column.toggleSorting(true) : dir === "desc" ? column.clearSorting() : column.toggleSorting(false))}
      className={cn("relative -mx-2 inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-caption font-medium text-fg-muted hover:text-fg focus-visible:focus-ring", dir && "text-fg", align === "end" && "flex-row-reverse")}
    >
      {title}
      <Icon aria-hidden className={cn("size-3", !dir && "opacity-50")} />
    </button>
  );
}

export interface CustomersGridProps {
  rows: Row[];
  /** "points", "stamps", ... (the program's terminology). */
  term: string;
  /** Stamp goal when the program earns stamps (0 otherwise). */
  goal: number;
  openId: string | null;
  onOpen: (memberId: string) => void;
  total: number | null;
  hasMore: boolean;
  fetchingMore: boolean;
  onFetchMore: () => void;
  /** Dims the rows while a new filter loads. */
  busy?: boolean;
  /** Viewport height of the scrolling grid. */
  height?: number;
}

export function CustomersGrid({ rows, term, goal, openId, onOpen, total, hasMore, fetchingMore, onFetchMore, busy, height = 640 }: CustomersGridProps) {
  const wide = useMinWidth(640);
  const md = useMinWidth(768);
  const lg = useMinWidth(1024);
  const [sorting, setSorting] = useState<SortingState>([]);
  const wrap = useRef<HTMLDivElement>(null);

  const columns = useMemo<ColumnDef<DataGridFeatures, Row>[]>(
    () => [
      {
        id: "name",
        accessorFn: (c) => (c.name ?? "").toLowerCase(),
        header: ({ column }) => <SortHeader column={column} title="Name" />,
        size: wide ? 340 : 230,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3 py-1">
              <Avatar name={c.name} size={40} />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-body-strong text-fg">{c.name ?? <span className="font-normal text-fg-muted">No name</span>}</span>
                  {c.rewardAvailable ? <span role="img" aria-label="Reward ready" title="Reward ready" className="size-1.5 shrink-0 rounded-full bg-points" /> : null}
                </div>
                <div className="truncate text-meta text-fg-muted tabular">{wide ? <bdi dir="ltr">{maskPhone(c.phone)}</bdi> : c.lastVisitAt ? `Last visit ${relativeTime(c.lastVisitAt)}` : "No visits yet"}</div>
              </div>
            </div>
          );
        },
      },
      {
        id: "balance",
        accessorFn: (c) => c.balance,
        header: ({ column }) => <div className="flex justify-end"><SortHeader column={column} title={term.charAt(0).toUpperCase() + term.slice(1)} align="end" /></div>,
        size: wide ? 130 : 100,
        meta: { cellClassName: "text-end" },
        cell: ({ row }) => {
          const c = row.original;
          return <bdi dir="ltr" className={cn("tabular text-body-strong", c.rewardAvailable ? "text-points-text" : "text-fg")}>{goal ? stampProgress(c.balance, goal) : `${formatNumber(c.balance)} ${term === "points" ? "pts" : term}`}</bdi>;
        },
      },
      {
        id: "visits",
        accessorFn: (c) => c.visits30d,
        header: ({ column }) => <SortHeader column={column} title="Visits, last 30 days" />,
        size: 130,
        cell: ({ row }) => <span className="tabular">{formatNumber(row.original.visits30d)}</span>,
      },
      {
        id: "last",
        accessorFn: (c) => c.lastVisitAt ?? "",
        header: ({ column }) => <SortHeader column={column} title="Last visit" />,
        size: 150,
        cell: ({ row }) => {
          const c = row.original;
          return <span className={cn(c.isSlipping && "text-negative")}>{c.lastVisitAt ? lastVisitText(c.lastVisitAt) : <span className="text-fg-muted">No visits yet</span>}</span>;
        },
      },
      {
        id: "usually",
        enableSorting: false,
        header: () => <span className="text-caption font-medium text-fg-muted">Usual visit time</span>,
        size: 170,
        cell: ({ row }) => <span className="truncate text-fg-muted">{row.original.usually ?? "–"}</span>,
      },
      {
        id: "texts",
        enableSorting: false,
        header: () => <span className="text-caption font-medium text-fg-muted">Text offers</span>,
        size: 120,
        cell: ({ row }) => {
          const c = row.original;
          return <span className={c.marketingConsent && c.phone ? "text-positive-text" : "text-fg-muted"}>{c.marketingConsent && c.phone ? "Can text" : c.muted ? "Muted" : "Hasn't opted in"}</span>;
        },
      },
    ],
    [term, goal, wide],
  );

  const table = useTable({
    features: dataGridFeatures,
    // The rows are already the loaded page(s): manualPagination keeps the pagination APIs without slicing them.
    manualPagination: true,
    columns,
    data: rows,
    getRowId: (r: Row) => r.memberId,
    state: {
      sorting,
      columnVisibility: { visits: wide, last: md, usually: lg, texts: md },
    },
    onSortingChange: setSorting,
  });

  // Rows are memoised inside the grid and do not re-render when `openId` changes, so the open row's aria-selected and the single
  // tab stop are kept on the DOM here. Virtualised rows mount and unmount while scrolling, hence the observer.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const apply = () => {
      const trs = el.querySelectorAll<HTMLTableRowElement>("tbody tr[data-row-id]");
      let stop: HTMLTableRowElement | null = null;
      trs.forEach((tr) => {
        const on = tr.dataset.rowId === openId;
        tr.setAttribute("aria-selected", on ? "true" : "false");
        if (on) stop = tr;
      });
      const focused = document.activeElement;
      const tabStop = stop ?? (focused instanceof HTMLTableRowElement && el.contains(focused) ? focused : trs[0]);
      trs.forEach((tr) => tr.setAttribute("tabindex", tr === tabStop ? "0" : "-1"));
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener("focusin", apply);
    return () => {
      mo.disconnect();
      el.removeEventListener("focusin", apply);
    };
  }, [openId]);

  return (
    <div ref={wrap} className={cn("overflow-hidden rounded-card border border-line bg-card transition-opacity", busy && "opacity-60")}>
      <DataGrid
        table={table}
        recordCount={total ?? rows.length}
        label="Customers"
        onRowClick={(r) => onOpen(r.memberId)}
        tableLayout={{ width: "fixed", headerSticky: true, rowBorder: true, headerBackground: true, dense: true }}
        tableClassNames={{ headerSticky: "sticky top-0 z-10 bg-bg-subtle", headerRow: "bg-bg-subtle [&>th]:border-line [&>th:first-child]:ps-4 [&>th:last-child]:pe-4", bodyRow: "[&>td]:border-line [&>td:first-child]:ps-4 [&>td:last-child]:pe-4" }}
        i18n={{ labels: { allRowsLoaded: "All customers loaded", loading: "Loading more customers" } }}
        allRowsLoadedMessage={null}
      >
        <DataGridTableVirtual estimateSize={ROW} overscan={12} height={Math.min(height, rows.length * (ROW + 4) + 56)} onFetchMore={onFetchMore} isFetchingMore={fetchingMore} hasMore={hasMore} fetchMoreOffset={4} />
      </DataGrid>
    </div>
  );
}
