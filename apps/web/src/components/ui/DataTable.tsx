"use client";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ErrorLine } from "@/components/dashboard/kit";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Value used for client-side sorting. Omit to make the column unsortable. */
  sortValue?: (row: T) => string | number | null;
  align?: "start" | "end";
  /** Shown in the mobile ListRow: "title" (one), "subtitle" (up to two), "trailing" (one). */
  mobile?: "title" | "subtitle" | "trailing" | "hidden";
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  /** Cursor pagination. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  /** "Showing 1-50 of 1,204". */
  summary?: string;
  toolbar?: ReactNode;
}

/**
 * Dashboard table (system.md §6 DataTable): sticky sortable header, 44px rows,
 * right-aligned numbers; collapses into list rows below md.
 */
export function DataTable<T>({ columns, rows, rowKey, caption, loading, error, onRetry, empty, onRowClick, selectedKey, hasMore, onLoadMore, loadingMore, summary, toolbar }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = sv(a);
      const y = sv(b);
      const r = x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1;
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const toggle = (key: string) => setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0];
  const subCols = columns.filter((c) => c.mobile === "subtitle").slice(0, 2);
  const trailCol = columns.find((c) => c.mobile === "trailing");

  return (
    <div className="flex flex-col gap-3">
      {toolbar}
      {error ? (
        <ErrorLine message={error} onRetry={onRetry} />
      ) : null}
      <div className="hidden overflow-x-auto border-y border-line bg-bg md:block">
        <table className="w-full border-collapse text-meta">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-sticky bg-bg-subtle">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined} className={cn("h-10 px-4 text-meta-strong text-fg-muted", c.align === "end" ? "text-end" : "text-start")}>
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggle(c.key)} className="inline-flex min-h-10 items-center gap-1 hover:text-fg focus-visible:focus-ring">
                        {c.header}
                        <Icon aria-hidden className="size-3.5" />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="h-11 border-t border-line">
                    {columns.map((c) => (
                      <td key={c.key} className="px-4">
                        <Skeleton className="h-3 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((r) => {
                  const k = rowKey(r);
                  return (
                    <tr
                      key={k}
                      onClick={onRowClick ? () => onRowClick(r) : undefined}
                      className={cn("h-11 border-t border-line transition-colors hover:bg-bg-subtle", onRowClick && "cursor-pointer", selectedKey === k && "bg-bg-muted")}
                    >
                      {columns.map((c) => (
                        <td key={c.key} className={cn("px-4 text-fg", c.align === "end" && "text-end tabular-nums", c.className)}>
                          {c.cell(r)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? <div className="border-t border-line">{empty}</div> : null}
      </div>

      {/* < md: list rows */}
      <ul aria-label={caption} className="flex flex-col divide-y divide-line border-y border-line bg-bg md:hidden">
        {loading
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="py-3">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="mt-2 h-3 w-4/5" />
              </li>
            ))
          : sorted.map((r) => (
              <li key={rowKey(r)}>
                <button type="button" disabled={!onRowClick} onClick={onRowClick ? () => onRowClick(r) : undefined} className="flex min-h-16 w-full items-center gap-3 py-2 text-start focus-visible:focus-ring">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-strong text-fg">{titleCol?.cell(r)}</div>
                    {subCols.length ? (
                      <div className="truncate text-meta text-fg-muted">
                        {subCols.map((c, i) => (
                          <span key={c.key}>
                            {i > 0 ? " · " : ""}
                            {c.cell(r)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {trailCol ? <div className="shrink-0 tabular-nums text-fg">{trailCol.cell(r)}</div> : null}
                </button>
              </li>
            ))}
        {!loading && rows.length === 0 ? <li>{empty}</li> : null}
      </ul>

      <div className="flex items-center justify-between gap-3">
        {summary ? <p className="text-caption text-fg-muted">{summary}</p> : <span />}
        {hasMore && onLoadMore ? (
          <Button variant="secondary" size="sm" loading={loadingMore} onClick={onLoadMore}>
            Load more
          </Button>
        ) : null}
      </div>
    </div>
  );
}
