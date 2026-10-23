"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SkeletonRows } from "@/components/dashboard/kit";

export interface ListRow {
  key: string;
  title: ReactNode;
  meta?: string;
  trailing?: ReactNode;
  href?: string;
}

/** Home list: a title row over a hairline, 12 px rows with a 12 px meta line, the answer right-aligned. */
export function ListSection({ title, right, rows, empty, loading, footer }: { title: string; right?: ReactNode; rows: ListRow[]; empty?: ReactNode; loading?: boolean; footer?: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2.5">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {right ? <span className="truncate text-[13px] text-fg-muted">{right}</span> : null}
      </div>
      {loading ? (
        <SkeletonRows rows={4} />
      ) : rows.length === 0 ? (
        <p className="border-b border-line py-3 text-[14px] text-fg-muted">{empty}</p>
      ) : (
        <ul>
          {rows.map((r) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1 text-fg">
                  <span className="block truncate">{r.title}</span>
                  {r.meta ? <small className="mt-0.5 block truncate text-[12px] text-fg-muted">{r.meta}</small> : null}
                </span>
                {r.trailing != null ? <span className="shrink-0 text-[14px] font-medium tabular">{r.trailing}</span> : null}
              </>
            );
            const cls = "flex items-center justify-between gap-3 border-b border-line py-3 text-[14px]";
            return <li key={r.key}>{r.href ? <Link href={r.href} className={cn(cls, "hover:bg-bg-subtle focus-visible:focus-ring")}>{inner}</Link> : <div className={cls}>{inner}</div>}</li>;
          })}
        </ul>
      )}
      {footer ? <div className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-[12px] text-fg-muted">{footer}</div> : null}
    </section>
  );
}
