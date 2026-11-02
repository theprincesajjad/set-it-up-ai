"use client";
/**
 * The admin's server-side data table (wave Q, team admin) on the ReUI Data Grid (TanStack Table v9, components/reui/data-grid): sortable
 * column headers that ask the server to sort, page numbers and a rows-per-page switch, skeleton rows while a page loads, a real empty
 * state, and a row that opens on click, Enter or Space. Below md it is a list of rows (title, meta, trailing) with Previous / Next, because
 * a wide grid does not read on a phone.
 *
 * The page owns the query: it passes `rows` for the current page, `total`, and the `sort` / `page` state, and refetches when they change.
 */
import { useTable, type ColumnDef, type PaginationState, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { DataGrid, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { useMinWidth } from "@/components/dashboard/customers/useMinWidth";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AdminColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** The server sort key this column sorts by (omit: not sortable). */
  sortKey?: string;
  align?: "start" | "end";
  /** Width in px at desktop. */
  size?: number;
}

export interface AdminGridProps<T> {
  label: string;
  columns: AdminColumn<T>[];
  rows: T[];
  total: number;
  rowKey: (row: T) => string;
  loading?: boolean;
  /** The server sort: key and direction. */
  sort: { key: string; dir: "asc" | "desc" };
  onSortChange: (s: { key: string; dir: "asc" | "desc" }) => void;
  page: PaginationState;
  onPageChange: (p: PaginationState) => void;
  onRowClick?: (row: T) => void;
  empty: ReactNode;
  /** The phone row: title, meta and trailing. */
  mobile: (row: T) => { title: ReactNode; meta?: ReactNode; trailing?: ReactNode };
  toolbar?: ReactNode;
  pageSizes?: number[];
}

function SortHeader({ title, dir, onClick, align }: { title: string; dir: false | "asc" | "desc"; onClick: () => void; align?: "start" | "end" }) {
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${title}${dir ? `, sorted ${dir === "asc" ? "low to high" : "high to low"}` : ", sort"}`}
      className={cn("relative -mx-2 inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-caption font-medium text-fg-muted hover:text-fg focus-visible:focus-ring", dir && "text-fg", align === "end" && "flex-row-reverse")}
    >
      {title}
      <Icon aria-hidden className={cn("size-3", !dir && "opacity-50")} />
    </button>
  );
}

export function AdminGrid<T extends object>({ label, columns, rows, total, rowKey, loading, sort, onSortChange, page, onPageChange, onRowClick, empty, mobile, toolbar, pageSizes = [25, 50, 100] }: AdminGridProps<T>) {
  const md = useMinWidth(768);
  const sorting: SortingState = [{ id: columns.find((c) => c.sortKey === sort.key)?.id ?? sort.key, desc: sort.dir === "desc" }];
  const defs = useMemo<ColumnDef<DataGridFeatures, T>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        accessorFn: () => null,
        size: c.size ?? 140,
        enableSorting: !!c.sortKey,
        meta: c.align === "end" ? { cellClassName: "text-end", headerClassName: "text-end" } : undefined,
        header: ({ column }) =>
          c.sortKey ? (
            <div className={cn("flex", c.align === "end" && "justify-end")}>
              <SortHeader
                title={c.header}
                align={c.align}
                dir={column.getIsSorted()}
                onClick={() => {
                  const on = sort.key === c.sortKey;
                  onSortChange({ key: c.sortKey!, dir: on && sort.dir === "desc" ? "asc" : "desc" });
                }}
              />
            </div>
          ) : (
            <span className={cn("block text-caption font-medium text-fg-muted", c.align === "end" && "text-end")}>{c.header}</span>
          ),
        cell: ({ row }) => c.cell(row.original),
      })),
    [columns, sort.key, sort.dir, onSortChange],
  );
  const table = useTable({
    features: dataGridFeatures,
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    columns: defs,
    data: rows,
    getRowId: (r: T) => rowKey(r),
    state: { sorting, pagination: page },
    onPaginationChange: (u) => onPageChange(typeof u === "function" ? u(page) : u),
    onSortingChange: () => undefined,
  });
  const from = total ? page.pageIndex * page.pageSize + 1 : 0;
  const to = Math.min(total, (page.pageIndex + 1) * page.pageSize);
  const pages = Math.max(1, Math.ceil(total / page.pageSize));

  return (
    <div className="flex flex-col gap-3">
      {toolbar}
      {md ? (
        <div className={cn("admin-grid overflow-hidden rounded-card border border-line bg-card transition-opacity", loading && rows.length > 0 && "opacity-60")}>
          <DataGrid
            table={table}
            recordCount={total}
            label={label}
            isLoading={loading && rows.length === 0}
            loadingMode="skeleton"
            emptyMessage={empty}
            onRowClick={onRowClick}
            tableLayout={{ width: "fixed", headerSticky: false, rowBorder: true, headerBackground: true, dense: false }}
            tableClassNames={{ headerRow: "bg-bg-subtle [&>th]:border-line [&>th:first-child]:ps-4 [&>th:last-child]:pe-4", bodyRow: "cursor-pointer hover:bg-bg-subtle [&>td]:h-14 [&>td]:border-line [&>td:first-child]:ps-4 [&>td:last-child]:pe-4" }}
            i18n={{ labels: { rowsPerPage: "Rows per page", paginationInfo: ({ from: f, to: t, count }) => `${formatNumber(f)}–${formatNumber(t)} of ${formatNumber(count)}` } }}
          >
            <DataGridTable />
            {total > 0 ? (
              <div className="border-t border-line px-4 py-2">
                <DataGridPagination sizes={pageSizes} />
              </div>
            ) : null}
          </DataGrid>
        </div>
      ) : (
        <div className={cn("rounded-card border border-line bg-card transition-opacity", loading && rows.length > 0 && "opacity-60")}>
          {loading && !rows.length ? (
            <div role="status" aria-busy="true" aria-label={`Loading ${label.toLowerCase()}`} className="divide-y divide-line">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex h-16 items-center gap-3 px-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          ) : rows.length ? (
            <ul aria-label={label} className="divide-y divide-line">
              {rows.map((r) => {
                const m = mobile(r);
                return (
                  <li key={rowKey(r)}>
                    <button type="button" onClick={() => onRowClick?.(r)} className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-bg-subtle focus-visible:focus-ring focus-visible:-outline-offset-2">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body font-[550] text-fg">{m.title}</span>
                        {m.meta ? <span className="truncate text-meta text-fg-muted">{m.meta}</span> : null}
                      </span>
                      {m.trailing ? <span className="shrink-0">{m.trailing}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            empty
          )}
          {total > page.pageSize ? (
            <div className="flex items-center justify-between gap-3 border-t border-line px-2 py-1">
              <button type="button" disabled={page.pageIndex === 0} onClick={() => onPageChange({ ...page, pageIndex: page.pageIndex - 1 })} className="inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-meta font-medium text-fg hover:bg-accent focus-visible:focus-ring disabled:opacity-40">
                <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" /> Previous
              </button>
              <span className="text-meta tabular-nums text-fg-muted">
                {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
              </span>
              <button type="button" disabled={page.pageIndex >= pages - 1} onClick={() => onPageChange({ ...page, pageIndex: page.pageIndex + 1 })} className="inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-meta font-medium text-fg hover:bg-accent focus-visible:focus-ring disabled:opacity-40">
                Next <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
