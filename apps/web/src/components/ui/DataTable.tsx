"use client";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/primitives/table";
import { ListError } from "@/components/dashboard/ListStates";
import { cn } from "@/lib/utils";
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
 * Dashboard table (system.md section 6 DataTable), built on the shadcn Table: sticky sortable header, 44 px rows, right-aligned numbers;
 * collapses into list rows below md.
 *
 * Keyboard: the table is one tab stop (the open row, else the first). Up and Down move between rows, Home and End jump to the ends,
 * Enter or Space opens the row (`onRowClick`); the sheet it opens restores focus to the row when it closes.
 * All three states are built in: `loading` (skeleton rows of the same height), `error` (what happened and Try again), `empty` (your node).
 */
export function DataTable<T>({ columns, rows, rowKey, caption, loading, error, onRetry, empty, onRowClick, selectedKey, hasMore, onLoadMore, loadingMore, summary, toolbar }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const body = useRef<HTMLTableSectionElement>(null);
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
  const keys = sorted.map(rowKey);
  // One tab stop: the open row if it is in the list, else the first.
  const stop = selectedKey && keys.includes(selectedKey) ? selectedKey : keys[0];

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, r: T) => {
    if (e.target !== e.currentTarget) return;
    if ((e.key === "Enter" || e.key === " ") && onRowClick) {
      e.preventDefault();
      onRowClick(r);
      return;
    }
    const trs = Array.from(body.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row]") ?? []);
    const at = trs.indexOf(e.currentTarget);
    const next = e.key === "ArrowDown" ? trs[at + 1] : e.key === "ArrowUp" ? trs[at - 1] : e.key === "Home" ? trs[0] : e.key === "End" ? trs[trs.length - 1] : undefined;
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {toolbar}
      {error ? <ListError detail={error} onRetry={onRetry} /> : null}
      <div data-slot="data-table" className="hidden border-y border-line bg-bg md:block">
        <Table className="border-collapse text-meta">
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader className="sticky top-0 z-sticky bg-bg-subtle [&_tr]:border-b-0">
            <TableRow className="border-b-0 hover:bg-bg-subtle">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <TableHead key={c.key} scope="col" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined} className={cn("h-10 px-4 text-meta-strong text-fg-muted", c.align === "end" ? "text-end" : "text-start")}>
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggle(c.key)} className="inline-flex min-h-11 items-center gap-1 hover:text-fg focus-visible:focus-ring">
                        {c.header}
                        <Icon aria-hidden className="size-3.5" />
                      </button>
                    ) : (
                      c.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody ref={body}>
            {loading
              ? Array.from({ length: 8 }, (_, i) => (
                  <TableRow key={i} data-state="loading" className="h-11 border-t border-line hover:bg-transparent">
                    {columns.map((c) => (
                      <TableCell key={c.key} className="px-4">
                        <Skeleton className="h-3 w-3/4" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : sorted.map((r) => {
                  const k = rowKey(r);
                  const open = selectedKey === k;
                  return (
                    <TableRow
                      key={k}
                      data-row
                      tabIndex={onRowClick ? (k === stop ? 0 : -1) : undefined}
                      aria-selected={onRowClick ? open : undefined}
                      onClick={onRowClick ? () => onRowClick(r) : undefined}
                      onKeyDown={onRowClick ? (e) => onRowKey(e, r) : undefined}
                      className={cn("h-11 border-t border-line transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:outline-none focus-visible:focus-ring", onRowClick && "cursor-pointer", open && "bg-bg-muted")}
                    >
                      {columns.map((c) => (
                        <TableCell key={c.key} className={cn("px-4 text-fg", c.align === "end" && "text-end tabular-nums", c.className)}>
                          {c.cell(r)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
        {!loading && !error && rows.length === 0 ? <div className="border-t border-line">{empty}</div> : null}
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
                      <div className="text-meta text-fg-muted">
                        {/* One line per column: a bar or a chip next to a dangling " · " read as a broken row. */}
                        {subCols.map((c) => (
                          <div key={c.key} className="truncate">
                            {c.cell(r)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {trailCol ? <div className="shrink-0 tabular-nums text-fg">{trailCol.cell(r)}</div> : null}
                </button>
              </li>
            ))}
        {!loading && !error && rows.length === 0 ? <li>{empty}</li> : null}
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
